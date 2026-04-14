from fastapi import APIRouter, HTTPException
<<<<<<< HEAD
from app.services.supabase_client import supabase_client
from app.services.ragas_eval import evaluate_user_document
from pydantic import BaseModel
from typing import List

router = APIRouter()

class UserAnswerUpdate(BaseModel):
    qa_id: str
    answer: str

class SubmitRequest(BaseModel):
    document_id: str
    user_answers: List[UserAnswerUpdate]

@router.post("/evaluations/submit")
async def submit_student_answers(req: SubmitRequest):
    try:
        # 1. 문서 컨텍스트 가져오기
        doc_res = supabase_client.table("documents").select("content").eq("id", req.document_id).single().execute()
        raw_context = doc_res.data["content"]

        results = []
        for item in req.user_answers:
            # 2. 질문/정답 데이터 가져오기
            qa_res = supabase_client.table("qa_evaluations").select("*").eq("id", item.qa_id).single().execute()
            db_qa = qa_res.data

            # 3. Ragas 채점 실행
            report = evaluate_user_document(
                context=raw_context,
                question=db_qa["question"],
                ground_truth=db_qa["ground_truth"],
                user_answer=item.answer
            )

            # 4. 평균 점수 계산 (민철님의 avg_score 컬럼 대응)
            calculated_avg = round((report["faithfulness"] + report["answer_relevancy"]) / 2, 2)
            
            # 🚀 민철님 DB 스키마에 맞춘 최종 페이로드
            update_payload = {
                "user_answer": item.answer,
                "faithfulness_score": report["faithfulness"],
                "answer_relevance_score": report["answer_relevancy"],
                
                #"avg_score": calculated_avg  # 👈 total_score 대신 avg_score 적용
            }

            # 5. DB 업데이트 실행
            supabase_client.table("qa_evaluations").update(update_payload).eq("id", item.qa_id).execute()
            
            # (중략: 채점 및 DB 업데이트 로직)

            # 🚀 응답 결과에 세부 점수를 포함시킵니다.
            results.append({
                "qa_id": item.qa_id,
                "faithfulness": report["faithfulness"],
                "answer_relevancy": report["answer_relevancy"],
                #"avg_score": calculated_avg
            })

        return {"success": True, "results": results}

        return {"success": True, "results": results}

    except Exception as e:
        # 에러 발생 시 로그 출력 후 500 반환
        print(f"Error occurred: {str(e)}")
        raise HTTPException(status_code=500, detail=f"제출 처리 실패: {str(e)}")
=======
from app.services.supabase_client import supabase_client  # (주의: 민철님 프로젝트의 실제 경로에 맞게 맞춰주세요)

router = APIRouter()

@router.get("/evaluations")
async def get_evaluations_list():
    """
    [Task 2] 최근 문서 평가 히스토리 목록 조회 API
    - 프론트엔드가 메인 화면에 들어왔을 때, 예전에 평가했던 문서 목록을 뿌려주는 역할.
    """
    try:
        # 1. Supabase의 documents 테이블에서 데이터 조회
        # 2. 최신순으로 정렬 (created_at 내림차순)
        # 3. 프론트엔드 목록 표시에 필요한 최소한의 데이터(id, status, created_at)만 가져옴
        response = supabase_client.table("documents")\
            .select("id, status, created_at")\
            .order("created_at", desc=True)\
            .execute()
        
        return {
            "success": True,
            "data": response.data
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"히스토리 목록 조회 실패: {str(e)}")
        
@router.get("/evaluations/{document_id}")
async def get_evaluation_detail(document_id: str):
    """
    [Task 3] 특정 평가 기록 상세 조회 API
    - 목록에서 항목을 클릭했을 때, 해당 문서의 50개 Q&A 세트와 상세 점수를 쫙 불러옵니다.
    """
    try:
        # 1. 해당 문서의 메타데이터(상태 등) 조회 (.single()로 단건 조회)
        doc_response = supabase_client.table("documents")\
            .select("*")\
            .eq("id", document_id)\
            .single()\
            .execute()
            
        # 2. 해당 문서에 딸린 수십 개의 Q&A 쌍 및 평가 점수 조회
        qa_response = supabase_client.table("qa_evaluations")\
            .select("*")\
            .eq("document_id", document_id)\
            .execute()
            
        return {
            "success": True,
            "document_info": doc_response.data,
            "qa_details": qa_response.data  # 프론트엔드는 이 배열을 받아서 표(Table)로 그립니다.
        }
        
    except Exception as e:
        # DB에 해당 id가 없거나 통신 에러 시 404/500 반환
        raise HTTPException(status_code=404, detail=f"상세 데이터를 찾을 수 없습니다: {str(e)}")


@router.get("/evaluations/{document_id}/questions")
async def get_questions(document_id: str):
    """
    특정 문서에서 LLM이 생성한 질문 목록만 반환합니다.
    """
    try:
        response = supabase_client.table("qa_evaluations")\
            .select("question")\
            .eq("document_id", document_id)\
            .execute()

        questions = [row["question"] for row in response.data]

        return {
            "success": True,
            "questions": questions
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"질문 조회 실패: {str(e)}")
>>>>>>> 1557ed46641e8fbc6be274249f5d768f612c932a
