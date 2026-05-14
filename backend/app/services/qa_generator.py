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

from groq import Groq
from pydantic import BaseModel, field_validator
import instructor


# ---------- 설정 ----------
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
_groq_client = Groq(api_key=GROQ_API_KEY)
_instructor_client = instructor.from_groq(_groq_client)
_MODEL = "llama-3.3-70b-versatile"


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


def _normalize_for_match(s: str) -> str:
    """공백 무시 + 소문자 — citation 부분 매칭용."""
    return re.sub(r"\s+", "", s).lower()


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
) -> tuple[str, str]:
    """system_msg, user_prompt 반환."""
    types_text = "\n".join(f"- {name}: {desc}" for name, desc in available_types)
    allowed_names = [name for name, _ in available_types]

    anchor_hint = ""
    if chunk_tokens:
        anchor_hint = (
            f"\n[이 청크의 핵심 키워드 — 자연스럽게 활용 가능, 강제 아님]\n"
            f"{', '.join(chunk_tokens)}\n"
        )

    system_msg = (
        "당신은 문서 기반 평가 데이터셋을 만드는 한국어 전문가입니다. "
        "출력은 반드시 한국어와 영문 약어/고유명사로만 구성하며, "
        "그 외 언어(태국어, 중국어, 일본어 등)는 절대 사용하지 않습니다. "
        "답변은 청크에 있는 구체적 사실/수치/근거를 포함해야 하며, "
        "그 근거가 되는 문장을 answer_quote에 글자 그대로 인용해야 합니다."
    )

    user_prompt = (
        f"[문서 도메인]: {category}\n\n"
        f"[사용 가능한 질문 유형]\n{types_text}\n\n"
        "위 유형 중 청크 내용에 가장 자연스럽게 맞는 것 1개를 골라 그 유형의 Q&A를 만들어라.\n"
        f"{anchor_hint}\n"
        f"[청크 내용]\n{chunk_clean}\n\n"
        "필수 규칙:\n"
        f"1. bloom_type: 다음 중 하나를 정확한 표기로: {', '.join(allowed_names)}\n"
        "2. 답변에는 청크에 등장하는 구체적 사실/수치/명칭을 포함하라.\n"
        "3. 답변은 질문의 단순 변형이면 안 된다 (동어반복 금지).\n"
        "4. 메타 표현 금지 ('이 문서', '위 글' 등).\n"
        "5. 핵심 키워드가 청크에 있으면 자연스럽게 활용 (강제 아님).\n"
        "6. 외부 지식, 추측 금지 — 청크 안에 답이 명확히 있어야 함.\n"
        "7. 출력 언어: 한국어와 영문 약어/고유명사만.\n"
        "8. anchor_used: 활용한 핵심 키워드 또는 null.\n"
        "9. **answer_quote**: 답변의 근거가 되는 청크의 문장을 **글자 그대로 인용** "
        "(5자 이상, 변형/축약 금지). 청크에 실제 등장하는 문장이어야 함."
    )
    return system_msg, user_prompt


def generate_qa_for_chunk(
    chunk: str,
    category: str,
    rare_tokens: list[str],
    available_types: list[tuple[str, str]],
    max_outer_retries: int = 3,
) -> QAResult | None:
    """
    LLM이 청크 보고 Bloom 유형 선택 + Q&A 생성. 모든 검증 통과한 결과만 반환.
    """
    chunk_clean = _normalize_korean_spaces(chunk)
    chunk_tokens = _filter_tokens_for_chunk(rare_tokens, chunk_clean)
    chunk_norm_for_match = _normalize_for_match(chunk_clean)
    allowed_names = [name for name, _ in available_types]
    system_msg, user_prompt = _build_prompt(chunk_clean, category, chunk_tokens, available_types)

    for attempt in range(max_outer_retries):
        try:
            result: QAResult = _instructor_client.chat.completions.create(
                model=_MODEL,
                messages=[
                    {"role": "system", "content": system_msg},
                    {"role": "user", "content": user_prompt},
                ],
                response_model=QAResult,
                max_retries=2,  # Pydantic validator 자동 재시도
                temperature=0.3,
            )

            # bloom_type 허용 검증
            if result.bloom_type not in allowed_names:
                print(f"  [Q&A] 잘못된 bloom_type='{result.bloom_type}' (시도 {attempt+1})")
                continue

            # Citation grounding 검증
            quote_norm = _normalize_for_match(result.answer_quote)
            if quote_norm not in chunk_norm_for_match:
                print(
                    f"  [Q&A] Citation 실패 (시도 {attempt+1}): "
                    f"quote='{result.answer_quote[:50]}...'"
                )
                continue

            # 동어반복 검증
            try:
                _check_qa_distinct(result)
            except ValueError as ve:
                print(f"  [Q&A] 동어반복 (시도 {attempt+1}): {ve}")
                continue

            return result

        except Exception as e:
            print(f"  [Q&A] 시도 {attempt+1}/{max_outer_retries} 예외: {str(e)[:120]}")
            continue

    print(f"  [Q&A] 모든 재시도 실패")
    return None


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


