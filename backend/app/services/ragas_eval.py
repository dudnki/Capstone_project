import os
import numpy as np
from dotenv import load_dotenv
from datasets import Dataset
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_groq import ChatGroq
from ragas.metrics import faithfulness, AnswerRelevancy
from ragas import evaluate
# Supabase는 프로젝트 설정에 맞게 supabase_client를 임포트한다고 가정합니다.
# from app.services.supabase_client import supabase_client 

load_dotenv()

# 1. 안전한 숫자 변환 함수 (전역 또는 유틸리티로 분리)
def clean_score(value):
    try:
        if isinstance(value, list):
            value = value[0]
        if value is None or (isinstance(value, (float, int)) and np.isnan(value)):
            return 0.0
        return float(value)
    except:
        return 0.0

# 2. 개별 문서 평가 함수
def evaluate_user_document(context, question, ground_truth, user_answer):
    # LLM 설정
    judge_llm = ChatGroq(
        api_key=os.environ.get("GROQ_API_KEY"),
        model="llama-3.3-70b-versatile",
        temperature=0,
        n=1
    )
    
    # 임베딩 설정
    real_embeddings = HuggingFaceEmbeddings(
        model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    )

    # Ragas 메트릭 설정
    answer_relevancy_metric = AnswerRelevancy(llm=judge_llm, embeddings=real_embeddings)

    data_dict = {
        "question": [question],
        "answer": [user_answer],
        "contexts": [[context]],
        "ground_truth": [ground_truth]
    }
    dataset = Dataset.from_dict(data_dict)

    # 평가 실행
    result = evaluate(
        dataset,
        metrics=[faithfulness, answer_relevancy_metric],
        llm=judge_llm,
        embeddings=real_embeddings
    )
    
    print(f"\n--- Ragas Raw Result: {result} ---")

    final_scores = {
        "faithfulness": clean_score(result["faithfulness"]),
        "answer_relevancy": clean_score(result["answer_relevancy"])
    }
    
    return final_scores

# 3. 전체 프로젝트 실행 흐름 (시뮬레이션 포함)
def run_project_flow():
    try:
        # 가상의 데이터 설정 (실제로는 generate_gold_standard 등의 로직 필요)
        raw_context = "수원 화성은 정약용의 거중기를 이용하여 1796년에 완공되었습니다."
        question = "화성은 언제, 무엇을 이용해 지어졌나요?"
        gold_truth = "1796년에 정약용의 거중기를 이용하여 지어졌습니다."
        
        opponent_answer = "화성은 정약용의 거중기를 이용해 1796년에 지어졌습니다."

        print("📊 [Ragas] 모델 품질 평가 시작...")
        eval_result = evaluate_user_document(raw_context, question, gold_truth, opponent_answer)

        # 결과 정리 및 출력
        final_report = {
            "question": question,
            "gold_truth": gold_truth,
            "opponent_answer": opponent_answer,
            "faithfulness": eval_result["faithfulness"],
            "answer_relevancy": eval_result["answer_relevancy"],
        }

        print("\n" + "="*50)
        print(f"🎯 질문: {final_report['question']}")
        print(f"✅ 정답: {final_report['gold_truth']}")
        print(f"⭐ 충실도(Faithfulness): {final_report['faithfulness']:.4f}")
        print(f"⭐ 적절성(Relevancy): {final_report['answer_relevancy']:.4f}")
        print("🎉 평가 프로세스가 완료되었습니다.")

    except Exception as e:
        print(f"❌ 실행 중 오류 발생: {e}")

if __name__ == "__main__":
    run_project_flow()