import os
import json
import numpy as np
from dotenv import load_dotenv
from datasets import Dataset
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

from ragas.metrics import (
    Faithfulness,
    AnswerCorrectness,
)
from ragas import evaluate

load_dotenv()

_KOREAN_SYSTEM = SystemMessage(content="당신은 한국어 전문가입니다. 모든 질문과 답변을 반드시 한국어로만 작성하세요.")

class _KoreanChatOpenAI(ChatOpenAI):
    """RAGAS 내부 프롬프트에 한국어 시스템 메시지를 주입하는 래퍼."""

    def invoke(self, input, config=None, **kwargs):
        if isinstance(input, list) and not any(isinstance(m, SystemMessage) for m in input):
            input = [_KOREAN_SYSTEM] + list(input)
        return super().invoke(input, config, **kwargs)

    async def ainvoke(self, input, config=None, **kwargs):
        if isinstance(input, list) and not any(isinstance(m, SystemMessage) for m in input):
            input = [_KOREAN_SYSTEM] + list(input)
        return await super().ainvoke(input, config, **kwargs)

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


def _get_feedback_llm():
    return _KoreanChatOpenAI(
        api_key=os.environ.get("OPENAI_API_KEY"),
        model="gpt-4o-mini",
        temperature=0.3,
    )


def generate_question_feedback(
    question: str,
    user_answer: str,
    ground_truth: str,
    scores: dict,
) -> dict:
    """문항별 점수 근거 · 개선점 · 학습 조언 생성."""
    if not user_answer:
        return {"reasoning": "답변이 제출되지 않았습니다.", "improvements": "", "advice": ""}

    llm = _get_feedback_llm()
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

    llm = _get_feedback_llm()
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


def _evaluate_answer_relevancy(question: str, answer: str, llm) -> float:
    """
    LLM 판사 방식으로 질문 적합도를 직접 평가합니다.
    RAGAS AnswerRelevancy(역질문 생성)를 대체합니다.

    - 1.0: 질문의 핵심을 완전하고 직접적으로 다룸
    - 0.7: 질문에 관련되나 일부 핵심 내용 누락
    - 0.4: 부분적으로만 관련됨
    - 0.1: 질문과 거의 관련 없음
    """
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
    judge_llm = _KoreanChatOpenAI(
        api_key=os.environ.get("OPENAI_API_KEY"),
        model="gpt-4o-mini",
        temperature=0,
    )

    embeddings = get_embeddings()

    # Faithfulness, AnswerCorrectness — RAGAS 처리
    # AnswerRelevancy — LLM 직접 평가로 대체 (역질문 방식 불안정 문제 해결)
    metrics = [
        Faithfulness(llm=judge_llm),
        AnswerCorrectness(llm=judge_llm),
    ]

    # ── 데이터셋 구성 ─────────────────────────────────────
    dataset = Dataset.from_dict({
        "question":     [question],
        "answer":       [user_answer],
        "contexts":     [[context]],
        "ground_truth": [ground_truth or ""],
    })

    # ── RAGAS 평가 실행 ───────────────────────────────────
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

    try:
        scores_df   = result.to_pandas()
        numeric_df  = scores_df.select_dtypes(include=[np.number])
        scores_dict = numeric_df.mean().to_dict()

        print(f"[DEBUG] numeric columns : {list(numeric_df.columns)}")
        print(f"[DEBUG] scores_dict     : {scores_dict}")

    except Exception as e:
        print(f"[ERROR] 결과 변환 실패: {e}")
        return _zero_scores()

    # ── 점수 추출 ─────────────────────────────────────────
    faithfulness       = clean_score(scores_dict.get("faithfulness",       0.0))
    answer_correctness = clean_score(scores_dict.get("answer_correctness", 0.0))

    # ── 질문 적합도: LLM 직접 평가 ───────────────────────
    answer_relevancy = _evaluate_answer_relevancy(question, user_answer, judge_llm)

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
