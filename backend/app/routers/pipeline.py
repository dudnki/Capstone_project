"""
파이프라인 라우터: 문서 업로드 → Q&A 생성 → DB 저장 오케스트레이션.

Q&A 생성 로직은 services/qa_generator.py로 분리.
PDF 추출 / 분류 / 청크 선택 / Rare token 추출은 services/document_analyzer 및 pdf_extractor.
"""
import traceback

import fitz  # PyMuPDF
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.services.supabase_client import supabase_client
from app.services.document_analyzer import (
    classify_document,
    extract_rare_tokens,
    select_diverse_chunks,
)
from app.services.qa_generator import generate_qa_for_chunks
from app.services.qa_agent import run_qa_agent


router = APIRouter()


DTYPE_STYLES = {
    "pdf": {"color": "#b91c1c", "bg": "#fef2f2"},
    "txt": {"color": "#1d4ed8", "bg": "#eff6ff"},
    "md":  {"color": "#1d4ed8", "bg": "#eff6ff"},
}

N_QA = 3  # 청크당 1개 Q&A, 총 N개


class PipelineRequest(BaseModel):
    saved_filename: str
    original_filename: str


class AgenticPipelineRequest(BaseModel):
    saved_filename: str
    original_filename: str
    target_n: int = 3


# RAGAS 평가 stub (실제 평가 로직 연결 전까지 고정값)
def evaluate_qa_quality(context: str, question: str, ground_truth: str) -> dict:
    return {"faithfulness": 0.85, "answer_relevancy": 0.82}


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


