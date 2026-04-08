import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.supabase import supabase_client

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

    1. Supabase Storage에서 파일 다운로드
    2. 텍스트 추출
    3. LLM으로 Q&A 생성
    4. RAGAS로 평가
    5. 결과 반환 (EvaluationItem 형식)
    """
    try:
        # 1. Supabase Storage에서 파일 다운로드
        file_bytes = supabase_client.storage.from_("documents").download(req.saved_filename)

        if not file_bytes:
            raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다.")

        # 2. 파일 확장자 추출
        ext = req.original_filename.rsplit(".", 1)[-1].lower()
        style = DTYPE_STYLES.get(ext, {"color": "#475569", "bg": "#f8fafc"})

        # TODO: 텍스트 추출 → LLM Q&A 생성 → RAGAS 평가 구현
        # 현재는 파이프라인 연결 확인용 stub 반환
        results = _build_response(
            qa_pairs=[],
            ragas_scores=[],
            original_filename=req.original_filename,
            ext=ext,
            style=style,
        )

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

    qa_pairs 형식:
        [{"question": "...", "answer": "...", "ground_truth": "...", "context": "..."}]

    ragas_scores 형식:
        [{"faithfulness": 0.9, "answer_relevancy": 0.8, "context_precision": 0.85}]
    """
    results = []

    for i, (qa, scores) in enumerate(zip(qa_pairs, ragas_scores), start=1):
        faithfulness      = scores.get("faithfulness", 0)
        answer_relevancy  = scores.get("answer_relevancy", 0)
        context_precision = scores.get("context_precision", 0)

        # 3개 지표 평균을 대표 점수로 사용
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
