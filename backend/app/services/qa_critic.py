"""
G-Eval 기반 Q&A Critique-Refine 모듈 (정석 logprob 구현).

논문: G-Eval: NLG Evaluation using GPT-4 with Better Human Alignment
      (Liu et al., 2023) https://arxiv.org/abs/2303.16634

핵심 (논문 Section 2.3):
- LLM이 단계별(CoT) reasoning 후 1~5점 부여
- **점수는 토큰 확률 가중합으로 산출**: score = Σ (i × P(i)),  i ∈ {1..5}
  → sampling 분산 제거, 연속값으로 top-K 정렬 변별력 확보
- 본 구현은 2-call 구조:
  Call A: reasoning + feedback (Pydantic 구조화)
  Call B: Call A의 reasoning을 컨텍스트로 주고 점수만 logprobs로 산출

가중치 (`weighted_score`):
- groundedness 0.40 — 환각 방지 최우선
- specificity   0.20
- bloom_alignment 0.15
- non_triviality  0.15
- clarity         0.10

공개:
- critique_qa(...)         : Q&A 1쌍을 G-Eval로 평가 (CritiqueScore | None)
- is_qa_passing(...)       : 통과 판정
- format_critique_log(...) : 로그용 한 줄 요약
- THRESHOLD, MIN_PER_DIM   : 기본 임계값
- DIM_WEIGHTS              : 차원별 가중치
"""
from __future__ import annotations

import math
import os

from openai import OpenAI
from pydantic import BaseModel, Field, field_validator
import instructor


# ---------- 설정 ----------
_OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
_openai_client = OpenAI(api_key=_OPENAI_API_KEY)
_critic_client = instructor.from_openai(_openai_client)
_CRITIC_MODEL = "gpt-4o"

# 평균 기반 통과 임계값
THRESHOLD: float = 3.75        # 5점 만점 평균
MIN_PER_DIM: float = 3.0       # 모든 차원이 이 이상이어야 통과

# top-K 정렬용 차원별 가중치 (합 = 1.0)
DIM_WEIGHTS: dict[str, float] = {
    "groundedness":    0.40,
    "specificity":     0.20,
    "bloom_alignment": 0.15,
    "non_triviality":  0.15,
    "clarity":         0.10,
}

# 점수 출력 순서 (Call B 프롬프트와 동일해야 함)
_DIM_ORDER: tuple[str, ...] = (
    "specificity", "groundedness", "non_triviality", "bloom_alignment", "clarity",
)


