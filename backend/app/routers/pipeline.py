import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.supabase import supabase_client  # (경로가 맞는지 한번 확인해주세요!)

router = APIRouter()

# 파일 확장자별 색상 (프론트엔드 EvaluationItem 형식에 맞춤)
DTYPE_STYLES = {
    "pdf":   {"color": "#b91c1c", "bg": "#fef2f2"},
    "txt":   {"color": "#1d4ed8", "bg": "#eff6ff"},
    "md":    {"color": "#1d4ed8", "bg": "#eff6ff"},
    "csv":   {"color": "#15803d", "bg": "#f0fdf4"},
    "json":  {"color": "#c2410c", "bg": "#fff7ed"},
    "jsonl": {"color": "#c2410c", "bg": "#fff7ed"},
}

class PipelineRequest(BaseModel):
    saved_filename: str       # Supabase Storage에 저장된 파일명 (UUID)
    original_filename: str    # 사용자가 업로드한 원본 파일명


@router.post("/pipeline/run")
async def run_pipeline(req: PipelineRequest):
    """
    파이프라인 실행 엔드포인트.
    """
    try:
        # 1. Supabase Storage에서 파일 다운로드
        file_bytes = supabase_client.storage.from_("documents").download(req.saved_filename)

        if not file_bytes:
            raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다.")

        # 2. 파일 확장자 추출
        ext = req.original_filename.rsplit(".", 1)[-1].lower()
        style = DTYPE_STYLES.get(ext, {"color": "#475569", "bg": "#f8fafc"})

        # 🔥 [핵심 추가] 3. DB 장부(documents 테이블)에 문서 기록 남기기!
        # (임시 처리: 현재 텍스트 추출기능이 없으므로, 파일 내용을 디코딩 시도하고 안되면 더미텍스트 삽입)
        try:
            content_text = file_bytes.decode('utf-8')
        except UnicodeDecodeError:
            content_text = "[바이너리 파일 - 텍스트 추출 모듈 연동 전]"

        doc_insert_res = supabase_client.table("documents").insert({
            "content": content_text,
            "original_filename": req.original_filename, # 🌟 아까 만든 칸에 파일명 쏙 넣기!
            "status": "처리중"
        }).execute()
        
        # 방금 저장된 문서의 고유 ID (나중에 qa_evaluations 테이블에 점수 넣을 때 필요함)
        document_id = doc_insert_res.data[0]["id"]


        # TODO: 본격적인 LLM Q&A 생성 → RAGAS 평가 구현 (현재는 stub)
        results = _build_response(
            qa_pairs=[],
            ragas_scores=[],
            original_filename=req.original_filename,
            ext=ext,
            style=style,
        )

        # (선택) 파이프라인이 다 끝났다면 상태를 '완료'로 업데이트
        supabase_client.table("documents").update({"status": "완료"}).eq("id", document_id).execute()

        return results

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"파이프라인 실행 실패: {str(e)}")


def _build_response(
    qa_pairs: list[dict],
    ragas_scores: list[dict],
    original_filename: str,
    ext: str,
    style: dict,
) -> list[dict]:
    """
    RAGAS 결과를 프론트엔드 EvaluationItem 형식으로 변환합니다.
    """
    results = []

    for i, (qa, scores) in enumerate(zip(qa_pairs, ragas_scores), start=1):
        faithfulness      = scores.get("faithfulness", 0)
        answer_relevancy  = scores.get("answer_relevancy", 0)
        context_precision = scores.get("context_precision", 0)

        avg_score = round((faithfulness + answer_relevancy + context_precision) / 3, 2)

        results.append({
            "id":                i,
            "q":                 qa["question"],
            "doc":               original_filename,
            "dtype":             ext,
            "color":             style["color"],
            "bg":                style["bg"],
            "answer":            qa["answer"],
            "score":             avg_score,
            "faithfulness":      round(faithfulness, 2),
            "answer_relevancy":  round(answer_relevancy, 2),
            "context_precision": round(context_precision, 2),
        })

    return results