@router.post("/pipeline/run")
async def run_pipeline(req: PipelineRequest):
    try:
        # 1. 파일 다운로드 및 텍스트 추출
        file_bytes = supabase_client.storage.from_("documents").download(req.saved_filename)
        if not file_bytes:
            raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다.")

        ext = req.original_filename.rsplit(".", 1)[-1].lower()
        extracted_text = _extract_text(file_bytes, ext)

        # 2. 문서 분류 + Rare Token 추출
        category, similarities = classify_document(extracted_text)
        print(f"[Classify] '{req.original_filename}' → {category}")
        print(f"[Classify] similarities: {similarities}")

        rare_tokens = extract_rare_tokens(extracted_text, category)
        print(f"[RareTokens] {rare_tokens}")

        # 3. DB documents 테이블 기록
        doc_insert_res = supabase_client.table("documents").insert({
            "content": extracted_text[:5000],
            "original_filename": req.original_filename,
            "status": "처리중",
        }).execute()
        document_id = doc_insert_res.data[0]["id"]

        # 4. 청킹 + 다양성 선택
        chunks = _split_chunks(extracted_text)
        print(f"[Chunking] 총 {len(chunks)}개 청크 생성")

        selected_chunks = select_diverse_chunks(chunks, n=N_QA)
        print(
            f"[Chunk Select] 전체 {len(chunks)}개 → 선택 {len(selected_chunks)}개 "
            f"(인덱스: {[idx for idx, _ in selected_chunks]})"
        )

        # 5. Q&A 생성
        qa_items = generate_qa_for_chunks(selected_chunks, category, rare_tokens)

        # 6. DB 저장 + 결과 조립
        style = DTYPE_STYLES.get(ext, {"color": "#475569", "bg": "#f8fafc"})
        final_results = []

        for i, qa in enumerate(qa_items, start=1):
            score_data = evaluate_qa_quality(
                context=qa.chunk,
                question=qa.question,
                ground_truth=qa.answer,
            )

            qa_insert_res = supabase_client.table("qa_evaluations").insert({
                "document_id": document_id,
                "question": qa.question,
                "ground_truth": qa.answer,
                "context": qa.chunk,
            }).execute()

            db_id = qa_insert_res.data[0]["id"] if qa_insert_res.data else None
            avg_score = round(
                (score_data["faithfulness"] + score_data["answer_relevancy"]) / 2, 2
            )

            final_results.append({
                "index": i,
                "qa_uuid": db_id,
                "document_uuid": document_id,
                "q": qa.question,
                "doc": req.original_filename,
                "dtype": ext,
                "color": style["color"],
                "bg": style["bg"],
                "answer": qa.answer,
                "answer_quote": qa.answer_quote,
                "anchor_used": qa.anchor_used,
                "bloom_type": qa.bloom_type,
                "score": avg_score,
                "faithfulness": round(score_data["faithfulness"], 2),
                "answer_relevancy": round(score_data["answer_relevancy"], 2),
            })

        # 7. 상태 업데이트
        supabase_client.table("documents").update({"status": "완료"}).eq("id", document_id).execute()

        return final_results

    except HTTPException:
        raise
    except Exception as e:
        print(f"Pipeline Error: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"파이프라인 실행 중 오류 발생: {str(e)}")


@router.post("/pipeline/run_agentic")
async def run_pipeline_agentic(req: AgenticPipelineRequest):
    """
    Agentic 버전: LLM 에이전트가 청크 선택/Bloom 유형/멀티 청크 결합을 동적으로 결정.
    기존 /pipeline/run 과 동일한 응답 스키마.
    """
    try:
        # 1. 파일 다운로드 및 텍스트 추출
        file_bytes = supabase_client.storage.from_("documents").download(req.saved_filename)
        if not file_bytes:
            raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다.")

        ext = req.original_filename.rsplit(".", 1)[-1].lower()
        extracted_text = _extract_text(file_bytes, ext)

        # 2. 문서 분류 + Rare Token 추출
        category, similarities = classify_document(extracted_text)
        print(f"[Agentic] '{req.original_filename}' → {category}")
        print(f"[Agentic] similarities: {similarities}")

        rare_tokens = extract_rare_tokens(extracted_text, category)
        print(f"[Agentic] rare_tokens: {rare_tokens}")

        # 3. DB documents 레코드
        doc_insert_res = supabase_client.table("documents").insert({
            "content": extracted_text[:5000],
            "original_filename": req.original_filename,
            "status": "처리중",
        }).execute()
        document_id = doc_insert_res.data[0]["id"]

        # 4. 청킹 (전체 — 에이전트가 valid 필터링과 선택을 함)
        chunks = _split_chunks(extracted_text)
        print(f"[Agentic] 총 {len(chunks)}개 청크 생성")

        # 5. 에이전트 실행
        qa_items = run_qa_agent(
            chunks=chunks,
            category=category,
            rare_tokens=rare_tokens,
            target_n=req.target_n,
        )
        print(f"[Agentic] 에이전트 생성 결과: {len(qa_items)}개 Q&A")

        # 6. DB 저장 + 응답 조립
        style = DTYPE_STYLES.get(ext, {"color": "#475569", "bg": "#f8fafc"})
        final_results = []

        for i, qa in enumerate(qa_items, start=1):
            score_data = evaluate_qa_quality(
                context=qa.chunk,
                question=qa.question,
                ground_truth=qa.answer,
            )

            qa_insert_res = supabase_client.table("qa_evaluations").insert({
                "document_id": document_id,
                "question": qa.question,
                "ground_truth": qa.answer,
                "context": qa.chunk,
            }).execute()

            db_id = qa_insert_res.data[0]["id"] if qa_insert_res.data else None
            avg_score = round(
                (score_data["faithfulness"] + score_data["answer_relevancy"]) / 2, 2
            )

            final_results.append({
                "index": i,
                "qa_uuid": db_id,
                "document_uuid": document_id,
                "q": qa.question,
                "doc": req.original_filename,
                "dtype": ext,
                "color": style["color"],
                "bg": style["bg"],
                "answer": qa.answer,
                "answer_quote": qa.answer_quote,
                "anchor_used": qa.anchor_used,
                "bloom_type": qa.bloom_type,
                "score": avg_score,
                "faithfulness": round(score_data["faithfulness"], 2),
                "answer_relevancy": round(score_data["answer_relevancy"], 2),
            })

        supabase_client.table("documents").update({"status": "완료"}).eq("id", document_id).execute()

        return final_results

    except HTTPException:
        raise
    except Exception as e:
        print(f"Agentic Pipeline Error: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Agentic 파이프라인 실행 중 오류: {str(e)}")
