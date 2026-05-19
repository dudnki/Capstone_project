import os
import json
import numpy as np
from dotenv import load_dotenv
from datasets import Dataset
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage

from ragas.metrics import (
    Faithfulness,
    AnswerRelevancy,
    AnswerCorrectness,
)
from ragas import evaluate

load_dotenv()

_embeddings_cache = None

def get_embeddings() -> HuggingFaceEmbeddings:
    global _embeddings_cache
    if _embeddings_cache is None:
        print("[INFO] HuggingFace 임베딩 모델 최초 로딩...")
        _embeddings_cache = HuggingFaceEmbeddings(
            model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
        )
    return _embeddings_cache


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


def _get_judge_llm():
    return ChatGroq(
        api_key=os.environ.get("GROQ_API_KEY"),
        model="llama-3.3-70b-versatile",
        temperature=0,
        n=1,
    )


# ─────────────────────────────────────────────────────────
# 피드백 생성 함수 (사용자 평가 전용)
# ─────────────────────────────────────────────────────────
def generate_question_feedback(
    question: str,
    user_answer: str,
    ground_truth: str,
    scores: dict,
) -> dict:
    """문항별 점수 근거 · 개선점 · 학습 조언 생성."""
    if not user_answer:
        return {"reasoning": "답변이 제출되지 않았습니다.", "improvements": "", "advice": ""}

    llm = _get_judge_llm()
    prompt = f"""당신은 교육 평가 전문가입니다. 아래 문제와 학생 답변, 채점 결과를 분석해 피드백을 작성하세요.

[문제]: {question}
[모범 답안]: {ground_truth}
[학생 답변]: {user_answer}

[채점 결과]
- 질문 이해도: {scores.get('answer_relevancy', 0):.2f} / 1.00
- 내용 완성도: {scores.get('answer_correctness', 0):.2f} / 1.00
- 자료 활용도: {scores.get('faithfulness', 0):.2f} / 1.00
- 종합 점수  : {scores.get('avg_score', 0):.2f} / 1.00

아래 JSON 형식으로만 응답하세요 (다른 텍스트 금지):
{{
  "reasoning": "각 지표별 점수 근거를 2~3문장으로 설명",
  "improvements": "부족한 부분과 구체적인 개선 방향을 1~2문장으로",
  "advice": "이 주제를 더 잘 이해하기 위한 학습 조언을 1~2문장으로"
}}"""

    try:
        result = llm.invoke([HumanMessage(content=prompt)])
        text = result.content.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        data = json.loads(text)
        return {
            "reasoning":    str(data.get("reasoning", "")),
            "improvements": str(data.get("improvements", "")),
            "advice":       str(data.get("advice", "")),
        }
    except Exception as e:
        print(f"[ERROR] 문항 피드백 생성 실패: {e}")
        return {"reasoning": "", "improvements": "", "advice": ""}


def generate_overall_feedback(results: list) -> dict:
    """전체 채점 결과를 바탕으로 잘한점·학습방향 생성."""
    if not results:
        return {"strengths": "", "direction": ""}

    llm = _get_judge_llm()
    lines = []
    for i, r in enumerate(results, 1):
        s = r.get("scores", {})
        lines.append(
            f"{i}. {r.get('question','')[:40]}... "
            f"[종합:{r.get('avg_score',0):.2f} "
            f"이해도:{s.get('answer_relevancy',0):.2f} "
            f"완성도:{s.get('answer_correctness',0):.2f} "
            f"활용도:{s.get('faithfulness',0):.2f}]"
        )
    summary_text = "\n".join(lines)

    prompt = f"""당신은 교육 평가 전문가입니다. 아래는 학생의 전체 시험 채점 결과입니다.

{summary_text}

아래 JSON 형식으로만 응답하세요 (다른 텍스트 금지):
{{
  "strengths": "학생이 전반적으로 잘한 점을 2~3문장으로 구체적으로 칭찬",
  "direction": "앞으로 어떻게 공부하면 좋을지 구체적인 학습 방향을 2~3문장으로 제시"
}}"""

    try:
        result = llm.invoke([HumanMessage(content=prompt)])
        text = result.content.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        data = json.loads(text)
        return {
            "strengths": str(data.get("strengths", "")),
            "direction": str(data.get("direction", "")),
        }
    except Exception as e:
        print(f"[ERROR] 전체 피드백 생성 실패: {e}")
        return {"strengths": "", "direction": ""}


