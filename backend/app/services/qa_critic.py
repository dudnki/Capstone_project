"""
G-Eval 기반 Q&A Critique-Refine 모듈.

논문: G-Eval: NLG Evaluation using GPT-4 with Better Human Alignment
      (Liu et al., 2023) https://arxiv.org/abs/2303.16634

핵심:
- Task Introduction + Criteria + Evaluation Steps (CoT) + Form-filling
- LLM이 단계별(Step 1~7) reasoning 후 5차원 점수 + feedback 출력
- 통과 기준: 평균 >= threshold AND 모든 차원 >= min_per_dim
- 실패 시 feedback을 재생성 프롬프트에 주입

공개 함수:
- critique_qa(...)        : Q&A 1쌍을 G-Eval로 평가
- is_qa_passing(...)      : 통과 판정
- format_critique_log(...): 로그용 한 줄 요약
- THRESHOLD, MIN_PER_DIM  : 기본값
"""
from __future__ import annotations

import os

from openai import OpenAI
from pydantic import BaseModel, Field, field_validator
import instructor


# ---------- 설정 ----------
# G-Eval (Liu et al., 2023)은 GPT-4 quality evaluator를 명시적으로 권고함.
# Self-bias 방지를 위해 Generator(gpt-4o-mini)와 다른 모델(gpt-4o) 사용.
_OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
_openai_client = OpenAI(api_key=_OPENAI_API_KEY)
_critic_client = instructor.from_openai(_openai_client)
_CRITIC_MODEL = "gpt-4o"

# 기본 통과 기준
THRESHOLD: float = 3.75        # 5점 만점 평균 (정규화 0.75)
MIN_PER_DIM: int = 3           # 모든 차원이 이 이상이어야 통과


# ---------- 출력 스키마 ----------
class CritiqueScore(BaseModel):
    """G-Eval 5차원 평가 결과 + CoT reasoning + 개선 피드백."""

    reasoning: str = Field(
        ...,
        description="Step 1~7의 단계별 추론 (Chain-of-Thought 흔적)",
    )
    specificity: int = Field(..., ge=1, le=5, description="답변의 구체성")
    groundedness: int = Field(..., ge=1, le=5, description="청크 근거 충실도")
    non_triviality: int = Field(..., ge=1, le=5, description="질문 변별력")
    bloom_alignment: int = Field(..., ge=1, le=5, description="선택 Bloom 유형 적합도")
    clarity: int = Field(..., ge=1, le=5, description="질문/답변 명확성")
    feedback: str = Field(
        ...,
        description="다음 시도에서 개선해야 할 점 1~2문장으로 구체적으로",
    )

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

    @property
    def average(self) -> float:
        return (
            self.specificity + self.groundedness + self.non_triviality
            + self.bloom_alignment + self.clarity
        ) / 5.0

    @property
    def min_score(self) -> int:
        return min(
            self.specificity, self.groundedness, self.non_triviality,
            self.bloom_alignment, self.clarity,
        )


# ---------- G-Eval 프롬프트 (수동 CoT) ----------
_SYSTEM_MSG = (
    "당신은 문서 기반 평가 데이터셋의 품질을 엄격하게 채점하는 심사관입니다. "
    "각 기준을 1~5점으로 채점하며, 1점=매우 부족, 3점=보통, 5점=매우 우수입니다. "
    "후한 점수를 주지 말고, 부족함이 보이면 4점 이하로 채점하세요. "
    "반드시 reasoning에 Step 1~7의 단계적 추론을 적은 뒤 점수를 부여하세요."
)


