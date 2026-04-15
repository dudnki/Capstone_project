import os
from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy
from datasets import Dataset
from langchain_groq import ChatGroq

# [내부 공통 로직] Ragas를 실제로 실행하는 핵심 함수
def _run_ragas(context, question, answer, ground_truth=None):
    try:
        eval_llm = ChatGroq(
            temperature=0,
            model_name="llama-3.3-70b-versatile",
            groq_api_key=os.environ.get("GROQ_API_KEY")
        )

        data = {
            "question": [str(question)],
            "contexts": [[str(context)]],
            "answer": [str(answer)]
        }
        
        if ground_truth:
            data["ground_truth"] = [str(ground_truth)]
            
        dataset = Dataset.from_dict(data)
        
        # 디버깅용 로그 (터미널에서 확인 가능)
        print(f"\n[RAGAS DEBUG] Input Answer: {answer[:30]}...")

        result = evaluate(
            dataset=dataset, 
            metrics=[faithfulness, answer_relevancy], 
            llm=eval_llm,
            raise_exceptions=False
        )

        return {
            "faithfulness": float(result.get("faithfulness", 0.0)),
            "answer_relevancy": float(result.get("answer_relevancy", 0.0))
        }
    except Exception as e:
        print(f"Ragas Error 상세: {e}")
        return {"faithfulness": 0.0, "answer_relevancy": 0.0}

# ✅ 1. 파이프라인(문제 생성 단계)에서 호출하는 함수 (ImportError 해결 포인트!)
def evaluate_qa_quality(context: str, question: str, ground_truth: str):
    # 생성된 Q&A의 품질을 측정할 때는 answer 자리에 ground_truth를 넣습니다.
    return _run_ragas(context=context, question=question, answer=ground_truth)

# ✅ 2. 사용자가 답변을 제출했을 때 호출하는 함수
def evaluate_user_document(context: str, question: str, ground_truth: str, user_answer: str):
    # 실제 사용자가 입력한 answer를 평가합니다.
    return _run_ragas(
        context=context, 
        question=question, 
        answer=user_answer, 
        ground_truth=ground_truth
    )
