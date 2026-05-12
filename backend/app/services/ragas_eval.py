import os
import numpy as np
from dotenv import load_dotenv
from datasets import Dataset
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_groq import ChatGroq

from ragas.metrics import (
    Faithfulness,
    AnswerRelevancy,
    AnswerCorrectness,
)
# ✅ AnswerSimilarity 제거 (embed_text 인터페이스 불일치 → ragas 버전 문제)
from ragas import evaluate

load_dotenv()

# ─────────────────────────────────────────────────────────
# 전역 임베딩 캐시
# ─────────────────────────────────────────────────────────
_embeddings_cache = None

def get_embeddings() -> HuggingFaceEmbeddings:
    global _embeddings_cache
    if _embeddings_cache is None:
        print("[INFO] HuggingFace 임베딩 모델 최초 로딩...")
        _embeddings_cache = HuggingFaceEmbeddings(
            model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
        )
    return _embeddings_cache


# ─────────────────────────────────────────────────────────
# 안전한 숫자 변환
# ─────────────────────────────────────────────────────────
def clean_score(value) -> float:
    try:
        if isinstance(value, list):
            value = value[0]
        if value is None:
            return 0.0
        f = float(value)
        return 0.0 if (np.isnan(f) or np.isinf(f)) else round(f, 4)
    except Exception:
        return 0.0


def _zero_scores() -> dict:
    return {
        "faithfulness":       0.0,
        "answer_relevancy":   0.0,
        "answer_correctness": 0.0,
        "avg_score":          0.0,
    }


# ─────────────────────────────────────────────────────────
# ✅ 핵심 평가 함수
# ─────────────────────────────────────────────────────────
def evaluate_user_document(
    context: str,
    question: str,
    ground_truth: str,
    user_answer: str,
) -> dict:
    """
    Returns:
        {
            "faithfulness":       float,  # 문서 일치도 (0~1)
            "answer_relevancy":   float,  # 질문 적합도 (0~1)
            "answer_correctness": float,  # 답변 정확도 (0~1)
            "avg_score":          float,  # 종합 평균   (0~1)
        }
    """

    # ── 입력값 방어 ──────────────────────────────────────
    if not context or not question or not user_answer:
        print("[WARN] 필수 입력값 누락 → 0점 반환")
        return _zero_scores()

    if not ground_truth:
        print("[WARN] ground_truth 없음 → answer_correctness 0점 처리 가능")

    # ── LLM 설정 ─────────────────────────────────────────
    judge_llm = ChatGroq(
        api_key=os.environ.get("GROQ_API_KEY"),
        model="llama-3.3-70b-versatile",
        temperature=0,
        n=1,
    )

    embeddings = get_embeddings()

    # ✅ 3개 메트릭만 사용 (AnswerSimilarity 제거)
    metrics = [
        Faithfulness(llm=judge_llm),
        AnswerRelevancy(llm=judge_llm, embeddings=embeddings),
        AnswerCorrectness(llm=judge_llm),
    ]

    # ── 데이터셋 구성 ─────────────────────────────────────
    dataset = Dataset.from_dict({
        "question":     [question],
        "answer":       [user_answer],
        "contexts":     [[context]],
        "ground_truth": [ground_truth or ""],
    })

    # ── 평가 실행 ─────────────────────────────────────────
    try:
        result = evaluate(
            dataset,
            metrics=metrics,
            llm=judge_llm,
            embeddings=embeddings,
            raise_exceptions=False,
        )
        print(f"\n[DEBUG] Ragas Raw Result type : {type(result)}")
        print(f"[DEBUG] Ragas Raw Result       : {result}\n")

    except Exception as e:
        print(f"[ERROR] Ragas 평가 실패: {e}")
        return _zero_scores()

    # ─────────────────────────────────────────────────────
    # ✅ 수정 1: 숫자형 컬럼만 선택 후 mean() 호출
    #    → string dtype 컬럼(question, answer 등) 제외
    # ─────────────────────────────────────────────────────
    try:
        scores_df = result.to_pandas()

        # ✅ 핵심: 숫자형 컬럼만 추출
        numeric_df  = scores_df.select_dtypes(include=[np.number])
        scores_dict = numeric_df.mean().to_dict()

        print(f"[DEBUG] numeric columns : {list(numeric_df.columns)}")
        print(f"[DEBUG] scores_dict     : {scores_dict}")

    except Exception as e:
        print(f"[ERROR] 결과 변환 실패: {e}")
        return _zero_scores()

    # ── 점수 추출 ─────────────────────────────────────────
    faithfulness       = clean_score(scores_dict.get("faithfulness",       0.0))
    answer_relevancy   = clean_score(scores_dict.get("answer_relevancy",   0.0))
    answer_correctness = clean_score(scores_dict.get("answer_correctness", 0.0))

    # 종합 평균 (3개 메트릭 기준)
    avg_score = round(
        (faithfulness + answer_relevancy + answer_correctness) / 3, 4
    )

    final_scores = {
        "faithfulness":       faithfulness,
        "answer_relevancy":   answer_relevancy,
        "answer_correctness": answer_correctness,
        "avg_score":          avg_score,
    }

    print(
        f"[INFO] 채점 완료 | "
        f"faithfulness={faithfulness:.2f} | "
        f"relevancy={answer_relevancy:.2f} | "
        f"correctness={answer_correctness:.2f} | "
        f"avg={avg_score:.2f}"
    )

    return final_scores


# ─────────────────────────────────────────────────────────
# 단독 실행 테스트
# ─────────────────────────────────────────────────────────
def run_project_flow():
    raw_context = "수원 화성은 정약용의 거중기를 이용하여 1796년에 완공되었습니다."
    question    = "화성은 언제, 무엇을 이용해 지어졌나요?"
    gold_truth  = "1796년에 정약용의 거중기를 이용하여 지어졌습니다."
    user_answer = "화성은 정약용의 거중기를 이용해 1796년에 지어졌습니다."

    print("📊 [Ragas] 모델 품질 평가 시작...")
    scores = evaluate_user_document(raw_context, question, gold_truth, user_answer)

    print("\n" + "=" * 50)
    print(f"🎯 질문        : {question}")
    print(f"✅ 정답        : {gold_truth}")
    print(f"💬 사용자 답변 : {user_answer}")
    print(f"⭐ 문서 일치도 : {scores['faithfulness']:.4f}")
    print(f"⭐ 질문 적합도 : {scores['answer_relevancy']:.4f}")
    print(f"⭐ 답변 정확도 : {scores['answer_correctness']:.4f}")
    print(f"📈 종합 평균   : {scores['avg_score']:.4f}")
    print("🎉 평가 프로세스 완료")


if __name__ == "__main__":
    run_project_flow()
