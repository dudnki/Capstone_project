from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
from app.services.supabase_client import supabase_client
<<<<<<< HEAD
from app.services.ragas_eval import evaluate_user_document

router = APIRouter()


# ---------- 요청 모델 ----------
=======
# Ragas 채점 로직이 담긴 함수를 불러옵니다.
try:
    from app.services.ragas_eval import evaluate_user_document
except ImportError:
    # 아직 해당 함수가 없다면 임시 함수 정의 (에러 방지용)
    def evaluate_user_document(**kwargs):
        return {"faithfulness": 0.0, "answer_relevancy": 0.0}

router = APIRouter()

# --- 데이터 모델 정의 ---
>>>>>>> feature/rag-eval-fix
class UserAnswerUpdate(BaseModel):
    qa_id: str
    answer: str


class SubmitRequest(BaseModel):
    document_id: str
    user_answers: List[UserAnswerUpdate]

<<<<<<< HEAD

# ---------- 조회 API ----------
@router.get("/evaluations")
async def get_evaluations_list():
    """
    최근 문서 평가 히스토리 목록 조회.
    """
=======
# --- 1. 학생 답변 제출 및 실시간 채점 API ---
@router.post("/evaluations/submit")
async def submit_student_answers(req: SubmitRequest):
    try:
        # 1. 문서 전체 컨텍스트 가져오기 (채점 시 참조용)
        doc_res = supabase_client.table("documents").select("content").eq("id", req.document_id).single().execute()
        raw_context = doc_res.data["content"]

        results = []
        for item in req.user_answers:
            # 2. 미리 생성된 질문/정답(Ground Truth) 데이터 가져오기
            qa_res = supabase_client.table("qa_evaluations").select("*").eq("id", item.qa_id).single().execute()
            db_qa = qa_res.data

            # 3. Ragas 채점 실행 (사용자 답변 평가)
            report = evaluate_user_document(
                context=raw_context,
                question=db_qa["question"],
                ground_truth=db_qa["ground_truth"],
                user_answer=item.answer
            )

            # 4. 평균 점수 계산 (민철님 DB 스키마 대응)
            calculated_avg = round((report["faithfulness"] + report["answer_relevancy"]) / 2, 2)
            
            # 5. DB 업데이트 페이로드 구성
            update_payload = {
                "user_answer": item.answer,
                "faithfulness_score": report["faithfulness"],
                "answer_relevance_score": report["answer_relevancy"],
                # "avg_score": calculated_avg # 필요 시 컬럼명 확인 후 주석 해제
            }

            # 6. DB 업데이트 실행
            supabase_client.table("qa_evaluations").update(update_payload).eq("id", item.qa_id).execute()
            
            results.append({
                "qa_id": item.qa_id,
                "faithfulness": report["faithfulness"],
                "answer_relevancy": report["answer_relevancy"],
                "avg_score": calculated_avg
            })

        return {"success": True, "results": results}

    except Exception as e:
        print(f"Error occurred: {str(e)}")
        raise HTTPException(status_code=500, detail=f"제출 처리 실패: {str(e)}")

# --- 2. 최근 문서 평가 히스토리 목록 조회 API ---
@router.get("/evaluations")
async def get_evaluations_list():
>>>>>>> feature/rag-eval-fix
    try:
        response = supabase_client.table("documents")\
            .select("id, status, created_at")\
            .order("created_at", desc=True)\
            .execute()
<<<<<<< HEAD

        return {"success": True, "data": response.data}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"히스토리 목록 조회 실패: {str(e)}")


@router.get("/evaluations/{document_id}")
async def get_evaluation_detail(document_id: str):
    """
    특정 평가 기록 상세 조회 (문서 메타 + Q&A 전체).
    """
    try:
=======
        
        return {"success": True, "data": response.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"히스토리 목록 조회 실패: {str(e)}")

# --- 3. 특정 평가 기록 상세 조회 API ---
@router.get("/evaluations/{document_id}")
async def get_evaluation_detail(document_id: str):
    try:
        # 문서 정보 조회
>>>>>>> feature/rag-eval-fix
        doc_response = supabase_client.table("documents")\
            .select("*")\
            .eq("id", document_id)\
            .single()\
            .execute()
<<<<<<< HEAD

=======
            
        # 해당 문서의 Q&A 세트 조회
>>>>>>> feature/rag-eval-fix
        qa_response = supabase_client.table("qa_evaluations")\
            .select("*")\
            .eq("document_id", document_id)\
            .execute()

        return {
            "success": True,
            "document_info": doc_response.data,
            "qa_details": qa_response.data
        }
<<<<<<< HEAD

    except Exception as e:
        raise HTTPException(status_code=404, detail=f"상세 데이터를 찾을 수 없습니다: {str(e)}")


@router.get("/evaluations/{document_id}/questions")
async def get_questions(document_id: str):
    """
    특정 문서에서 LLM이 생성한 질문 목록만 반환.
    """
    try:
        response = supabase_client.table("qa_evaluations")\
            .select("question")\
            .eq("document_id", document_id)\
            .execute()

        questions = [row["question"] for row in response.data]

        return {"success": True, "questions": questions}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"질문 조회 실패: {str(e)}")


# ---------- 사용자 답변 제출 & 채점 ----------
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
            })

        return {"success": True, "results": results}

    except Exception as e:
        print(f"Submit Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"제출 처리 실패: {str(e)}")
=======
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"데이터 조회 실패: {str(e)}")
>>>>>>> feature/rag-eval-fix
