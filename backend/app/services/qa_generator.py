"""
Q&A 생성 모듈.

- 청크 + 카테고리 + rare_tokens → 검증된 Q&A 한 쌍
- LLM이 청크 보고 Bloom Taxonomy 유형 자가 선택
- Citation-grounded: 답변 근거 문장 청크에서 인용 + 검증
- Pydantic + Instructor로 형식/메타표현/외국어/동어반복 자동 차단

공개 함수:
- generate_qa_for_chunks(chunks, category, rare_tokens, n=3) -> list[QAItem]
- BLOOM_TYPES (constant)
"""
from __future__ import annotations

import os
import re

from openai import OpenAI
from pydantic import BaseModel, field_validator
import instructor

from app.services.qa_critic import (
    critique_qa,
    is_qa_passing,
    format_critique_log,
    CritiqueScore,
    THRESHOLD as CRITIC_THRESHOLD,
    MIN_PER_DIM as CRITIC_MIN_PER_DIM,
)


# ---------- 설정 ----------
# Generator: gpt-4o-mini (빠르고 instruction-following 안정적).
# Critic은 qa_critic.py에서 gpt-4o 사용 — 두 모델 분리하여 self-bias 제거
# (Zheng et al. 2024, "LLM-as-a-Judge").
_OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
_openai_client = OpenAI(api_key=_OPENAI_API_KEY)
_instructor_client = instructor.from_openai(_openai_client)
_MODEL = "gpt-4o"

# Multi-chunk는 단일청크보다 통과 난이도가 구조적으로 높다
# (bloom_alignment·groundedness가 두 청크 결합 시 더 까다로움).
# 평균 임계값은 유지하고 차원별 최저점만 완화하여 false negative를 줄인다.
MULTI_MIN_PER_DIM: float = 2.5


# Single/Multi 양쪽 system 프롬프트에 공통 주입되는 질문 품질 가드.
# Why: mini 모델 시절 'X와 Y의 차이는?' 같은 유형 예시 골격 그대로 출력, 복합 질문,
#      청크 용어 paraphrase(예: '분위수'를 '양자화'로) 같은 품질 사고가 다수 발생했음.
_QUESTION_QUALITY_GUARDS = (
    "[질문 품질 가드 — 반드시 준수]\n"
    "• 1문장 1요점: 한 질문에 두 가지를 동시에 묻지 마라. "
    "'그리고', '또한', '또', '~며' 등으로 두 요점을 묶는 복합 질문 금지.\n"
    "• 표면적 골격 금지: 'X와 Y의 차이는?', 'X의 정의는?'처럼 유형 설명의 예시 골격을 "
    "그대로 베끼지 마라. 비교/분석은 **비교/분석의 측면을 반드시 명시**하라 "
    "(예: '메커니즘 측면', '성능 측면', '적용 조건 측면').\n"
    "• 청크 용어 보존: 청크에 등장하는 한국어 용어/영문 약어/고유명사를 임의로 paraphrase "
    "하거나 풀어쓰거나 번역하지 마라. (예: '분위수'를 '양자화'로 바꾸지 말 것. "
    "'L2O'를 'L2O(Optimization)'처럼 괄호로 풀지 말 것.)\n"
    "• 답이 한 가지로 정해지는 질문만 작성하라. open-ended 토론/주관식 의견 질문 금지."
)


# Bloom Taxonomy 기반 질문 유형
BLOOM_TYPES: list[tuple[str, str]] = [
    (
        "사실 확인",
        "정의/수치/명칭을 단답으로 답할 수 있는 구체적 질문. "
        "예: 'X의 정의는?', 'Y 모델의 파라미터 수는?', 'Z 지표 값은 얼마인가?'",
    ),
    (
        "이해",
        "개념의 원리/이유를 설명하라는 질문. "
        "예: 'X가 Y되는 이유는?', 'Z 메커니즘은 어떻게 작동하는가?'",
    ),
    (
        "적용",
        "구체적 조건/시나리오 하에서의 동작/효과를 묻는 질문. "
        "예: 'X 조건에서 Y는 어떤 결과를 보이는가?', 'A를 사용하면 B는 어떻게 되는가?'",
    ),
    (
        "분석",
        "원인-결과 관계, 영향, 트레이드오프를 묻는 질문. "
        "예: 'X가 Y에 미치는 영향은?', 'A와 B의 차이가 결과에 어떤 영향을 주는가?'",
    ),
    (
        "비교",
        "두 개 이상의 대상을 명시적으로 비교하는 질문. "
        "예: 'X와 Y의 차이점은?', 'A 대비 B의 장단점은?'",
    ),
]


