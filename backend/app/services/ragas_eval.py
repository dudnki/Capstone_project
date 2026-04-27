import os
import numpy as np
import pandas as pd
from datasets import Dataset
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_groq import ChatGroq
from ragas.metrics import faithfulness, AnswerRelevancy, AnswerCorrectness, AnswerSimilarity
from ragas import evaluate
# ⭐ 호환성 해결을 위한 임포트 추가
from ragas.embeddings import LangchainEmbeddingsWrapper

def clean_score(df, column_name):
    try:
        if column_name not in df.columns:
            return 0.0
        val = df[column_name].iloc[0]
        # nan 체크 강화
        if pd.isna(val) or val is None or np.isnan(val):
            return 0.0
        return float(val)
    except:
        return 0.0

def get_eval_models():
    judge_llm = ChatGroq(
        api_key=os.environ.get("GROQ_API_KEY"),
        model="llama-3.3-70b-versatile",
        temperature=0
    )
    
    # 기초 임베딩 모델
    raw_embeddings = HuggingFaceEmbeddings(
        model_name="sentence-transformers/distiluse-base-multilingual-cased-v1"
    )
    
    # ⭐ [핵심 수정] Ragas 호환성을 위해 Wrapper로 감싸기
    # 이렇게 해야 'embed_text' 관련 AttributeError가 사라집니다.
    ragas_embeddings = LangchainEmbeddingsWrapper(raw_embeddings)
    
    return judge_llm, ragas_embeddings

def evaluate_qa_quality(context, question, ground_truth, user_answer=None):
    eval_target = user_answer if user_answer is not None else ground_truth
    judge_llm, ragas_embeddings = get_eval_models()
    
    # 메트릭 설정 및 모델 주입
    rel = AnswerRelevancy(llm=judge_llm, embeddings=ragas_embeddings)
    corr = AnswerCorrectness(llm=judge_llm, embeddings=ragas_embeddings)
    sim = AnswerSimilarity(embeddings=ragas_embeddings)
    faith = faithfulness
    faith.llm = judge_llm

    data_dict = {
        "question": [str(question)],
        "answer": [str(eval_target)],
        "contexts": [[str(context)]],
        "ground_truth": [str(ground_truth)]
    }
    
    try:
        dataset = Dataset.from_dict(data_dict)
        # 평가 실행
        result = evaluate(
            dataset, 
            metrics=[faith, rel, corr, sim],
            llm=judge_llm, 
            embeddings=ragas_embeddings
        )
        df = result.to_pandas()
        
        print(f"📊 Raw Scores Check - Correctness: {df['answer_correctness'].iloc[0]}, Similarity: {df['answer_similarity'].iloc[0]}")
        
        return {
            "faithfulness": clean_score(df, "faithfulness"),
            "answer_relevancy": clean_score(df, "answer_relevancy"),
            "answer_correctness": clean_score(df, "answer_correctness"),
            "answer_similarity": clean_score(df, "answer_similarity")
        }
    except Exception as e:
        print(f"❌ Ragas 평가 도중 예외 발생: {e}")
        return {k: 0.0 for k in ["faithfulness", "answer_relevancy", "answer_correctness", "answer_similarity"]}