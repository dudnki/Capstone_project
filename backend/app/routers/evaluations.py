from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List
from sqlalchemy.orm import Session

# 🔥 로컬 DB 및 평가 로직 불러오기
from app.services.database import get_db, Document, QAEvaluation
from app.services.ragas_eval import evaluate_user_document

router = APIRouter()

# --- 데이터 모델 정의 ---
class UserAnswerUpdate(BaseModel):
    qa_id: str
    answer: str

class SubmitRequest(BaseModel):
    document_id: str
    user_answers: List[UserAnswerUpdate]

# --- 1. 학생 답변 제출 및 실시간 채점 API ---
@router.post("/evaluations/submit")
async def submit_student_answers(req: SubmitRequest, db: Session = Depends(get_db)):
    try:
        # 1. 문서 전체 컨텍스트 가져오기 (채점 시 참조용)
        doc = db.query(Document).filter(Document.id == req.document_id).first()
        if not doc:
            raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")
        raw_context = doc.content

        results = []
        for item in req.user_answers:
            # 2. 미리 생성된 질문/정답(Ground Truth) 데이터 가져오기
            db_qa = db.query(QAEvaluation).filter(QAEvaluation.id == item.qa_id).first()
            if not db_qa:
                continue

            # 3. Ragas 채점 실행 (태원님의 4종 지표 반영)
            # evaluate_user_document 함수가 내부적으로 태원님의 최신 로직을 돌립니다.
            report = evaluate_user_document(
                context=raw_context,
                question=db_qa.question,
                ground_truth=db_qa.ground_truth,
                user_answer=item.answer
            )

            # 4. DB 업데이트 (로컬 DB의 4개 점수 칸에 각각 저장)
            db_qa.user_answer = item.answer
            db_qa.faithfulness_score = report.get("faithfulness", 0.0)
            db_qa.answer_relevance_score = report.get("answer_relevancy", 0.0)
            db_qa.correctness_score = report.get("answer_correctness", 0.0) # 태원님 추가 지표
            db_qa.similarity_score = report.get("answer_similarity", 0.0)   # 태원님 추가 지표
            
            db.commit()
            
            # 평균 점수 계산 (화면 표시용)
            avg_score = round(sum([
                db_qa.faithfulness_score, 
                db_qa.answer_relevance_score, 
                db_qa.correctness_score, 
                db_qa.similarity_score
            ]) / 4, 2)

            results.append({
                "qa_id": item.qa_id,
                "scores": report,
                "avg_score": avg_score
            })

        return {"success": True, "results": results}

    except Exception as e:
        print(f"Submit Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"제출 처리 실패: {str(e)}")

# --- 2. 최근 문서 평가 히스토리 목록 조회 API ---
@router.get("/evaluations")
async def get_evaluations_list(db: Session = Depends(get_db)):
    try:
        # 생성일자 역순으로 문서 목록 조회
        docs = db.query(Document).order_by(Document.created_at.desc()).all()
        return {
            "success": True, 
            "data": [{"id": d.id, "status": d.status, "created_at": d.created_at, "filename": d.original_filename} for d in docs]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"히스토리 조회 실패: {str(e)}")

# --- 3. 특정 평가 기록 상세 조회 API ---
@router.get("/evaluations/{document_id}")
async def get_evaluation_detail(document_id: str, db: Session = Depends(get_db)):
    try:
        doc = db.query(Document).filter(Document.id == document_id).first()
        qa_list = db.query(QAEvaluation).filter(QAEvaluation.document_id == document_id).all()

        return {
            "success": True,
            "document_info": doc,
            "qa_details": qa_list
        }
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"데이터 조회 실패: {str(e)}")