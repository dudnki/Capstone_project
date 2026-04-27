import os
import numpy as np
from ragas import evaluate
from ragas.metrics import faithfulness, AnswerRelevancy
from langchain_groq import ChatGroq
from datasets import Dataset
from langchain_huggingface import HuggingFaceEmbeddings

def evaluate_user_document(context, question, ground_truth, user_answer):
    # 1. LLM 설정 (Groq 전용)
    judge_llm = ChatGroq(
        api_key=os.environ.get("GROQ_API_KEY"),
        model="llama-3.3-70b-versatile",
        temperature=0,
        n=1
    )
    
    # 2. 임베딩 설정 (한국어 지원 다국어 모델)
    real_embeddings = HuggingFaceEmbeddings(
        model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    )

    # 3. ⭐ 핵심: Answer Relevancy 설정 커스터마이징
    # Groq은 한 번에 여러 질문을 생성하지 못하므로 strict_relevancy를 위해 가볍게 1회만 수행하도록 설정합니다.
    # Ragas 내부에서 n=1로 동작하게끔 llm을 주입한 객체를 만듭니다.
    answer_relevancy_metric = AnswerRelevancy(llm=judge_llm, embeddings=real_embeddings)

    # 4. 데이터 구성
    data_dict = {
        "question": [question],
        "answer": [user_answer],
        "contexts": [[context]],
        "ground_truth": [ground_truth]
    }
    dataset = Dataset.from_dict(data_dict)

    # 5. 평가 실행 (metrics 리스트에 위에서 만든 객체를 넣습니다)
    result = evaluate(
        dataset,
        metrics=[faithfulness, answer_relevancy_metric],
        llm=judge_llm,
        embeddings=real_embeddings
    )
    
    # 디버깅용: 서버 터미널에서 실제 원본 데이터를 확인 (return 전에 위치)
    print(f"\n--- Ragas Raw Result: {result} ---")

    # 6. 안전한 숫자 변환 함수
    def clean_score(value):
        try:
            if isinstance(value, list):
                value = value[0]
            if value is None or (isinstance(value, (float, int)) and np.isnan(value)):
                return 0.0
            return float(value)
        except:
            return 0.0

    final_scores = {
        "faithfulness": clean_score(result["faithfulness"]),
        "answer_relevancy": clean_score(result["answer_relevancy"])
    }
    
    return final_scores