def _build_critique_prompt(
    question: str,
    answer: str,
    answer_quote: str,
    chunk: str,
    bloom_type: str,
) -> str:
    """G-Eval Task Introduction + Criteria + Evaluation Steps (CoT) 통합 프롬프트."""
    return (
        "[Task Introduction]\n"
        "한국어 문서 청크에서 생성된 Q&A 쌍의 품질을 5가지 기준으로 엄격히 평가하라.\n\n"
        "[Criteria — 각 1~5점]\n"
        "1. specificity (구체성): 답변에 청크의 구체적 수치/명칭/고유명사가 포함되어 있는가?\n"
        "   1=일반적 표현만, 3=일부 구체, 5=수치/명칭 풍부\n"
        "2. groundedness (근거성): 답변의 **모든 사실/예시/인용**이 청크에 명시적으로 존재하는가?\n"
        "   1=청크에 없는 외부 지식·예시·인용이 섞임 (hallucination), 3=대체로 근거하나 일부 의심, "
        "   5=답변의 모든 정보가 청크에서 확인 가능\n"
        "   ※ 답변에 영문 참고문헌·외부 예시가 들어갔는데 청크에 없으면 1~2점.\n"
        "3. non_triviality (변별력): 질문이 표지/주제 같은 뻔한 형태가 아니라 청크를 읽어야 답할 수 있는가?\n"
        "   1=뻔한 질문, 3=보통, 5=청크 정독해야 답할 수 있음\n"
        f"4. bloom_alignment ('{bloom_type}' 유형 적합도): 질문이 해당 Bloom 유형의 전형적 형태인가?\n"
        "   1=다른 유형이 더 자연스러움, 3=대체로 부합, 5=완벽히 부합\n"
        "5. clarity (명확성): 질문이 한국어로 명확하게 작성되고 답이 한 가지로 정해지는가?\n"
        "   1=질문이 모호하거나 영문 위주, 3=대체로 명확, 5=한국어로 깔끔하고 답 유일\n"
        "   ※ 질문 전체가 영문이면 1점 (한국어 문서 평가셋은 한국어 질문이 원칙).\n\n"
        "[Evaluation Steps — Chain of Thought, reasoning 필드에 반드시 적을 것]\n"
        "Step 1. 청크의 핵심 사실/수치/명칭을 식별\n"
        "Step 2. answer_quote가 청크에 실제 등장하는지 + 너무 짧은 헤더/번호 인용이 아닌지 확인\n"
        "Step 3. 답변의 모든 명시적 사실/예시/인용이 청크에 있는지 한 줄씩 검증 → groundedness 판단 "
        "(청크에 없는 외부 예시가 있으면 즉시 감점)\n"
        "Step 4. 답변이 구체 사실(수치/명칭)을 포함하는지 → specificity 판단\n"
        "Step 5. 질문이 한국어로 작성됐는지 + 뻔한 형태가 아닌지 → non_triviality, clarity 판단\n"
        f"Step 6. 질문이 '{bloom_type}' 유형의 전형 형태인지 → bloom_alignment 판단\n"
        "Step 7. 각 차원 점수 부여 + 가장 약한 차원을 기준으로 개선 feedback 작성\n\n"
        f"[원문 청크]\n{chunk}\n\n"
        "[평가 대상]\n"
        f"질문: {question}\n"
        f"답변: {answer}\n"
        f"답변 근거(청크 인용): {answer_quote}\n"
        f"선택된 Bloom 유형: {bloom_type}\n\n"
        "각 차원 점수와 reasoning(Step별 추론), feedback(다음 시도용 개선 방향)을 JSON으로 출력하세요."
    )


# ---------- Critique 함수 ----------
def critique_qa(
    question: str,
    answer: str,
    answer_quote: str,
    chunk: str,
    bloom_type: str,
) -> CritiqueScore | None:
    """
    G-Eval 방식으로 Q&A 1쌍을 평가.

    Returns:
        CritiqueScore (성공) 또는 None (LLM 호출/검증 실패)
    """
    prompt = _build_critique_prompt(question, answer, answer_quote, chunk, bloom_type)
    try:
        score: CritiqueScore = _critic_client.chat.completions.create(
            model=_CRITIC_MODEL,
            messages=[
                {"role": "system", "content": _SYSTEM_MSG},
                {"role": "user", "content": prompt},
            ],
            response_model=CritiqueScore,
            max_retries=2,           # Pydantic field validator 자동 재시도
            temperature=0.1,         # 채점은 일관성 우선
        )
        return score
    except Exception as e:
        print(f"  [Critique] 평가 호출 실패: {str(e)[:150]}")
        return None


# ---------- 통과 판정 ----------
def is_qa_passing(
    score: CritiqueScore,
    threshold: float = THRESHOLD,
    min_per_dim: int = MIN_PER_DIM,
) -> bool:
    """
    통과 조건:
    - 평균 점수 >= threshold (기본 3.75/5 = 정규화 0.75)
    - 모든 차원이 min_per_dim 이상 (기본 3)
    """
    return score.average >= threshold and score.min_score >= min_per_dim


def format_critique_log(
    score: CritiqueScore,
    threshold: float = THRESHOLD,
    min_per_dim: int = MIN_PER_DIM,
) -> str:
    """로그용 한 줄 요약."""
    status = "✅ PASS" if is_qa_passing(score, threshold, min_per_dim) else "❌ FAIL"
    return (
        f"{status} avg={score.average:.2f} "
        f"(spec={score.specificity} ground={score.groundedness} "
        f"non_triv={score.non_triviality} bloom={score.bloom_alignment} "
        f"clar={score.clarity})"
    )