META_PHRASES = ("이 문서", "위 글", "본 문서", "위 문단", "이 글은", "이 자료", "위 자료")


# ---------- 유틸 ----------
_ALLOWED_PATTERN = re.compile(
    r"[가-힯ㄱ-ㆎA-Za-z0-9\s\.,;:!?\-\(\)\[\]\{\}'\"%/+\*=<>±°−≥≤≠≈∼∆∇∈∉⊂⊃∪∩∧∨→←↔$$_\^&~`@#\\|]"
)


def _is_korean_or_ascii(text: str) -> bool:
    """한글, ASCII, 일반 기호만 포함하는지 (다른 언어 hallucination 차단)."""
    return len(_ALLOWED_PATTERN.sub("", text)) == 0


_JOSA_PATTERN = re.compile(
    r"([\w가-힣\)\]])\s+(은|는|이|가|을|를|의|에|에서|으로|로|와|과|도|만|"
    r"까지|부터|에게|에게서|보다|처럼|마다|이라|이라고|라고|이며|이고)\b"
)


def _normalize_korean_spaces(text: str) -> str:
    """PDF 추출 노이즈 정리: 조사 앞 잉여 공백 제거. 'LoRA 의' → 'LoRA의'."""
    return _JOSA_PATTERN.sub(r"\1\2", text)


def _filter_tokens_for_chunk(rare_tokens: list[str], chunk: str) -> list[str]:
    """청크에 실제 등장하는 rare token만 필터."""
    chunk_lower = chunk.lower()
    return [t for t in rare_tokens if t.lower() in chunk_lower]


# Citation 매칭용 — PDF 추출 노이즈 흡수 (공백/구두점/따옴표/대시 변형 무시)
# Why: LLM이 청크 문장을 "그대로 인용"해도 PDF 추출 과정의 미세한 구두점/공백 차이로
#      매칭에 실패해 후보가 통째로 탈락하는 사례가 잦음. 특히 multi-chunk에서 빈도 높음.
_MATCH_STRIP_PATTERN = re.compile(
    r"[\s\.,;:!?\-‐-―−\(\)\[\]\{\}\"'‘’“”·]+"
)


def _normalize_for_match(s: str) -> str:
    """공백·구두점·따옴표·대시 변형 무시 + 소문자. citation 부분 매칭용."""
    return _MATCH_STRIP_PATTERN.sub("", s).lower()


