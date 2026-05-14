from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
from app.services.supabase_client import supabase_client

# Ragas 채점 로직 import (없으면 임시 fallback)
try:
    from app.services.ragas_eval import evaluate_user_document
except ImportError:
    def evaluate_user_document(**kwargs):
        return {"faithfulness": 0.0, "answer_relevancy": 0.0}

router = APIRouter()


# ---------- 요청 모델 ----------
class UserAnswerUpdate(BaseModel):
    qa_id: str
    answer: str


class SubmitRequest(BaseModel):
    document_id: str
    user_answers: List[UserAnswerUpdate]


# ---------- 1. 학생 답변 제출 및 실시간 채점 ----------
@router.post("/evaluations/submit")
async def submit_student_answers(req: SubmitRequest):
    try:
        doc_res = supabase_client.table("documents")\
            .select("content")\
            .eq("id", req.document_id)\
            .single()\
            .execute()
        raw_context = doc_res.data["content"]

        results = []
        for item in req.user_answers:
            qa_res = supabase_client.table("qa_evaluations")\
                .select("*")\
                .eq("id", item.qa_id)\
                .single()\
                .execute()
            db_qa = qa_res.data

            report = evaluate_user_document(
                context=raw_context,
                question=db_qa["question"],
                ground_truth=db_qa["ground_truth"],
                user_answer=item.answer
            )

            calculated_avg = round((report["faithfulness"] + report["answer_relevancy"]) / 2, 2)

            update_payload = {
                "user_answer": item.answer,
                "faithfulness_score": report["faithfulness"],
                "answer_relevance_score": report["answer_relevancy"],
            }

            supabase_client.table("qa_evaluations")\
                .update(update_payload)\
                .eq("id", item.qa_id)\
                .execute()

            results.append({
                "qa_id": item.qa_id,
                "faithfulness": report["faithfulness"],
                "answer_relevancy": report["answer_relevancy"],
                "avg_score": calculated_avg
            })

        return {"success": True, "results": results}

    except Exception as e:
        print(f"Submit Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"제출 처리 실패: {str(e)}")


# ---------- 2. 평가 히스토리 목록 조회 ----------
@router.get("/evaluations")
async def get_evaluations_list():
    try:
        response = supabase_client.table("documents")\
            .select("id, status, created_at")\
            .order("created_at", desc=True)\
            .execute()

        return {"success": True, "data": response.data}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"히스토리 목록 조회 실패: {str(e)}")


# ---------- 3. 특정 평가 기록 상세 조회 ----------
@router.get("/evaluations/{document_id}")
async def get_evaluation_detail(document_id: str):
    try:
        doc_response = supabase_client.table("documents")\
            .select("*")\
            .eq("id", document_id)\
            .single()\
            .execute()

        qa_response = supabase_client.table("qa_evaluations")\
            .select("*")\
            .eq("document_id", document_id)\
            .execute()

        return {
            "success": True,
            "document_info": doc_response.data,
            "qa_details": qa_response.data
        }

    except Exception as e:
        raise HTTPException(status_code=404, detail=f"상세 데이터를 찾을 수 없습니다: {str(e)}")


# ---------- 4. 특정 문서의 질문 목록만 조회 ----------
@router.get("/evaluations/{document_id}/questions")
async def get_questions(document_id: str):
    try:
        response = supabase_client.table("qa_evaluations")\
            .select("question")\
            .eq("document_id", document_id)\
            .execute()

        questions = [row["question"] for row in response.data]

        return {"success": True, "questions": questions}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"질문 조회 실패: {str(e)}")