# ─────────────────────────────────────────────────────────
# LLM judge 헬퍼 (RAGAS 0.00 fallback용)
# ─────────────────────────────────────────────────────────
def _evaluate_answer_relevancy(question: str, answer: str, llm) -> float:
    prompt = f"""당신은 Q&A 평가 전문가입니다.
아래 질문과 답변을 읽고, 답변이 질문의 의도에 얼마나 적합하게 대답했는지 평가하세요.

[질문]: {question}
[답변]: {answer}

[평가 기준]:
1.0 = 질문의 핵심을 완전하고 직접적으로 다룸
0.7 = 질문에 관련되나 일부 핵심 내용 누락
0.4 = 부분적으로만 관련됨
0.1 = 질문과 거의 관련 없음

결과를 반드시 아래 JSON 형식으로만 출력하세요:
{{"score": 점수(0.0~1.0), "reason": "한 문장 이유"}}"""

    try:
        result = llm.invoke([HumanMessage(content=prompt)])
        data = json.loads(result.content)
        score = float(data.get("score", 0.5))
        score = max(0.0, min(1.0, score))
        print(f"[DEBUG] answer_relevancy (LLM judge): {score:.4f} | {data.get('reason', '')}")
        return round(score, 4)
    except Exception as e:
        print(f"[ERROR] answer_relevancy 평가 실패: {e}")
        return 0.5


def _evaluate_faithfulness(context: str, answer: str, llm) -> float:
    prompt = f"""당신은 RAG 평가 전문가입니다.
아래 참고 문서와 답변을 읽고, 답변의 내용이 참고 문서에 얼마나 근거하는지 평가하세요.

[참고 문서]: {context[:2000]}
[답변]: {answer}

[평가 기준]:
1.0 = 답변의 모든 내용이 참고 문서에서 직접 지지됨
0.7 = 대부분 문서에 근거하지만 일부 외부 내용 포함
0.4 = 절반 정도만 문서에 근거함
0.1 = 문서와 거의 관계없는 내용

결과를 반드시 아래 JSON 형식으로만 출력하세요:
{{"score": 점수(0.0~1.0), "reason": "한 문장 이유"}}"""

    try:
        result = llm.invoke([HumanMessage(content=prompt)])
        text = result.content.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        data = json.loads(text)
        score = float(data.get("score", 0.5))
        score = max(0.0, min(1.0, score))
        print(f"[DEBUG] faithfulness (LLM judge): {score:.4f} | {data.get('reason', '')}")
        return round(score, 4)
    except Exception as e:
        print(f"[ERROR] faithfulness 평가 실패: {e}")
        return 0.5


def _evaluate_answer_correctness(question: str, answer: str, ground_truth: str, llm) -> float:
    if not ground_truth:
        return 0.5

    prompt = f"""당신은 교육 평가 전문가입니다.
아래 질문, 모범 답안, 제출된 답변을 비교하여 답변의 정확도를 평가하세요.

[질문]: {question}
[모범 답안]: {ground_truth}
[제출된 답변]: {answer}

[평가 기준]:
1.0 = 모범 답안의 핵심 내용을 모두 정확히 포함
0.7 = 대부분 정확하지만 일부 내용 누락 또는 경미한 오류
0.4 = 부분적으로 맞지만 중요한 내용 누락 또는 오류
0.1 = 모범 답안과 크게 다르거나 핵심 내용 없음

결과를 반드시 아래 JSON 형식으로만 출력하세요:
{{"score": 점수(0.0~1.0), "reason": "한 문장 이유"}}"""

    try:
        result = llm.invoke([HumanMessage(content=prompt)])
        text = result.content.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        data = json.loads(text)
        score = float(data.get("score", 0.5))
        score = max(0.0, min(1.0, score))
        print(f"[DEBUG] answer_correctness (LLM judge): {score:.4f} | {data.get('reason', '')}")
        return round(score, 4)
    except Exception as e:
        print(f"[ERROR] answer_correctness 평가 실패: {e}")
        return 0.5