def generate_qa_multi_chunk(
    chunks_with_idx: list[tuple[int, str]],
    category: str,
    rare_tokens: list[str],
    bloom_type: str,
    max_outer_retries: int = 3,
) -> QAResult | None:
    """
    2~3개 청크를 결합해 단일 청크로는 답할 수 없는 Q&A를 1개 생성.
    bloom_type은 '비교' 또는 '분석'만 허용.
    """
    if bloom_type not in MULTI_BLOOM_DESCS:
        print(f"  [Multi-Q&A] 허용되지 않은 bloom_type='{bloom_type}'")
        return None
    if not (2 <= len(chunks_with_idx) <= 3):
        print(f"  [Multi-Q&A] 청크 개수는 2~3개여야 함 (입력: {len(chunks_with_idx)})")
        return None

    chunks_clean = [_normalize_korean_spaces(c) for _, c in chunks_with_idx]
    combined_norm = "".join(_normalize_for_match(c) for c in chunks_clean)

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

    system_msg = (
        "당신은 문서 기반 평가 데이터셋을 만드는 한국어 전문가입니다. "
        "여러 청크를 모두 고려한 통합적 사고가 필요한 Q&A를 만듭니다. "
        "출력은 반드시 한국어와 영문 약어/고유명사로만 구성하며, "
        "그 외 언어(태국어, 중국어, 일본어 등)는 절대 사용하지 않습니다."
    )

    user_prompt = (
        f"[문서 도메인]: {category}\n\n"
        f"[질문 유형]: {bloom_type}\n[유형 설명]: {bloom_desc}\n\n"
        f"[제공된 청크 — 반드시 둘 이상 활용하라]\n{chunks_text}\n"
        f"{anchor_hint}\n"
        "필수 규칙:\n"
        f"1. bloom_type: 정확히 '{bloom_type}'\n"
        "2. 질문과 답변은 **여러 청크의 정보를 결합**해야 한다. 단일 청크로 답 가능한 질문 금지.\n"
        "3. 답변에는 청크들에 등장하는 구체적 사실/수치/명칭을 포함하라.\n"
        "4. 답변은 질문의 단순 변형이면 안 된다 (동어반복 금지).\n"
        "5. 메타 표현 금지 ('이 문서', '위 글', '청크 #N' 등 직접 호명 금지).\n"
        "6. 외부 지식, 추측 금지 — 청크들 안에 답이 있어야 함.\n"
        "7. 출력 언어: 한국어와 영문 약어/고유명사만.\n"
        "8. anchor_used: 활용한 핵심 키워드 또는 null.\n"
        "9. **answer_quote**: 답변의 핵심 근거 한 문장을 **청크들 중 한 곳에서 글자 그대로 인용** "
        "(5자 이상, 변형/축약 금지)."
    )

    for attempt in range(max_outer_retries):
        try:
            result: QAResult = _instructor_client.chat.completions.create(
                model=_MODEL,
                messages=[
                    {"role": "system", "content": system_msg},
                    {"role": "user", "content": user_prompt},
                ],
                response_model=QAResult,
                max_retries=2,
                temperature=0.3,
            )

            if result.bloom_type != bloom_type:
                print(f"  [Multi-Q&A] bloom_type 불일치 '{result.bloom_type}' (시도 {attempt+1})")
                continue

            quote_norm = _normalize_for_match(result.answer_quote)
            if quote_norm not in combined_norm:
                print(
                    f"  [Multi-Q&A] Citation 실패 (시도 {attempt+1}): "
                    f"quote='{result.answer_quote[:50]}...'"
                )
                continue

            try:
                _check_qa_distinct(result)
            except ValueError as ve:
                print(f"  [Multi-Q&A] 동어반복 (시도 {attempt+1}): {ve}")
                continue

            return result

        except Exception as e:
            print(f"  [Multi-Q&A] 시도 {attempt+1}/{max_outer_retries} 예외: {str(e)[:120]}")
            continue

    print(f"  [Multi-Q&A] 모든 재시도 실패")
    return None


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

        qa = generate_qa_for_chunk(chunk, category, rare_tokens, available_types)
        if not qa:
            continue

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
