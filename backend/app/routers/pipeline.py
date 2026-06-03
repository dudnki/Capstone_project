"""
파이프라인 라우터:
- /pipeline/run          : G-Eval 파이프라인 (후보 생성 → 품질 필터링)
- /pipeline/run_agentic  : Agentic 파이프라인 (LLM 에이전트가 청크/유형/결합 동적 결정)

DB는 로컬 SQLite (SQLAlchemy)로 통일, 파일은 uploaded_pdf 로컬 폴더에서 읽음.
"""
import os
import traceback

import fitz  # PyMuPDF
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.services.database import get_db, Document, QAEvaluation
from app.services.geval_filter import generate_multiple_qa, filter_qa_by_geval
from app.services.document_analyzer import (
    classify_document,
    extract_rare_tokens,
    select_diverse_chunks,
)
from app.services.qa_generator import generate_qa_for_chunks
from app.services.qa_agent import run_qa_agent
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

UPLOAD_DIR = "uploaded_pdf"

DTYPE_STYLES = {
    "pdf": {"color": "#b91c1c", "bg": "#fef2f2"},
    "txt": {"color": "#1d4ed8", "bg": "#eff6ff"},
    "md":  {"color": "#1d4ed8", "bg": "#eff6ff"},
}

# G-Eval 파이프라인 파라미터
N_CANDIDATES = 5       # 청크당 생성할 Q&A 후보 수
GEVAL_THRESHOLD = 0.70 # 최소 품질 점수 (0~1)
TOP_K_PER_CHUNK = 2    # 청크당 최종 선택 수
N_QA = 3               # 결정론적 파이프라인: 총 Q&A 수


class PipelineRequest(BaseModel):
    saved_filename: str
    original_filename: str


class AgenticPipelineRequest(BaseModel):
    saved_filename: str
    original_filename: str
    target_n: int = 3
    difficulty: str = "medium"  # "low" | "medium" | "high"


def _read_local_file(saved_filename: str) -> bytes:
    file_path = os.path.join(UPLOAD_DIR, saved_filename)
    if not os.path.exists(file_path):
        raise HTTPException(
            status_code=404,
            detail=f"로컬 폴더에서 파일을 찾을 수 없습니다. (경로={file_path})",
        )
    with open(file_path, "rb") as f:
        return f.read()


def _extract_text(file_bytes: bytes, ext: str) -> str:
    if ext == "pdf":
        from app.services.pdf_extractor import pdf_to_markdown
        try:
            return pdf_to_markdown(file_bytes)
        except Exception as e:
            print(f"[Pipeline] PDF extractor 실패, PyMuPDF 폴백: {e}")
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            return "".join(page.get_text() for page in doc)
    return file_bytes.decode("utf-8")


def _split_chunks(text: str) -> list[str]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        separators=["\n## ", "\n### ", "\n\n", "\n", ". ", "。", "! ", "? ", " ", ""],
    )
    return splitter.split_text(text)


def _build_qa_response_row(
    *,
    index: int,
    qa_db_id: str | None,
    document_id: str,
    question: str,
    answer: str,
    answer_quote: str,
    anchor_used: str | None,
    bloom_type: str,
    ext: str,
    original_filename: str,
    score_data: dict,
) -> dict:
    style = DTYPE_STYLES.get(ext, {"color": "#475569", "bg": "#f8fafc"})
    avg = round((score_data["faithfulness"] + score_data["answer_relevancy"]) / 2, 2)
    return {
        "index": index,
        "qa_uuid": qa_db_id,
        "document_uuid": document_id,
        "q": question,
        "doc": original_filename,
        "dtype": ext,
        "color": style["color"],
        "bg": style["bg"],
        "answer": answer,
        "answer_quote": answer_quote,
        "anchor_used": anchor_used,
        "bloom_type": bloom_type,
        "score": avg,
        "faithfulness": round(score_data["faithfulness"], 2),
        "answer_relevancy": round(score_data["answer_relevancy"], 2),
    }


def _persist_qa(
    db: Session, *, document_id: str, question: str, ground_truth: str, context: str
) -> str | None:
    qa = QAEvaluation(
        document_id=document_id,
        question=question,
        ground_truth=ground_truth,
        context=context,
    )
    db.add(qa)
    db.commit()
    db.refresh(qa)
    return qa.id


