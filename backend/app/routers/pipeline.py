import os
import fitz  # PyMuPDF
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.services.database import get_db, Document, QAEvaluation
from app.services.geval_filter import generate_multiple_qa, filter_qa_by_geval
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

DTYPE_STYLES = {
    "pdf": {"color": "#b91c1c", "bg": "#fef2f2"},
    "txt": {"color": "#1d4ed8", "bg": "#eff6ff"},
    "md":  {"color": "#1d4ed8", "bg": "#eff6ff"},
}

# G-Eval 파이프라인 파라미터
N_CANDIDATES = 5   # 청크당 생성할 Q&A 후보 수
GEVAL_THRESHOLD = 0.70  # 최소 품질 점수 (0~1)
TOP_K_PER_CHUNK = 2     # 청크당 최종 선택 수

class PipelineRequest(BaseModel):
    saved_filename: str
    original_filename: str

# 🔥 파일이 저장되어 있는 로컬 폴더 경로
UPLOAD_DIR = "uploaded_pdf"

# FastAPI 라우터에 DB 의존성(Depends) 추가
@router.post("/pipeline/run")
async def run_pipeline(req: PipelineRequest, db: Session = Depends(get_db)):
    try:
        # 1. 로컬 폴더에서 파일 읽어오기 (Supabase 다운로드 완벽 대체)
        file_path = os.path.join(UPLOAD_DIR, req.saved_filename)
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="로컬 폴더에서 파일을 찾을 수 없습니다.")
            
        with open(file_path, "rb") as f:
            file_bytes = f.read()

        # 2. 텍스트 추출
        ext = req.original_filename.rsplit(".", 1)[-1].lower()
        extracted_text = ""

        if ext == "pdf":
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            for page in doc:
                extracted_text += page.get_text()
        else:
            extracted_text = file_bytes.decode("utf-8")

        # 3. 로컬 DB (SQLite) documents 테이블에 기록
        new_doc = Document(
            original_filename=req.original_filename,
            content=extracted_text[:5000],
            status="처리중"
        )
        db.add(new_doc)
        db.commit()
        db.refresh(new_doc)
        document_id = new_doc.id

        # 4. 청킹 (1000자 단위)
        chunk_size = 1000
        chunks = [extracted_text[i:i + chunk_size] for i in range(0, len(extracted_text), chunk_size)]

        # 5. G-Eval 파이프라인: 다수 후보 생성 → 품질 필터링 → 고품질만 저장
        qa_pairs = []
        for chunk_idx, chunk in enumerate(chunks[:3]):
            print(f"\n[Pipeline] 청크 {chunk_idx + 1}/3 처리 시작")

            # 5-1. 후보 N개 생성 (temperature 높여 다양성 확보)
            candidates = generate_multiple_qa(chunk, n=N_CANDIDATES)
            if not candidates:
                print(f"  [Pipeline] 청크 {chunk_idx + 1}: 후보 생성 실패, 건너뜀")
                continue

            # 5-2. G-Eval로 후보 품질 평가 → threshold 필터 → top_k 선택
            selected = filter_qa_by_geval(
                context=chunk,
                qa_candidates=candidates,
                threshold=GEVAL_THRESHOLD,
                top_k=TOP_K_PER_CHUNK,
            )

            # 5-3. 선택된 Q&A를 DB에 저장
            for qa in selected:
                geval = qa["geval"]
                scores = geval["scores"]

                # G-Eval 차원별 점수를 기존 DB 컬럼에 매핑
                # faithfulness_score  ← 문맥 충실도 관련 차원 (relevance + answerability 평균, 0~1)
                # answer_relevance_score ← 질문 품질 차원 (clarity + specificity + difficulty 평균, 0~1)
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
                    "faithfulness_mapped":  faithfulness_mapped,
                    "relevance_mapped":     relevance_mapped,
                })

        # 6. 상태 업데이트 및 최종 반환
        new_doc.status = "완료"
        db.commit()

        style = DTYPE_STYLES.get(ext, {"color": "#475569", "bg": "#f8fafc"})

        final_results = []
        for i, qa in enumerate(qa_pairs, start=1):
            geval = qa["geval"]
            avg_score = round(
                (qa["faithfulness_mapped"] + qa["relevance_mapped"]) / 2, 2
            )

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
        raise HTTPException(status_code=500, detail=f"파이프라인 실행 중 오류 발생: {str(e)}")