# ─────────────────────────────────────────────────────────
# 모델 평가 (RAGAS 1차 → 0.00이면 LLM judge fallback)
# ─────────────────────────────────────────────────────────
def evaluate_model_document(
    context: str,
    question: str,
    ground_truth: str,
    answer: str,
) -> dict:
    if not context or not question or not answer:
        print("[WARN] 필수 입력값 누락 → 0점 반환")
        return _zero_scores()

    judge_llm = _get_judge_llm()
    embeddings = get_embeddings()

    faithfulness       = 0.0
    answer_relevancy   = 0.0
    answer_correctness = 0.0

    try:
        metrics = [
            Faithfulness(llm=judge_llm),
            AnswerRelevancy(llm=judge_llm, embeddings=embeddings),
            AnswerCorrectness(llm=judge_llm),
        ]
        dataset = Dataset.from_dict({
            "question":     [question],
            "answer":       [answer],
            "contexts":     [[context]],
            "ground_truth": [ground_truth or ""],
        })
        result = evaluate(
            dataset,
            metrics=metrics,
            llm=judge_llm,
            embeddings=embeddings,
            raise_exceptions=False,
        )
        scores_df   = result.to_pandas()
        numeric_df  = scores_df.select_dtypes(include=[np.number])
        scores_dict = numeric_df.mean().to_dict()

        faithfulness       = clean_score(scores_dict.get("faithfulness",       0.0))
        answer_relevancy   = clean_score(scores_dict.get("answer_relevancy",   0.0))
        answer_correctness = clean_score(scores_dict.get("answer_correctness", 0.0))

        print(
            f"[DEBUG] RAGAS 1차 | "
            f"faith={faithfulness:.4f} rel={answer_relevancy:.4f} corr={answer_correctness:.4f}"
        )
    except Exception as e:
        print(f"[ERROR] RAGAS 평가 실패, LLM judge fallback 전환: {e}")

    if faithfulness == 0.0:
        print("[INFO] faithfulness 0.00 → LLM judge fallback")
        faithfulness = _evaluate_faithfulness(context, answer, judge_llm)

    if answer_relevancy == 0.0:
        print("[INFO] answer_relevancy 0.00 → LLM judge fallback")
        answer_relevancy = _evaluate_answer_relevancy(question, answer, judge_llm)

    if answer_correctness == 0.0:
        print("[INFO] answer_correctness 0.00 → LLM judge fallback")
        answer_correctness = _evaluate_answer_correctness(question, answer, ground_truth, judge_llm)

    avg_score = round((faithfulness + answer_relevancy + answer_correctness) / 3, 4)

    print(
        f"[INFO] 모델 평가 완료 | "
        f"faithfulness={faithfulness:.2f} | "
        f"relevancy={answer_relevancy:.2f} | "
        f"correctness={answer_correctness:.2f} | "
        f"avg={avg_score:.2f}"
    )

    return {
        "faithfulness":       faithfulness,
        "answer_relevancy":   answer_relevancy,
        "answer_correctness": answer_correctness,
        "avg_score":          avg_score,
    }


# ─────────────────────────────────────────────────────────
# 사용자 평가 (RAGAS 1차 → 0.00이면 LLM judge fallback)
# ─────────────────────────────────────────────────────────
def evaluate_user_document(
    context: str,
    question: str,
    ground_truth: str,
    user_answer: str,
) -> dict:
    if not context or not question or not user_answer:
        print("[WARN] 필수 입력값 누락 → 0점 반환")
        return _zero_scores()

    if not ground_truth:
        print("[WARN] ground_truth 없음 → answer_correctness 0점 처리 가능")

    judge_llm = _get_judge_llm()
    embeddings = get_embeddings()

    # RAGAS: Faithfulness, AnswerCorrectness (answer_relevancy는 LLM judge 직접 사용)
    faithfulness       = 0.0
    answer_correctness = 0.0

    try:
        metrics = [
            Faithfulness(llm=judge_llm),
            AnswerCorrectness(llm=judge_llm),
        ]
        dataset = Dataset.from_dict({
            "question":     [question],
            "answer":       [user_answer],
            "contexts":     [[context]],
            "ground_truth": [ground_truth or ""],
        })
        result = evaluate(
            dataset,
            metrics=metrics,
            llm=judge_llm,
            embeddings=embeddings,
            raise_exceptions=False,
        )
        scores_df   = result.to_pandas()
        numeric_df  = scores_df.select_dtypes(include=[np.number])
        scores_dict = numeric_df.mean().to_dict()

        faithfulness       = clean_score(scores_dict.get("faithfulness",       0.0))
        answer_correctness = clean_score(scores_dict.get("answer_correctness", 0.0))

        print(
            f"[DEBUG] RAGAS 1차 | "
            f"faith={faithfulness:.4f} corr={answer_correctness:.4f}"
        )
    except Exception as e:
        print(f"[ERROR] RAGAS 평가 실패, LLM judge fallback 전환: {e}")

    if faithfulness == 0.0:
        print("[INFO] faithfulness 0.00 → LLM judge fallback")
        faithfulness = _evaluate_faithfulness(context, user_answer, judge_llm)

    if answer_correctness == 0.0:
        print("[INFO] answer_correctness 0.00 → LLM judge fallback")
        answer_correctness = _evaluate_answer_correctness(question, user_answer, ground_truth, judge_llm)

    # answer_relevancy: LLM judge 직접 사용 (RAGAS 임베딩 기반은 한국어 불안정)
    answer_relevancy = _evaluate_answer_relevancy(question, user_answer, judge_llm)

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