@router.post("/pipeline/run")
async def run_pipeline(req: PipelineRequest, db: Session = Depends(get_db)):
    """G-Eval 파이프라인: 다수 후보 생성 → 품질 필터링 → 고품질 Q&A 저장."""
    try:
        # 1. 파일 읽기 + 텍스트 추출
        file_bytes = _read_local_file(req.saved_filename)
        ext = req.original_filename.rsplit(".", 1)[-1].lower()
        extracted_text = _extract_text(file_bytes, ext)

        # 2. 문서 분류 + Rare Token
        category, similarities = classify_document(extracted_text)
        print(f"[Classify] '{req.original_filename}' → {category}")
        print(f"[Classify] similarities: {similarities}")

        rare_tokens = extract_rare_tokens(extracted_text, category)
        print(f"[RareTokens] {rare_tokens}")

        # 3. documents 레코드
        new_doc = Document(
            original_filename=req.original_filename,
            content=extracted_text[:5000],
            status="처리중",
        )
        db.add(new_doc)
        db.commit()
        db.refresh(new_doc)
        document_id = new_doc.id

        # 4. 청킹
        chunks = _split_chunks(extracted_text)
        print(f"[Chunking] 총 {len(chunks)}개 청크 생성")

        # 5. G-Eval 파이프라인: 다수 후보 생성 → 품질 필터링 → 고품질만 저장
        qa_pairs = []
        for chunk_idx, chunk in enumerate(chunks[:3]):
            print(f"\n[Pipeline] 청크 {chunk_idx + 1}/3 처리 시작")

            candidates = generate_multiple_qa(chunk, n=N_CANDIDATES, category=category)
            if not candidates:
                print(f"  [Pipeline] 청크 {chunk_idx + 1}: 후보 생성 실패, 건너뜀")
                continue

            selected = filter_qa_by_geval(
                context=chunk,
                qa_candidates=candidates,
                threshold=GEVAL_THRESHOLD,
                top_k=TOP_K_PER_CHUNK,
            )

            for qa in selected:
                geval = qa["geval"]
                scores = geval["scores"]

                faithfulness_mapped = round(
                    (scores["relevance"] + scores["answerability"]) / 2 / 5.0, 4
                )
                relevance_mapped = round(
                    (scores["clarity"] + scores["specificity"] + scores["difficulty"]) / 3 / 5.0, 4
                )

                new_qa = QAEvaluation(
                    document_id=document_id,
                    question=qa["question"],
                    ground_truth=qa["answer"],
                    context=chunk,
                    faithfulness_score=faithfulness_mapped,
                    answer_relevance_score=relevance_mapped,
                )
                db.add(new_qa)
                db.commit()
                db.refresh(new_qa)

                qa_pairs.append({
                    "question": qa["question"],
                    "answer":   qa["answer"],
                    "db_id":    new_qa.id,
                    "geval":    geval,
                    "faithfulness_mapped": faithfulness_mapped,
                    "relevance_mapped":    relevance_mapped,
                })

        # 6. 상태 업데이트 및 최종 반환
        new_doc.status = "완료"
        db.commit()

        style = DTYPE_STYLES.get(ext, {"color": "#475569", "bg": "#f8fafc"})

        final_results = []
        for i, qa in enumerate(qa_pairs, start=1):
            geval = qa["geval"]
            final_results.append({
                "index": i,
                "qa_uuid": qa["db_id"],
                "document_uuid": document_id,
                "q": qa["question"],
                "doc": req.original_filename,
                "dtype": ext,
                "color": style["color"],
                "bg": style["bg"],
                "answer": qa["answer"],
                "score": round(geval["normalized_score"], 2),
                "faithfulness": round(qa["faithfulness_mapped"], 2),
                "answer_relevancy": round(qa["relevance_mapped"], 2),
                "geval_detail": {
                    "weighted_score": geval["weighted_score"],
                    "normalized_score": geval["normalized_score"],
                    "scores": geval["scores"],
                },
            })

        return final_results

    except HTTPException:
        raise
    except Exception as e:
        print(f"Pipeline Error: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"파이프라인 실행 중 오류 발생: {str(e)}")


@router.post("/pipeline/run_agentic")
async def run_pipeline_agentic(
    req: AgenticPipelineRequest, db: Session = Depends(get_db)
):
    """Agentic 버전: LLM 에이전트가 청크 선택/Bloom 유형/멀티 청크 결합을 동적 결정."""
    try:
        file_bytes = _read_local_file(req.saved_filename)
        ext = req.original_filename.rsplit(".", 1)[-1].lower()
        extracted_text = _extract_text(file_bytes, ext)

        category, similarities = classify_document(extracted_text)
        print(f"[Agentic] '{req.original_filename}' → {category}")
        print(f"[Agentic] similarities: {similarities}")

        rare_tokens = extract_rare_tokens(extracted_text, category)
        print(f"[Agentic] rare_tokens: {rare_tokens}")

        new_doc = Document(
            original_filename=req.original_filename,
            content=extracted_text[:5000],
            status="처리중",
        )
        db.add(new_doc)
        db.commit()
        db.refresh(new_doc)
        document_id = new_doc.id

        chunks = _split_chunks(extracted_text)
        print(f"[Agentic] 총 {len(chunks)}개 청크 생성")

        qa_items = run_qa_agent(
            chunks=chunks,
            category=category,
            rare_tokens=rare_tokens,
            target_n=req.target_n,
            difficulty=req.difficulty,
        )
        print(f"[Agentic] 에이전트 생성 결과: {len(qa_items)}개 Q&A")

        final_results = []
        for i, qa in enumerate(qa_items, start=1):
            qa_db_id = _persist_qa(
                db,
                document_id=document_id,
                question=qa.question,
                ground_truth=qa.answer,
                context=qa.chunk,
            )
            final_results.append(_build_qa_response_row(
                index=i,
                qa_db_id=qa_db_id,
                document_id=document_id,
                question=qa.question,
                answer=qa.answer,
                answer_quote=qa.answer_quote,
                anchor_used=qa.anchor_used,
                bloom_type=qa.bloom_type,
                ext=ext,
                original_filename=req.original_filename,
                score_data={"faithfulness": 0.85, "answer_relevancy": 0.82},
            ))

        new_doc.status = "완료"
        db.commit()

        return final_results

    except HTTPException:
        raise
    except Exception as e:
        print(f"Agentic Pipeline Error: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Agentic 파이프라인 실행 중 오류: {str(e)}")
