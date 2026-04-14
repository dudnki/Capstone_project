from fastapi import APIRouter, HTTPException, BackgroundTasks
from app.services.supabase_client import supabase_client
from app.services.ragas_eval import evaluate_user_document
from pydantic import BaseModel
from typing import List

router = APIRouter()

# 1. 스키마 수정: 프론트엔드에서 보낼 때 'answer' 대신 'user_answer'로 받는 것이 직관적입니다.
class AnswerSubmission(BaseModel):
    document_id: str
    # [{"question": "...", "user_answer": "..."}] 형태로 받는 것이 DB와 일치합니다.
    user_answers: List[dict] 

@router.post("/evaluations/submit")
async def submit_answers(submission: AnswerSubmission, background_tasks: BackgroundTasks):
    try:
        # 문서 정보 조회
        doc_res = supabase_client.table("documents").select("content").eq("id", submission.document_id).single().execute()
        if not doc_res.data:
            raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")
        
        raw_context = doc_res.data["content"]

        # 2. 첫 번째 답변 평가 예시 수정
        first_qa = submission.user_answers[0]
        
        # [수정] 프론트에서 보낸 키값이 'user_answer'인지 확인 필요
        # 만약 프론트에서 여전히 'answer'로 보낸다면 first_qa.get("answer")를 유지하되,
        # 아래 DB 저장 시에는 반드시 'user_answer' 컬럼에 넣어야 합니다.
        user_ans_text = first_qa.get("user_answer") or first_qa.get("answer")
        
        report = evaluate_user_document(raw_context, user_ans_text)

        if report:
            # 3. DB 저장 시 컬럼명 매칭 (민철님 스키마 반영)
            # report 객체 안에 이미 question, ground_truth 등이 있다면 그대로 사용하고
            # 추가적으로 사용자가 제출한 답변을 'user_answer' 컬럼에 명시합니다.
            report["document_id"] = submission.document_id
            report["user_answer"] = user_ans_text  # 🔥 'answer'가 아니라 'user_answer'에 저장
            
            supabase_client.table("qa_evaluations").insert(report).execute()
            
            # 문서 상태 업데이트
            supabase_client.table("documents").update({"status": "completed"}).eq("id", submission.document_id).execute()

        return {"success": True, "message": "평가가 성공적으로 접수되었습니다."}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"평가 제출 실패: {str(e)}")

# GET 부분은 select("*")이므로 DB 컬럼이 바뀌어도 자동으로 다 가져오게 되어 있어 수정 안 하셔도 됩니다.
@router.get("/evaluations/{document_id}")
async def get_evaluation_detail(document_id: str):
    try:
        doc_response = supabase_client.table("documents").select("*").eq("id", document_id).single().execute()
        qa_response = supabase_client.table("qa_evaluations").select("*").eq("document_id", document_id).execute()
            
        return {
            "success": True,
            "document_info": doc_response.data,
            "qa_details": qa_response.data 
        }
    except Exception as e:
        return {
            "success": False,
            "detail": f"데이터 로드 실패: {str(e)}"
        }