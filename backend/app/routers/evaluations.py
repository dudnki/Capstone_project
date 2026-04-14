from fastapi import APIRouter, HTTPException
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