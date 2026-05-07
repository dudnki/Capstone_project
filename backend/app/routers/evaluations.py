from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List
from app.services.supabase_client import supabase_client
# ⭐ 이름이 변경된 함수를 임포트합니다.
from app.services.ragas_eval import evaluate_qa_quality

router = APIRouter()

class UserAnswer(BaseModel):
    qa_id: str
    user_answer: str  # ← 이렇게 변경


class EvaluationRequest(BaseModel):
    document_id: str
    user_answers: List[UserAnswer]

@router.post("/submit")
async def submit_evaluation(req: EvaluationRequest):
    try:
        results = []
        
        for user_ans in req.user_answers:
            # 1. DB에서 원본 Q&A 데이터 가져오기
            qa_res = supabase_client.table("qa_evaluations")\
                .select("*")\
                .eq("id", user_ans.qa_id)\
                .single()\
                .execute()
            
            if not qa_res.data:
                continue
                
            qa_item = qa_res.data
            
            # 2. 새로운 함수로 평가 실행 (사용자 답변 반영)
            # context, question, ground_truth는 DB에 저장된 것을 사용
            scores = evaluate_qa_quality(
    context=qa_item["context"],
    question=qa_item["question"],
    ground_truth=qa_item["ground_truth"],
    user_answer=user_ans.user_answer  # ← 이렇게 변경
)

            
            # 3. 결과 리스트에 담기
            results.append({
                "qa_id": user_ans.qa_id,
                **scores
            })
            
        return {"success": True, "results": results}

    except Exception as e:
        print(f"❌ Evaluation Submit Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"평가 제출 중 오류 발생: {str(e)}")
