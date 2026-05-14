"""
파이프라인 라우터:
- /pipeline/run          : 결정론적 파이프라인 (분할 → MMR 선택 → Q&A 생성)
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
from app.services.document_analyzer import (
    classify_document,
    extract_rare_tokens,
    select_diverse_chunks,
)
from app.services.qa_generator import generate_qa_for_chunks
from app.services.qa_agent import run_qa_agent


router = APIRouter()


UPLOAD_DIR = "uploaded_pdf"

DTYPE_STYLES = {
    "pdf": {"color": "#b91c1c", "bg": "#fef2f2"},
    "txt": {"color": "#1d4ed8", "bg": "#eff6ff"},
    "md":  {"color": "#1d4ed8", "bg": "#eff6ff"},
}

N_QA = 3  # 결정론적 파이프라인: 청크당 1 Q&A, 총 N개


class PipelineRequest(BaseModel):
    saved_filename: str
    original_filename: str


class AgenticPipelineRequest(BaseModel):
    saved_filename: str
    original_filename: str
    target_n: int = 3


# RAGAS 실시간 평가 stub — 실제 평가는 /evaluations/submit에서 수행
def evaluate_qa_quality(context: str, question: str, ground_truth: str) -> dict:
    return {"faithfulness": 0.85, "answer_relevancy": 0.82}


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
    """파일 바이트 → 텍스트. PDF는 적응형 추출기, 그 외는 UTF-8 디코딩."""
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
    """RecursiveCharacterTextSplitter — Markdown 헤더/문단/문장 단위."""
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
    """qa_evaluations에 한 행 저장하고 id 반환."""
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
    """결정론적 파이프라인: MMR로 N개 청크 선택 → 청크당 1 Q&A 생성."""
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

        # 4. 청킹 + MMR 선택
        chunks = _split_chunks(extracted_text)
        print(f"[Chunking] 총 {len(chunks)}개 청크 생성")
        selected_chunks = select_diverse_chunks(chunks, n=N_QA)
        print(
            f"[Chunk Select] 전체 {len(chunks)}개 → 선택 {len(selected_chunks)}개 "
            f"(인덱스: {[idx for idx, _ in selected_chunks]})"
        )

        # 5. Q&A 생성
        qa_items = generate_qa_for_chunks(selected_chunks, category, rare_tokens)

        # 6. DB 저장 + 응답 조립
        final_results = []
        for i, qa in enumerate(qa_items, start=1):
            score_data = evaluate_qa_quality(
                context=qa.chunk,
                question=qa.question,
                ground_truth=qa.answer,
            )
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
                score_data=score_data,
            ))

        new_doc.status = "완료"
        db.commit()

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
        )
        print(f"[Agentic] 에이전트 생성 결과: {len(qa_items)}개 Q&A")

        final_results = []
        for i, qa in enumerate(qa_items, start=1):
            score_data = evaluate_qa_quality(
                context=qa.chunk,
                question=qa.question,
                ground_truth=qa.answer,
            )
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
                score_data=score_data,
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