# ---------- 출력 스키마 ----------
class _ReasoningOnly(BaseModel):
    """Call A 출력 — reasoning과 feedback만. 점수는 Call B에서 logprobs로 추출."""

    reasoning: str = Field(..., description="Step 1~7의 단계별 추론 (Chain-of-Thought)")
    feedback: str = Field(..., description="다음 시도에서 개선할 점 1~2문장")

    @field_validator("reasoning")
    @classmethod
    def _reasoning_min_len(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 30:
            raise ValueError("reasoning이 너무 짧음. Step별 단계적 추론 필요 (최소 30자)")
        return v

    @field_validator("feedback")
    @classmethod
    def _feedback_min_len(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 10:
            raise ValueError("feedback이 너무 짧음. 구체적 개선 방향 필요 (최소 10자)")
        return v


class CritiqueScore(BaseModel):
    """G-Eval 결과: 5차원 연속 점수(logprob 가중합) + CoT reasoning + feedback."""

    reasoning: str
    feedback: str
    # logprob 가중합 → 연속값 (1.0 ~ 5.0)
    specificity: float
    groundedness: float
    non_triviality: float
    bloom_alignment: float
    clarity: float

    @property
    def average(self) -> float:
        return (
            self.specificity + self.groundedness + self.non_triviality
            + self.bloom_alignment + self.clarity
        ) / 5.0

    @property
    def min_score(self) -> float:
        return min(
            self.specificity, self.groundedness, self.non_triviality,
            self.bloom_alignment, self.clarity,
        )

    @property
    def weighted_score(self) -> float:
        """top-K 정렬용 차원별 가중합 점수 (1.0 ~ 5.0)."""
        return (
            self.specificity     * DIM_WEIGHTS["specificity"]
            + self.groundedness    * DIM_WEIGHTS["groundedness"]
            + self.non_triviality  * DIM_WEIGHTS["non_triviality"]
            + self.bloom_alignment * DIM_WEIGHTS["bloom_alignment"]
            + self.clarity         * DIM_WEIGHTS["clarity"]
        )


# ---------- 프롬프트 ----------
_SYSTEM_MSG = (
    "당신은 문서 기반 평가 데이터셋의 품질을 엄격하게 채점하는 심사관입니다. "
    "각 차원을 1~5점으로 채점하며, 1점=매우 부족, 3점=보통, 5점=매우 우수입니다. "
    "후한 점수를 주지 말고, 부족함이 보이면 4점 이하로 채점하세요."
)


def _build_reasoning_prompt(
    question: str,
    answer: str,
    answer_quote: str,
    chunk: str,
    bloom_type: str,
) -> str:
    """Call A: Step별 reasoning과 feedback만 생성하는 프롬프트 (점수는 Call B에서)."""
    return (
        "[Task]\n"
        "한국어 문서 청크에서 생성된 Q&A 쌍의 품질을 5가지 차원으로 엄격히 분석하라.\n\n"
        "[차원 정의]\n"
        "1. specificity (구체성): 답변에 청크의 구체적 수치/명칭/고유명사가 있는가?\n"
        "2. groundedness (근거성): 답변의 모든 사실/예시가 청크에 명시적으로 존재하는가? "
        "(외부 지식·환각 시 감점)\n"
        "3. non_triviality (변별력): 청크를 읽어야 답할 수 있는가? (뻔한 질문 감점)\n"
        f"4. bloom_alignment ('{bloom_type}' 적합도): 질문이 해당 Bloom 유형의 전형인가?\n"
        "5. clarity (명확성): 한국어로 명확하고 답이 한 가지로 정해지는가? "
        "(전체 영문 질문은 감점)\n\n"
        "[분석 단계 — reasoning 필드에 반드시 적을 것]\n"
        "Step 1. 청크의 핵심 사실/수치/명칭을 식별\n"
        "Step 2. answer_quote가 청크에 실제 등장하는지 + 단순 헤더가 아닌지 확인\n"
        "Step 3. 답변의 모든 명시적 정보가 청크에 있는지 한 줄씩 검증 → groundedness 판단\n"
        "Step 4. 답변이 구체 사실(수치/명칭)을 포함하는지 → specificity 판단\n"
        "Step 5. 질문이 한국어로 작성됐는지 + 뻔한 형태가 아닌지 → non_triviality, clarity 판단\n"
        f"Step 6. 질문이 '{bloom_type}' 유형 전형인지 → bloom_alignment 판단\n"
        "Step 7. 가장 약한 차원을 기준으로 다음 시도용 개선 feedback 작성\n\n"
        f"[원문 청크]\n{chunk}\n\n"
        "[평가 대상]\n"
        f"질문: {question}\n"
        f"답변: {answer}\n"
        f"답변 근거(청크 인용): {answer_quote}\n"
        f"선택된 Bloom 유형: {bloom_type}\n\n"
        "이번 호출에서는 **점수를 적지 말고** reasoning(Step별 분석)과 "
        "feedback(개선 방향)만 JSON으로 출력하라. 점수는 다음 단계에서 산출한다."
    )


_SCORE_OUTPUT_FORMAT = (
    "specificity:N groundedness:N non_triviality:N bloom_alignment:N clarity:N"
)


def _build_scoring_prompt(reasoning: str) -> str:
    """Call B: Call A의 reasoning을 바탕으로 점수만 단일 라인 출력."""
    return (
        "방금 너의 분석은 다음과 같았다:\n"
        "---\n"
        f"{reasoning}\n"
        "---\n\n"
        "위 분석을 바탕으로 5개 차원의 점수를 정확히 다음 형식 한 줄로만 출력하라 "
        "(각 N은 1, 2, 3, 4, 5 중 정수 한 자리, 콜론 뒤 공백 없음):\n"
        f"{_SCORE_OUTPUT_FORMAT}\n\n"
        "다른 텍스트(설명/주석/줄바꿈 추가)는 절대 포함하지 마라."
    )


# ---------- logprob 처리 ----------
# tiktoken o200k_base 기준 "1"~"5" 토큰 ID (검증됨: 단일 토큰, 인접 ID)
_DIGIT_TOKEN_IDS = {"1": 16, "2": 17, "3": 18, "4": 19, "5": 20}
_DIGIT_TOKENS = {"1", "2", "3", "4", "5"}


def _weighted_score_from_logprobs(top_logprobs: list) -> float:
    """
    단일 토큰 위치의 top_logprobs에서 '1'~'5' 토큰 분포를 추출,
    softmax 정규화 후 가중합 점수 산출.

      score = Σ (i × P_normalized(i))

    Returns:
        1.0 ~ 5.0 사이 연속값. 1~5 토큰이 top_logprobs에 없으면 폴백으로 3.0.
    """
    digit_probs: dict[int, float] = {}
    for entry in top_logprobs:
        tok = entry.token.strip()
        if tok in _DIGIT_TOKENS:
            # 동일 숫자가 여러 form으로 들어올 가능성에 대비 (방어적)
            digit = int(tok)
            digit_probs[digit] = digit_probs.get(digit, 0.0) + math.exp(entry.logprob)

    if not digit_probs:
        return 3.0  # 폴백: 1~5가 top-20에 없으면 중간값

    total = sum(digit_probs.values())
    return sum(d * (p / total) for d, p in digit_probs.items())


def _extract_dim_scores_from_tokens(tokens: list) -> dict[str, float] | None:
    """
    Call B 응답 토큰 스트림에서 콜론(":")을 찾고 그 다음 토큰의 logprobs로
    각 차원 점수를 추출. 5개 차원이 모두 추출되면 dict 반환, 부족하면 None.

    응답 형식: "specificity:N groundedness:N non_triviality:N bloom_alignment:N clarity:N"
    → 콜론 토큰(":") 5개 + 각각 바로 뒤 숫자 토큰 5개를 잡으면 됨.
    """
    scores: dict[str, float] = {}
    score_idx = 0
    for i, tok_entry in enumerate(tokens):
        if score_idx >= len(_DIM_ORDER):
            break
        if tok_entry.token == ":" and i + 1 < len(tokens):
            digit_tok = tokens[i + 1]
            # 다음 토큰이 숫자 토큰이어야 함 — 아니면 형식 위반, 폴백 시도
            if digit_tok.token.strip() in _DIGIT_TOKENS:
                weighted = _weighted_score_from_logprobs(digit_tok.top_logprobs)
                scores[_DIM_ORDER[score_idx]] = weighted
                score_idx += 1

    if len(scores) != len(_DIM_ORDER):
        return None
    return scores


# ---------- Critique 함수 (2-call) ----------
def critique_qa(
    question: str,
    answer: str,
    answer_quote: str,
    chunk: str,
    bloom_type: str,
) -> CritiqueScore | None:
    """
    G-Eval 정석 구현 (logprob 가중 점수).

    Call A: reasoning + feedback (instructor + Pydantic)
    Call B: 5개 차원 점수 (vanilla SDK + logprobs=True, top_logprobs=20)

    Returns:
        CritiqueScore (성공) 또는 None (어느 한 호출이라도 실패 시)
    """
    # ---- Call A: reasoning + feedback ----
    try:
        analysis: _ReasoningOnly = _critic_client.chat.completions.create(
            model=_CRITIC_MODEL,
            messages=[
                {"role": "system", "content": _SYSTEM_MSG},
                {
                    "role": "user",
                    "content": _build_reasoning_prompt(
                        question, answer, answer_quote, chunk, bloom_type,
                    ),
                },
            ],
            response_model=_ReasoningOnly,
            max_retries=2,
            temperature=0.1,
        )
    except Exception as e:
        print(f"  [Critique] Call A (reasoning) 실패: {str(e)[:150]}")
        return None

    # ---- Call B: 점수만 logprobs로 ----
    try:
        completion = _openai_client.chat.completions.create(
            model=_CRITIC_MODEL,
            messages=[
                {"role": "system", "content": _SYSTEM_MSG},
                {"role": "user", "content": _build_scoring_prompt(analysis.reasoning)},
            ],
            temperature=0.0,
            logprobs=True,
            top_logprobs=20,
            max_tokens=40,
        )
    except Exception as e:
        print(f"  [Critique] Call B (scoring) 실패: {str(e)[:150]}")
        return None

    logprobs_content = completion.choices[0].logprobs
    if logprobs_content is None or logprobs_content.content is None:
        print("  [Critique] Call B에 logprobs 없음 — 모델 응답 이상")
        return None

    dim_scores = _extract_dim_scores_from_tokens(logprobs_content.content)
    if dim_scores is None:
        # 형식 위반 시 raw 텍스트도 같이 찍어서 디버그 도움
        raw = completion.choices[0].message.content or ""
        print(f"  [Critique] 점수 토큰 추출 실패 — 응답: {raw[:120]!r}")
        return None

    return CritiqueScore(
        reasoning=analysis.reasoning,
        feedback=analysis.feedback,
        **dim_scores,
    )


# ---------- 통과 판정 ----------
def is_qa_passing(
    score: CritiqueScore,
    threshold: float = THRESHOLD,
    min_per_dim: float = MIN_PER_DIM,
) -> bool:
    """평균 >= threshold AND 모든 차원 >= min_per_dim."""
    return score.average >= threshold and score.min_score >= min_per_dim


def format_critique_log(
    score: CritiqueScore,
    threshold: float = THRESHOLD,
    min_per_dim: float = MIN_PER_DIM,
) -> str:
    """로그용 한 줄 요약 (연속 점수는 소수 둘째자리까지)."""
    status = "✅ PASS" if is_qa_passing(score, threshold, min_per_dim) else "❌ FAIL"
    return (
        f"{status} avg={score.average:.2f} weighted={score.weighted_score:.2f} "
        f"(spec={score.specificity:.2f} ground={score.groundedness:.2f} "
        f"non_triv={score.non_triviality:.2f} bloom={score.bloom_alignment:.2f} "
        f"clar={score.clarity:.2f})"
    )
