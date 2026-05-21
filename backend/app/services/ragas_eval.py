import os
import json
import numpy as np
from dotenv import load_dotenv
from datasets import Dataset
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_openai import ChatOpenAI
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
    return ChatOpenAI(
        api_key=os.environ.get("OPENAI_API_KEY"),
        model="gpt-4o",
        temperature=0,
    )

def _get_translation_llm():
    return ChatOpenAI(
        api_key=os.environ.get("OPENAI_API_KEY"),
        model="gpt-4o-mini",
        temperature=0,
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
    prompt = f"""당신은 교육 평가 전문가입니다. 아래 문제와 학생 답변, 채점 결과를 분석해 구체적인 피드백을 작성하세요.
반드시 한국어로만 작성하세요. 영어, 한자, 러시아어 등 다른 언어를 절대 사용하지 마세요.

[문제]: {question}
[모범 답안]: {ground_truth}
[학생 답변]: {user_answer}

[채점 결과]
- 질문 이해도: {scores.get('answer_relevancy', 0):.2f} / 1.00
- 내용 완성도: {scores.get('answer_correctness', 0):.2f} / 1.00
- 자료 활용도: {scores.get('faithfulness', 0):.2f} / 1.00
- 종합 점수  : {scores.get('avg_score', 0):.2f} / 1.00

[작성 원칙]
- improvements: 학생 답변에서 실제로 빠진 내용이나 잘못된 부분을 구체적으로 짚어주세요. "더 공부하세요" 같은 모호한 표현 금지.
- advice: 학생이 지금 당장 실행할 수 있는 단계적 행동을 1단계, 2단계 형식으로 제시하세요. 예) "1단계: ~개념을 다시 읽고 ~와 ~의 차이를 정리하세요. 2단계: ~"

아래 JSON 형식으로만 응답하세요 (다른 텍스트 금지):
{{
  "reasoning": "각 지표별 점수 근거를 2~3문장으로 설명 (한국어만 사용)",
  "improvements": "학생 답변에서 실제로 누락되거나 부족한 내용을 모범 답안과 비교해 구체적으로 2~3문장으로 (한국어만 사용)",
  "advice": "1단계, 2단계 형식으로 지금 당장 실행할 수 있는 구체적인 학습 행동 제시 (한국어만 사용)"
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
반드시 한국어로만 작성하세요. 영어, 한자, 러시아어 등 다른 언어를 절대 사용하지 마세요.

{summary_text}

[작성 원칙]
- strengths: 점수가 높은 문항이나 공통적으로 잘한 부분을 근거로 구체적으로 칭찬하세요. "잘했습니다" 같은 모호한 표현 금지.
- direction: 점수가 낮은 문항들의 공통 약점을 분석하고, 1단계·2단계·3단계 형식으로 우선순위에 따라 지금 당장 실행할 수 있는 학습 행동을 제시하세요.

아래 JSON 형식으로만 응답하세요 (다른 텍스트 금지):
{{
  "strengths": "점수 데이터를 근거로 잘한 점을 구체적으로 2~3문장 (한국어만 사용)",
  "direction": "1단계, 2단계, 3단계 형식으로 우선순위별 구체적 학습 행동 제시 (한국어만 사용)"
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
반드시 한국어로만 작성하세요. 영어, 한자, 러시아어 등 다른 언어를 절대 사용하지 마세요.

[질문]: {question}
[답변]: {answer}

[평가 원칙]:
- 답변이 질문의 핵심 포인트를 하나라도 직접 언급했다면 최소 0.6 이상 부여하세요.
- 완벽하지 않더라도 질문의 방향에 맞게 답했다면 관대하게 평가하세요.

[평가 기준]:
1.0 = 질문의 핵심을 완전하고 직접적으로 다룸
0.8 = 핵심 내용을 대부분 다루었으나 일부 누락
0.6 = 질문의 핵심 포인트를 언급했으나 설명이 불충분
0.4 = 질문과 관련은 있으나 핵심을 벗어남
0.2 = 질문과 거의 관련 없음

결과를 반드시 아래 JSON 형식으로만 출력하세요:
{{"score": 점수(0.0~1.0), "reason": "한 문장 이유 (한국어만 사용)"}}"""

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
반드시 한국어로만 작성하세요. 영어, 한자, 러시아어 등 다른 언어를 절대 사용하지 마세요.

[참고 문서]: {context[:2000]}
[답변]: {answer}

[평가 원칙]:
- 답변의 핵심 주장이 문서에 근거한다면 일부 표현 차이나 부연 설명이 있어도 관대하게 평가하세요.
- 문서에 있는 개념을 자신의 언어로 재서술한 경우도 근거 있음으로 인정하세요.

[평가 기준]:
1.0 = 답변의 모든 내용이 문서에서 직접 지지됨
0.8 = 대부분 문서에 근거하며 소폭의 부연 설명 포함
0.6 = 핵심은 문서에 근거하나 일부 외부 내용 혼재
0.4 = 절반 정도만 문서에 근거함
0.2 = 문서와 거의 관계없는 내용

결과를 반드시 아래 JSON 형식으로만 출력하세요:
{{"score": 점수(0.0~1.0), "reason": "한 문장 이유 (한국어만 사용)"}}"""

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
아래 질문, 모범 답안, 제출된 답변을 비교하여 학생의 개념 이해도를 평가하세요.
반드시 한국어로만 작성하세요. 영어, 한자, 러시아어 등 다른 언어를 절대 사용하지 마세요.

[질문]: {question}
[모범 답안]: {ground_truth}
[제출된 답변]: {answer}

[평가 원칙]:
- 표현이나 단어가 달라도 핵심 개념을 올바르게 이해했다면 높은 점수를 부여하세요.
- 모범 답안의 키워드를 그대로 사용했는지가 아니라, 핵심 논리와 개념을 파악했는지를 기준으로 평가하세요.

[평가 기준]:
1.0 = 핵심 개념과 논리를 모두 정확히 이해하고 설명함
0.8 = 핵심 개념을 대체로 이해했으나 일부 세부 내용 누락
0.6 = 핵심 개념은 파악했으나 설명이 불충분하거나 일부 오류
0.4 = 개념을 부분적으로만 이해하거나 중요한 논리 누락
0.2 = 핵심 개념 이해가 미흡하거나 크게 벗어남

결과를 반드시 아래 JSON 형식으로만 출력하세요:
{{"score": 점수(0.0~1.0), "reason": "한 문장 이유 (한국어만 사용)"}}"""

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
        print(f"[DEBUG] answer_correctness concept (LLM judge): {score:.4f} | {data.get('reason', '')}")
        return round(score, 4)
    except Exception as e:
        print(f"[ERROR] answer_correctness 평가 실패: {e}")
        return 0.5


def _evaluate_answer_correctness_keyword(question: str, answer: str, ground_truth: str, llm) -> float:
    """키워드·핵심 사실 포함 여부 관점 채점 (RAGAS 대체용 앙상블 파트너)."""
    if not ground_truth:
        return 0.5

    prompt = f"""당신은 교육 평가 전문가입니다.
아래 질문, 모범 답안, 제출된 답변을 비교하여 핵심 키워드와 사실 포함 여부를 평가하세요.
반드시 한국어로만 작성하세요. 영어, 한자, 러시아어 등 다른 언어를 절대 사용하지 마세요.

[질문]: {question}
[모범 답안]: {ground_truth}
[제출된 답변]: {answer}

[평가 원칙]:
- 모범 답안의 핵심 키워드·수치·개념이 답변에 포함되었는지를 기준으로 평가하세요.
- 표현이 달라도 동일한 의미의 키워드로 대체되었다면 포함된 것으로 인정하세요.

[평가 기준]:
1.0 = 모범 답안의 핵심 키워드·사실을 모두 포함
0.8 = 핵심 키워드 대부분 포함, 일부 누락
0.6 = 핵심 키워드 절반 이상 포함
0.4 = 핵심 키워드 일부만 포함
0.2 = 핵심 키워드 거의 없음

결과를 반드시 아래 JSON 형식으로만 출력하세요:
{{"score": 점수(0.0~1.0), "reason": "한 문장 이유 (한국어만 사용)"}}"""

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
        print(f"[DEBUG] answer_correctness keyword (LLM judge): {score:.4f} | {data.get('reason', '')}")
        return round(score, 4)
    except Exception as e:
        print(f"[ERROR] answer_correctness keyword 평가 실패: {e}")
        return 0.5


# ─────────────────────────────────────────────────────────
# 한국어 → 영어 번역 (RAGAS 안정성 향상용)
# ─────────────────────────────────────────────────────────
def _translate_to_english(text: str) -> str:
    """한국어 텍스트를 영어로 번역. RAGAS가 영어에서 더 안정적으로 작동하기 때문에 사용."""
    if not text:
        return text
    try:
        llm = _get_translation_llm()
        result = llm.invoke([HumanMessage(content=(
            "Translate the following Korean text to English. "
            "Preserve all technical terms, numbers, and proper nouns exactly as they are. "
            "Output only the translated text, nothing else.\n\n"
            f"{text}"
        ))])
        translated = result.content.strip()
        print(f"[DEBUG] 번역 완료 ({len(text)}자 → {len(translated)}자)")
        return translated
    except Exception as e:
        print(f"[WARN] 번역 실패, 원문 사용: {e}")
        return text


# ─────────────────────────────────────────────────────────
# 모델 평가 (한국어→영어 번역 후 RAGAS → 0.00이면 LLM judge fallback)
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
        # 한국어 → 영어 번역 후 RAGAS에 입력 (RAGAS가 영어에서 더 안정적)
        print("[INFO] RAGAS용 영어 번역 시작...")
        q_en  = _translate_to_english(question)
        a_en  = _translate_to_english(answer)
        c_en  = _translate_to_english(context[:2000])
        gt_en = _translate_to_english(ground_truth or "")

        metrics = [
            Faithfulness(llm=judge_llm),
            AnswerRelevancy(llm=judge_llm, embeddings=embeddings),
            AnswerCorrectness(llm=judge_llm),
        ]
        dataset = Dataset.from_dict({
            "question":     [q_en],
            "answer":       [a_en],
            "contexts":     [[c_en]],
            "ground_truth": [gt_en],
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
        # RAGAS 실패 시 → keyword LLM judge × 0.5 + concept LLM judge × 0.5 앙상블 fallback
        print("[INFO] answer_correctness 0.00 → keyword+concept 앙상블 fallback")
        keyword_score = _evaluate_answer_correctness_keyword(question, answer, ground_truth, judge_llm)
        concept_score = _evaluate_answer_correctness(question, answer, ground_truth, judge_llm)
        answer_correctness = round(keyword_score * 0.5 + concept_score * 0.5, 4)
        print(f"[DEBUG] answer_correctness fallback 앙상블 → {answer_correctness:.4f}")
    else:
        # 앙상블: RAGAS(키워드 F1) × 0.5 + LLM judge(개념 이해도) × 0.5
        llm_corr = _evaluate_answer_correctness(question, answer, ground_truth, judge_llm)
        answer_correctness = round(answer_correctness * 0.5 + llm_corr * 0.5, 4)
        print(f"[DEBUG] answer_correctness 앙상블 → {answer_correctness:.4f}")

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
# 사용자 평가 (세 지표 모두 LLM judge 직접 사용)
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

    # answer_correctness: 번역 후 RAGAS (핵심 키워드 포함 여부 F1 측정)
    # faithfulness, answer_relevancy: LLM judge 직접 (한국어 RAGAS 불안정)
    answer_correctness = 0.0
    try:
        print("[INFO] answer_correctness RAGAS용 영어 번역 시작...")
        q_en  = _translate_to_english(question)
        a_en  = _translate_to_english(user_answer)
        c_en  = _translate_to_english(context[:2000])
        gt_en = _translate_to_english(ground_truth or "")

        dataset = Dataset.from_dict({
            "question":     [q_en],
            "answer":       [a_en],
            "contexts":     [[c_en]],
            "ground_truth": [gt_en],
        })
        result = evaluate(
            dataset,
            metrics=[AnswerCorrectness(llm=judge_llm)],
            llm=judge_llm,
            embeddings=embeddings,
            raise_exceptions=False,
        )
        scores_df = result.to_pandas()
        answer_correctness = clean_score(
            scores_df.select_dtypes(include=[np.number]).mean().get("answer_correctness", 0.0)
        )
        print(f"[DEBUG] RAGAS answer_correctness={answer_correctness:.4f}")
    except Exception as e:
        print(f"[ERROR] RAGAS answer_correctness 실패: {e}")

    if answer_correctness == 0.0:
        # RAGAS 실패 시 → keyword LLM judge × 0.5 + concept LLM judge × 0.5 앙상블 fallback
        print("[INFO] answer_correctness 0.00 → keyword+concept 앙상블 fallback")
        keyword_score = _evaluate_answer_correctness_keyword(question, user_answer, ground_truth, judge_llm)
        concept_score = _evaluate_answer_correctness(question, user_answer, ground_truth, judge_llm)
        answer_correctness = round(keyword_score * 0.5 + concept_score * 0.5, 4)
        print(f"[DEBUG] answer_correctness fallback 앙상블 → {answer_correctness:.4f}")
    else:
        # 앙상블: RAGAS(키워드 F1) × 0.5 + LLM judge(개념 이해도) × 0.5
        llm_corr = _evaluate_answer_correctness(question, user_answer, ground_truth, judge_llm)
        answer_correctness = round(answer_correctness * 0.5 + llm_corr * 0.5, 4)
        print(f"[DEBUG] answer_correctness 앙상블 → {answer_correctness:.4f}")

    faithfulness     = _evaluate_faithfulness(context, user_answer, judge_llm)
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