# ---------- 출력 스키마 ----------
class QAResult(BaseModel):
    """LLM이 생성하는 Q&A 한 쌍 (citation-grounded)."""
    bloom_type: str
    question: str
    answer: str
    answer_quote: str  # 답변 근거 문장 — 청크에 실제 존재해야 함
    anchor_used: str | None = None

    @field_validator("question")
    @classmethod
    def _validate_question(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 10:
            raise ValueError("질문이 너무 짧음 (최소 10자)")
        for p in META_PHRASES:
            if p in v:
                raise ValueError(f"메타 표현 사용 금지: '{p}'")
        if not v.endswith(("?", "?")):
            raise ValueError("질문은 물음표(?)로 끝나야 함")
        if not _is_korean_or_ascii(v):
            raise ValueError("질문에 한국어/영문/기호 외 다른 언어가 포함됨")
        return v

    @field_validator("answer")
    @classmethod
    def _validate_answer(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 15:
            raise ValueError("답변이 너무 짧음 (최소 15자, 구체적 정보 필요)")
        if not _is_korean_or_ascii(v):
            raise ValueError("답변에 다른 언어가 포함됨")
        return v

    @field_validator("answer_quote")
    @classmethod
    def _validate_quote_basic(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 5:
            raise ValueError("answer_quote가 너무 짧음 (최소 5자)")
        if not _is_korean_or_ascii(v):
            raise ValueError("answer_quote에 다른 언어가 포함됨")
        return v


def _check_qa_distinct(qa: QAResult) -> None:
    """질문과 답변이 너무 유사하면 거부 (동어반복 차단)."""
    normalize = lambda s: re.sub(r"[\s은는이가을를의에서으로]+", "", s.lower())
    nq = normalize(qa.question.rstrip("?"))
    na = normalize(qa.answer.rstrip("."))
    if not nq or not na:
        return
    short, long_ = (nq, na) if len(nq) < len(na) else (na, nq)
    if len(short) >= 8 and short in long_:
        raise ValueError("답변이 질문의 동어반복임. 구체적 사실/근거를 답변에 포함하라.")


# ---------- 단일 청크에서 Q&A 1개 생성 ----------
def _build_prompt(
    chunk_clean: str,
    category: str,
    chunk_tokens: list[str],
    available_types: list[tuple[str, str]],
    refine_feedback: str | None = None,
) -> tuple[str, str]:
    """system_msg, user_prompt 반환. refine_feedback 있으면 재생성용 개선 지시 추가."""
    types_text = "\n".join(f"- {name}: {desc}" for name, desc in available_types)
    allowed_names = [name for name, _ in available_types]

    anchor_hint = ""
    if chunk_tokens:
        anchor_hint = (
            f"\n[이 청크의 핵심 키워드 — 자연스럽게 활용 가능, 강제 아님]\n"
            f"{', '.join(chunk_tokens)}\n"
        )

    refine_block = ""
    if refine_feedback:
        refine_block = (
            "\n[직전 시도에 대한 G-Eval 평가 피드백 — 이번엔 반드시 개선하라]\n"
            f"{refine_feedback}\n"
        )

    system_msg = (
        "당신은 한국어 문서 기반 평가 데이터셋을 만드는 전문가입니다.\n"
        "[언어 규칙 — 절대 위반 금지]\n"
        "• question, answer 본문은 **반드시 한국어**로 작성한다. 영문 전체 문장으로 작성 금지.\n"
        "• 영문은 다음 경우에만 허용: (a) 약어/고유명사 (예: LoRA, PiSSA, GSM8K, RFID), "
        "(b) 청크에 영문으로 그대로 등장하는 표현. 그 외엔 영문 사용 금지.\n"
        "• 다른 언어(중국어/일본어/태국어 등) 절대 사용 금지.\n"
        "[답변 정확성]\n"
        "• 답변에 들어가는 모든 사실/수치/예시는 **청크에 명시적으로 존재**해야 한다. "
        "청크에 없는 예시·인용·수치를 임의로 만들어 넣지 마라 (특히 영문 참고문헌 등).\n"
        "• 근거 문장은 answer_quote에 청크 원문 그대로 인용한다.\n"
        f"{_QUESTION_QUALITY_GUARDS}"
    )

    user_prompt = (
        f"[문서 도메인]: {category}\n\n"
        f"[사용 가능한 질문 유형]\n{types_text}\n\n"
        "위 유형 중 청크 내용에 가장 자연스럽게 맞는 것 1개를 골라 그 유형의 Q&A를 만들어라.\n"
        f"{anchor_hint}"
        f"{refine_block}\n"
        f"[청크 내용]\n{chunk_clean}\n\n"
        "필수 규칙:\n"
        f"1. bloom_type: 다음 중 하나를 정확한 표기로: {', '.join(allowed_names)}\n"
        "2. **question은 한국어 의문문**으로 작성 (영문 전체 문장 금지).\n"
        "3. **answer는 한국어 서술문**으로 작성. 영문은 약어/고유명사/청크 인용에만 허용.\n"
        "4. 답변에 청크에 등장하는 구체적 사실/수치/명칭을 포함하라.\n"
        "5. 답변은 질문의 단순 변형이면 안 된다 (동어반복 금지).\n"
        "6. 메타 표현 금지 ('이 문서', '위 글' 등).\n"
        "7. 핵심 키워드가 청크에 있으면 자연스럽게 활용 (강제 아님).\n"
        "8. **외부 지식/추측 금지** — 청크에 없는 예시·인용·수치를 만들어 넣지 마라.\n"
        "9. anchor_used: 활용한 핵심 키워드 또는 null.\n"
        "10. **answer_quote**: 답변의 핵심 근거 문장을 청크에서 글자 그대로 인용 "
        "(가능하면 **완결된 한 문장**, 단순 항목 번호나 짧은 헤더만 인용하지 말 것). "
        "변형/축약 금지, 청크에 실제 등장해야 함."
    )
    return system_msg, user_prompt


def _generate_one_candidate(
    chunk_clean: str,
    category: str,
    chunk_tokens: list[str],
    available_types: list[tuple[str, str]],
    chunk_norm_for_match: str,
    allowed_names: list[str],
    refine_feedback: str | None,
) -> QAResult | None:
    """단일 후보 생성 + 하드 필터(bloom/citation/동어반복). 통과하면 QAResult, 아니면 None."""
    system_msg, user_prompt = _build_prompt(
        chunk_clean, category, chunk_tokens, available_types,
        refine_feedback=refine_feedback,
    )
    try:
        result: QAResult = _instructor_client.chat.completions.create(
            model=_MODEL,
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_prompt},
            ],
            response_model=QAResult,
            max_retries=2,
            temperature=0.5,  # best-of-N 다양성을 위해 약간 상향
        )
    except Exception as e:
        print(f"    [후보] Pydantic/생성 실패: {str(e)[:100]}")
        return None

    if result.bloom_type not in allowed_names:
        print(f"    [후보] bloom_type 불일치='{result.bloom_type}'")
        return None
    if _normalize_for_match(result.answer_quote) not in chunk_norm_for_match:
        print(f"    [후보] Citation 실패: quote='{result.answer_quote[:50]}...'")
        return None
    try:
        _check_qa_distinct(result)
    except ValueError as ve:
        print(f"    [후보] 동어반복: {ve}")
        return None
    return result


def generate_qa_for_chunk(
    chunk: str,
    category: str,
    rare_tokens: list[str],
    available_types: list[tuple[str, str]],
    n_candidates: int = 3,
    top_k: int = 1,
    max_outer_retries: int = 2,
    use_geval: bool = True,
) -> list[QAResult]:
    """
    Best-of-N + top-K 방식 Q&A 생성.

    각 라운드:
      1) N개 후보 생성 (각각 Pydantic + bloom_type + Citation + 동어반복 통과)
      2) (use_geval=True) 각 후보에 G-Eval critique (logprob 가중 점수)
      3) THRESHOLD/MIN_PER_DIM 통과자 중 weighted_score 내림차순 top_k 반환
      4) 통과자 부족 시 가장 약한 후보의 feedback을 다음 라운드에 주입

    모든 라운드 후에도 top_k 통과자 부족 → 누적 후보 중 weighted_score 상위 top_k 반환 (폴백)

    Args:
        n_candidates: 라운드당 후보 수 (기본 3)
        top_k: 최종 반환 개수 (기본 1)
        max_outer_retries: 라운드 수 (기본 2)
        use_geval: G-Eval critique 사용 여부

    Returns:
        QAResult 리스트 (길이 0~top_k)
    """
    chunk_clean = _normalize_korean_spaces(chunk)
    chunk_tokens = _filter_tokens_for_chunk(rare_tokens, chunk_clean)
    chunk_norm_for_match = _normalize_for_match(chunk_clean)
    allowed_names = [name for name, _ in available_types]

    refine_feedback: str | None = None
    # 라운드 간 누적 (폴백용)
    accumulated_scored: list[tuple[QAResult, CritiqueScore]] = []
    accumulated_unscored: list[QAResult] = []  # critique 실패 후보

    for attempt in range(max_outer_retries):
        # ---- N개 후보 생성 ----
        survivors: list[QAResult] = []
        for c_idx in range(n_candidates):
            cand = _generate_one_candidate(
                chunk_clean, category, chunk_tokens, available_types,
                chunk_norm_for_match, allowed_names, refine_feedback,
            )
            if cand is not None:
                survivors.append(cand)

        if not survivors:
            print(f"  [Q&A] 라운드 {attempt+1}: 모든 후보 하드필터 탈락")
            refine_feedback = (
                "이전 라운드 후보 전원 검증 실패. answer_quote를 청크 문장 그대로 정확히 인용하고, "
                f"bloom_type은 {allowed_names} 중 하나로, 한국어 의문문 + 동어반복 금지."
            )
            continue

        print(f"  [Q&A] 라운드 {attempt+1}: 하드필터 통과 {len(survivors)}/{n_candidates}")

        # ---- G-Eval 미사용 시: 첫 라운드 생존자 중 top_k 그대로 반환 ----
        if not use_geval:
            return survivors[:top_k]

        # ---- 각 후보 critique ----
        scored_this_round: list[tuple[QAResult, CritiqueScore]] = []
        for s_idx, cand in enumerate(survivors):
            critique = critique_qa(
                question=cand.question,
                answer=cand.answer,
                answer_quote=cand.answer_quote,
                chunk=chunk_clean,
                bloom_type=cand.bloom_type,
            )
            if critique is None:
                print(f"  [Q&A] 후보 {s_idx+1} critique 실패 — 폴백 풀에 보관")
                accumulated_unscored.append(cand)
                continue
            print(f"  [Q&A] 후보 {s_idx+1} {format_critique_log(critique)}")
            scored_this_round.append((cand, critique))
            accumulated_scored.append((cand, critique))

        if not scored_this_round:
            refine_feedback = "Critic 호출 모두 실패. 질문/답변을 더 명확한 한국어로 작성하라."
            continue

        # ---- threshold + min_per_dim 통과자 ----
        passing = [
            (c, s) for c, s in scored_this_round if is_qa_passing(s)
        ]
        if len(passing) >= top_k:
            passing.sort(key=lambda x: x[1].weighted_score, reverse=True)
            selected = [c for c, _ in passing[:top_k]]
            print(
                f"  [Q&A] 라운드 {attempt+1} 종료: 통과 {len(passing)}, top_{top_k} 선택"
            )
            return selected

        # ---- 통과자 부족 → 가장 약한 후보 feedback로 다음 라운드 ----
        scored_this_round.sort(key=lambda x: x[1].weighted_score, reverse=True)
        weakest = scored_this_round[-1][1]
        refine_feedback = (
            f"이번 라운드 최고 weighted_score={scored_this_round[0][1].weighted_score:.2f}, "
            f"통과 {len(passing)}/{top_k}. 약한 차원 개선: {weakest.feedback}"
        )

    # ---- 폴백: 누적 점수 후보 중 weighted_score top_k ----
    if accumulated_scored:
        accumulated_scored.sort(key=lambda x: x[1].weighted_score, reverse=True)
        selected = [c for c, _ in accumulated_scored[:top_k]]
        print(
            f"  [Q&A] threshold 미달 — 누적 {len(accumulated_scored)} 중 weighted top_{len(selected)} 선택"
        )
        return selected

    # ---- 최종 폴백: critique 실패한 후보만이라도 ----
    if accumulated_unscored:
        print(f"  [Q&A] critique 전부 실패 — 하드필터 통과 후보 1개 채택")
        return accumulated_unscored[:top_k]

    print("  [Q&A] 완전 실패 — 빈 리스트 반환")
    return []


# ---------- 청크 리스트 일괄 처리 (다양성 강제) ----------
class QAItem(BaseModel):
    """파이프라인 결과로 반환되는 Q&A 1개."""
    chunk_idx: int
    chunk: str
    bloom_type: str
    question: str
    answer: str
    answer_quote: str
    anchor_used: str | None = None


MULTI_BLOOM_DESCS = {
    "비교": "두 개 이상의 대상을 명시적으로 비교하는 질문. 청크들에 있는 서로 다른 대상의 차이/공통점을 묻는다.",
    "분석": "여러 청크의 정보를 결합해야 답할 수 있는 원인-결과, 영향, 트레이드오프 질문.",
}


def _build_multi_user_prompt(
    category: str,
    bloom_type: str,
    bloom_desc: str,
    chunks_text: str,
    anchor_hint: str,
    refine_feedback: str | None,
) -> str:
    refine_block = ""
    if refine_feedback:
        refine_block = (
            "\n[직전 라운드 G-Eval 피드백 — 이번엔 반드시 개선하라]\n"
            f"{refine_feedback}\n"
        )
    return (
        f"[문서 도메인]: {category}\n\n"
        f"[질문 유형]: {bloom_type}\n[유형 설명]: {bloom_desc}\n\n"
        f"[제공된 청크 — 반드시 둘 이상 활용하라]\n{chunks_text}\n"
        f"{anchor_hint}"
        f"{refine_block}\n"
        "필수 규칙:\n"
        f"1. bloom_type: 정확히 '{bloom_type}'\n"
        "2. **question은 한국어 의문문**, **answer는 한국어 서술문**.\n"
        "3. 질문과 답변은 **여러 청크의 정보를 결합**해야 한다. 단일 청크로 답 가능한 질문 금지.\n"
        "4. 답변에 청크들에 등장하는 구체적 사실/수치/명칭을 포함하라.\n"
        "5. 답변은 질문의 단순 변형이면 안 된다 (동어반복 금지).\n"
        "6. 메타 표현 금지 ('이 문서', '위 글', '청크 #N' 등 직접 호명 금지).\n"
        "7. **외부 지식/추측 금지** — 청크에 없는 예시·인용·수치를 만들어 넣지 마라.\n"
        "8. anchor_used: 활용한 핵심 키워드 또는 null.\n"
        "9. **answer_quote**: 답변의 핵심 근거 문장을 청크들 중 한 곳에서 글자 그대로 인용 "
        "(가능하면 **완결된 한 문장**, 짧은 헤더/항목 번호만 인용 금지). "
        "변형/축약 금지."
    )


_MULTI_SYSTEM_MSG = (
    "당신은 한국어 문서 기반 평가 데이터셋을 만드는 전문가입니다. "
    "여러 청크를 모두 고려한 통합적 사고가 필요한 Q&A를 만듭니다.\n"
    "[언어 규칙 — 절대 위반 금지]\n"
    "• question, answer 본문은 **반드시 한국어**로 작성. 영문 전체 문장 금지.\n"
    "• 영문은 약어/고유명사 또는 청크에 영문으로 그대로 등장하는 표현에만 허용.\n"
    "• 다른 언어(중국어/일본어/태국어 등) 절대 사용 금지.\n"
    "[답변 정확성]\n"
    "• 답변의 모든 사실/수치/예시는 청크에 명시적으로 존재해야 함. "
    "청크에 없는 예시·인용을 만들어 넣지 마라.\n"
    "[멀티청크 결합 규칙]\n"
    "• 질문은 반드시 **여러 청크의 정보를 모두 활용**해야 답할 수 있어야 한다. "
    "단일 청크로 답 가능한 질문은 만들지 마라.\n"
    "• 답변은 3~5문장으로 각 청크의 핵심 사실/수치/명칭을 명시적으로 포함하라.\n"
    f"{_QUESTION_QUALITY_GUARDS}"
)


def _generate_one_multi_candidate(
    bloom_type: str,
    user_prompt: str,
    combined_norm: str,
) -> QAResult | None:
    """멀티청크 후보 1개 생성 + 하드 필터. 통과하면 QAResult, 아니면 None."""
    try:
        result: QAResult = _instructor_client.chat.completions.create(
            model=_MODEL,
            messages=[
                {"role": "system", "content": _MULTI_SYSTEM_MSG},
                {"role": "user", "content": user_prompt},
            ],
            response_model=QAResult,
            max_retries=2,
            temperature=0.5,
        )
    except Exception as e:
        print(f"    [Multi 후보] Pydantic/생성 실패: {str(e)[:100]}")
        return None

    if result.bloom_type != bloom_type:
        print(f"    [Multi 후보] bloom_type 불일치='{result.bloom_type}'")
        return None
    if _normalize_for_match(result.answer_quote) not in combined_norm:
        print(f"    [Multi 후보] Citation 실패: quote='{result.answer_quote[:50]}...'")
        return None
    try:
        _check_qa_distinct(result)
    except ValueError as ve:
        print(f"    [Multi 후보] 동어반복: {ve}")
        return None
    return result


def generate_qa_multi_chunk(
    chunks_with_idx: list[tuple[int, str]],
    category: str,
    rare_tokens: list[str],
    bloom_type: str,
    n_candidates: int = 5,
    top_k: int = 1,
    max_outer_retries: int = 3,
    use_geval: bool = True,
) -> list[QAResult]:
    """
    2~3개 청크를 결합한 멀티청크 Q&A 생성 (best-of-N + top-K).
    bloom_type은 '비교' 또는 '분석'만 허용.

    Returns:
        QAResult 리스트 (길이 0~top_k)
    """
    if bloom_type not in MULTI_BLOOM_DESCS:
        print(f"  [Multi-Q&A] 허용되지 않은 bloom_type='{bloom_type}'")
        return []
    if not (2 <= len(chunks_with_idx) <= 3):
        print(f"  [Multi-Q&A] 청크 개수는 2~3개여야 함 (입력: {len(chunks_with_idx)})")
        return []

    chunks_clean = [_normalize_korean_spaces(c) for _, c in chunks_with_idx]
    combined_norm = "".join(_normalize_for_match(c) for c in chunks_clean)
    combined_chunk_text = "\n\n---\n\n".join(chunks_clean)

    chunk_tokens: list[str] = []
    for c in chunks_clean:
        for t in _filter_tokens_for_chunk(rare_tokens, c):
            if t not in chunk_tokens:
                chunk_tokens.append(t)

    chunks_text = "\n\n".join(
        f"[청크 #{idx}]\n{c}"
        for (idx, _), c in zip(chunks_with_idx, chunks_clean)
    )

    bloom_desc = MULTI_BLOOM_DESCS[bloom_type]
    anchor_hint = ""
    if chunk_tokens:
        anchor_hint = (
            f"\n[제공된 청크들의 핵심 키워드 — 자연스럽게 활용 가능, 강제 아님]\n"
            f"{', '.join(chunk_tokens)}\n"
        )

    refine_feedback: str | None = None
    accumulated_scored: list[tuple[QAResult, CritiqueScore]] = []
    accumulated_unscored: list[QAResult] = []

    for attempt in range(max_outer_retries):
        user_prompt = _build_multi_user_prompt(
            category, bloom_type, bloom_desc, chunks_text, anchor_hint, refine_feedback,
        )

        survivors: list[QAResult] = []
        for _ in range(n_candidates):
            cand = _generate_one_multi_candidate(bloom_type, user_prompt, combined_norm)
            if cand is not None:
                survivors.append(cand)

        if not survivors:
            print(f"  [Multi-Q&A] 라운드 {attempt+1}: 모든 후보 하드필터 탈락")
            refine_feedback = (
                f"이전 라운드 후보 전원 검증 실패. answer_quote를 청크 문장 그대로 인용하고, "
                f"bloom_type='{bloom_type}', 여러 청크 정보를 결합한 한국어 질문/답변 작성."
            )
            continue

        print(f"  [Multi-Q&A] 라운드 {attempt+1}: 하드필터 통과 {len(survivors)}/{n_candidates}")

        if not use_geval:
            return survivors[:top_k]

        scored_this_round: list[tuple[QAResult, CritiqueScore]] = []
        for s_idx, cand in enumerate(survivors):
            critique = critique_qa(
                question=cand.question,
                answer=cand.answer,
                answer_quote=cand.answer_quote,
                chunk=combined_chunk_text,
                bloom_type=cand.bloom_type,
            )
            if critique is None:
                print(f"  [Multi-Q&A] 후보 {s_idx+1} critique 실패 — 폴백 풀에 보관")
                accumulated_unscored.append(cand)
                continue
            print(f"  [Multi-Q&A] 후보 {s_idx+1} {format_critique_log(critique)}")
            scored_this_round.append((cand, critique))
            accumulated_scored.append((cand, critique))

        if not scored_this_round:
            refine_feedback = "Critic 호출 모두 실패. 질문/답변을 더 명확한 한국어로 작성하라."
            continue

        passing = [
            (c, s) for c, s in scored_this_round
            if is_qa_passing(s, min_per_dim=MULTI_MIN_PER_DIM)
        ]
        if len(passing) >= top_k:
            passing.sort(key=lambda x: x[1].weighted_score, reverse=True)
            selected = [c for c, _ in passing[:top_k]]
            print(
                f"  [Multi-Q&A] 라운드 {attempt+1} 종료: 통과 {len(passing)}, top_{top_k} 선택"
            )
            return selected

        scored_this_round.sort(key=lambda x: x[1].weighted_score, reverse=True)
        weakest = scored_this_round[-1][1]
        refine_feedback = (
            f"이번 라운드 최고 weighted_score={scored_this_round[0][1].weighted_score:.2f}, "
            f"통과 {len(passing)}/{top_k}. 약한 차원 개선: {weakest.feedback}"
        )

    if accumulated_scored:
        accumulated_scored.sort(key=lambda x: x[1].weighted_score, reverse=True)
        selected = [c for c, _ in accumulated_scored[:top_k]]
        print(
            f"  [Multi-Q&A] threshold 미달 — 누적 {len(accumulated_scored)} 중 weighted top_{len(selected)} 선택"
        )
        return selected

    if accumulated_unscored:
        print(f"  [Multi-Q&A] critique 전부 실패 — 하드필터 통과 후보 채택")
        return accumulated_unscored[:top_k]

    print("  [Multi-Q&A] 완전 실패 — 빈 리스트 반환")
    return []


def generate_qa_for_chunks(
    selected_chunks: list[tuple[int, str]],
    category: str,
    rare_tokens: list[str],
) -> list[QAItem]:
    """
    선택된 청크들에서 Q&A를 일괄 생성. Bloom 유형은 청크 간 중복 없이 회전.

    Args:
        selected_chunks: (chunk_idx, chunk_text) 리스트
        category: 문서 대분류
        rare_tokens: 문서 전체 핵심 키워드

    Returns:
        QAItem 리스트
    """
    qa_items: list[QAItem] = []
    available_types = list(BLOOM_TYPES)

    for chunk_idx, chunk in selected_chunks:
        if not available_types:
            available_types = list(BLOOM_TYPES)  # 다 썼으면 리셋

        print(f"[Q&A Gen] Chunk #{chunk_idx} (남은 유형: {[t[0] for t in available_types]})")

        qa_list = generate_qa_for_chunk(chunk, category, rare_tokens, available_types)
        if not qa_list:
            continue
        qa = qa_list[0]  # top_k=1 (기본) → 첫 번째 항목

        print(f"  유형: {qa.bloom_type}")
        print(f"  Q: {qa.question}")
        print(f"  A: {qa.answer[:80]}...")
        print(f"  anchor: {qa.anchor_used}")

        # 사용한 유형 제거
        used_idx = next(
            (i for i, (name, _) in enumerate(available_types) if name == qa.bloom_type),
            None,
        )
        if used_idx is not None:
            available_types.pop(used_idx)

        qa_items.append(QAItem(
            chunk_idx=chunk_idx,
            chunk=chunk,
            bloom_type=qa.bloom_type,
            question=qa.question,
            answer=qa.answer,
            answer_quote=qa.answer_quote,
            anchor_used=qa.anchor_used,
        ))

    return qa_items
