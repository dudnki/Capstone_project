"""
G-Eval 기반 Q&A 품질 필터링 모듈

논문: G-Eval: NLG Evaluation using GPT-4 with Better Human Alignment
      https://arxiv.org/abs/2303.16634

핵심 아이디어:
  - LLM을 평가자(judge)로 활용
  - Chain-of-Thought로 단계적 추론 후 점수 부여
  - 다수의 후보 중 고품질만 선별하여 질문 품질을 보증
"""

import os
import json
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

openai_client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

# 토큰 절약: 생성은 경량 모델, 채점은 정확도 높은 모델 사용
_GEN_MODEL   = "gpt-4o-mini"   # 후보 생성용 (빠르고 저렴)
_SCORE_MODEL = "gpt-4o-mini"   # G-Eval 채점용

# Q&A 품질 평가 기준 및 가중치
# (criterion_name: (description, weight))
GEVAL_CRITERIA: dict[str, tuple[str, float]] = {
    "relevance":     ("주어진 문맥의 핵심 내용을 다루는가?",                  0.20),
    "answerability": ("제공된 문맥만으로 완전히 답할 수 있는가?",             0.50),
    "clarity":       ("질문이 명확하고 모호함 없이 작성되었는가?",             0.15),
    "specificity":   ("구체적이며 핵심 개념·사실을 테스트하는가?",             0.10),
    "difficulty":    ("단순 사실 확인이 아닌 이해력·추론을 요구하는가?",       0.05),
}


# ─────────────────────────────────────────────────────────────────────────────
# 1단계: 후보 Q&A 다수 생성
# ─────────────────────────────────────────────────────────────────────────────

# 카테고리별 질문 유형 가이드
_QUESTION_GUIDE: dict[str, str] = {
    "기술논문": """\
- 핵심 개념·원리 설명 (예: "이 기법의 작동 원리는?")
- 두 방법의 차이점·비교 (예: "A와 B의 차이는?")
- 제안된 방법의 장점·한계 (예: "이 접근법의 문제점은?")
- 실험 결과 해석 (예: "실험에서 보여주는 것은?")
- 메커니즘·인과관계 (예: "왜 성능이 향상되는가?")
※ 금지: 시간적 배경, 사건 전개, 인물 분석 등 소설·역사 문서용 질문 패턴""",

    "사업보고서": """\
- 재무 지표 해석 (예: "매출 변화의 주요 원인은?")
- 사업 전략·의사결정 (예: "어떤 전략을 채택했으며 이유는?")
- 리스크 요인 (예: "주요 위험 요인은 무엇인가?")
- 실적 비교·변화 추이 (예: "전년 대비 변화는?")
※ 금지: 제품 사용법, 법적 판단, 학술 개념 설명 등""",

    "약관": """\
- 보장 조건·적용 범위 (예: "어떤 경우에 보장이 되는가?")
- 면책·예외 사항 (예: "보장에서 제외되는 경우는?")
- 계약자의 의무 (예: "계약자가 반드시 해야 하는 것은?")
- 절차·기한 (예: "청구 시 필요한 절차는?")
※ 금지: 수치 분석, 기술 원리 설명 등""",

    "매뉴얼": """\
- 사용·설치 절차 (예: "어떤 순서로 설치하는가?")
- 오류·오작동 대처 (예: "이 증상 발생 시 해결 방법은?")
- 주의사항·안전 규정 (예: "사용 시 반드시 지켜야 할 사항은?")
- 부품·기능 설명 (예: "이 버튼의 역할은?")
※ 금지: 재무 분석, 법적 해석 등""",

    "법률문서": """\
- 법적 요건·적용 조건 (예: "이 조항이 적용되는 조건은?")
- 권리·의무 (예: "당사자가 갖는 의무는?")
- 처벌·제재 내용 (예: "위반 시 제재는?")
- 예외·면제 규정 (예: "이 규정의 예외는?")
※ 금지: 기술 원리, 재무 지표 해석 등""",

    "일반": """\
- 핵심 내용 이해 (예: "이 문서가 설명하는 핵심은?")
- 원인·결과 관계 (예: "왜 이런 결과가 나타났는가?")
- 개념 정의 (예: "이 용어의 의미는?")
- 주요 주장 근거 (예: "이 주장의 근거는?")""",
}


def generate_multiple_qa(context: str, n: int = 5, category: str = "일반") -> list[dict]:
    """
    문맥 하나에서 다양한 Q&A 후보 n개를 생성합니다.
    category를 받아 문서 유형에 맞는 질문 유형 가이드를 적용합니다.
    """
    question_guide = _QUESTION_GUIDE.get(category, _QUESTION_GUIDE["일반"])

    prompt = f"""다음 [Context]를 바탕으로 서로 다른 질문 {n}개와 각각의 상세한 답변을 만들어줘.

[문서 유형]: {category}

[질문 유형 가이드 — 반드시 아래 유형 중에서 생성]:
{question_guide}

[질문 작성 규칙]:
- 위 질문 유형 가이드에 맞는 질문만 생성할 것
- 각 질문은 서로 다른 측면을 다뤄야 함
- 단순 암기보다 이해력·추론을 테스트하는 질문

[답변 작성 규칙 — 이 답변이 채점 기준(모범 답안)이 됨]:
- 반드시 Context에 명시된 내용만 사용할 것 (추론·상식 추가 금지)
- 질문이 요구하는 핵심 포인트를 빠짐없이 포함할 것 (채점 기준이 되므로 완결성 필수)
- Context에 등장하는 핵심 개념·용어·수치·인과관계를 구체적으로 서술
- 3~5문장으로 논리적 흐름에 따라 작성 (단순 나열 금지)
- 단어나 짧은 구절만으로 답변하지 말 것
- 학생이 이 답변의 핵심을 포함했는지 판단할 수 있을 만큼 구체적으로 작성

결과는 반드시 아래 JSON 형식으로만 출력해:
{{
    "qa_list": [
        {{"question": "질문1", "answer": "답변1"}},
        {{"question": "질문2", "answer": "답변2"}}
    ]
}}

[Context]:
{context}"""

    try:
        completion = openai_client.chat.completions.create(
            model=_GEN_MODEL,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.8,
        )
        result = json.loads(completion.choices[0].message.content)
        qa_list = result.get("qa_list", [])
        print(f"  [G-Eval] {len(qa_list)}개 Q&A 후보 생성 완료 (카테고리: {category})")
        return qa_list
    except Exception as e:
        print(f"  [G-Eval] 후보 생성 실패: {e}")
        return []


# ─────────────────────────────────────────────────────────────────────────────
# 2단계: G-Eval로 단일 Q&A 품질 채점
# ─────────────────────────────────────────────────────────────────────────────

def geval_score_qa(context: str, question: str, answer: str) -> dict:
    """
    G-Eval 논문 방식으로 Q&A 품질을 채점합니다.

    절차 (논문 Section 3):
      Step 1. 평가 기준(criteria)과 평가 단계(steps)를 프롬프트에 명시
      Step 2. LLM이 Chain-of-Thought로 단계별 추론
      Step 3. 각 기준에 대해 1~5 점수 부여
      Step 4. 가중 합산으로 최종 점수 산출 (논문의 probability weighting 근사)

    Returns:
        {
            "scores": {
                "relevance": 4.0,
                "answerability": 5.0,
                "clarity": 4.0,
                "specificity": 3.0,
                "difficulty": 3.0,
            },
            "weighted_score": 4.1,       # 가중 합산 (1~5 범위)
            "normalized_score": 0.82,    # 0~1 정규화 (weighted_score / 5)
            "reasoning": "CoT 추론 내용",
        }
    """
    criteria_text = "\n".join(
        f"  - {name} (가중치 {weight:.0%}): {desc}"
        for name, (desc, weight) in GEVAL_CRITERIA.items()
    )

    prompt = f"""당신은 Q&A 데이터셋 품질 평가 전문가입니다.
아래 Q&A 쌍을 5가지 기준으로 평가해주세요.

[평가 기준]:
{criteria_text}

[Context (원문 문맥)]:
{context}

[Question (평가할 질문)]:
{question}

[Answer (평가할 답변)]:
{answer}

[평가 절차 - Chain-of-Thought]:
Step 1. Context를 꼼꼼히 읽고 핵심 내용을 파악합니다.
Step 2. Question이 Context에 명시된 내용을 묻고 있는지 확인합니다.
         → Context에 없는 개념을 묻는 질문이면 answerability = 1점
Step 3. Answer의 모든 주장이 Context 텍스트에서 직접 근거를 찾을 수 있는지 확인합니다.
         → Context 외부 지식(모델 학습 데이터 등)을 사용했으면 answerability = 1점
Step 4. 각 기준에 대해 위 분석을 바탕으로 1~5점을 부여합니다.

[answerability 채점 기준 — 엄격 적용]:
5점 = Question과 Answer 모두 Context 텍스트만으로 완전히 해결됨
3점 = 대부분 Context 기반이나 일부 외부 지식 혼재
1점 = Context에 없는 개념을 질문하거나, Answer가 Context 밖 지식을 사용함
      (코드 청크에서 개념 질문 생성, 다른 챕터 내용 참조 등 포함)

[나머지 기준 점수]:
1점=매우 불량, 2점=불량, 3점=보통, 4점=양호, 5점=매우 우수

결과는 반드시 아래 JSON 형식으로만 출력해:
{{
    "reasoning": "Step 1~4의 단계별 분석 내용",
    "scores": {{
        "relevance": 점수,
        "answerability": 점수,
        "clarity": 점수,
        "specificity": 점수,
        "difficulty": 점수
    }}
}}"""

    try:
        completion = openai_client.chat.completions.create(
            model=_SCORE_MODEL,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0,
        )
        result = json.loads(completion.choices[0].message.content)
        raw_scores = result.get("scores", {})
        reasoning  = result.get("reasoning", "")

        scores: dict[str, float] = {}
        weighted_total = 0.0
        for criterion, (_, weight) in GEVAL_CRITERIA.items():
            score = float(raw_scores.get(criterion, 3))
            score = max(1.0, min(5.0, score))
            scores[criterion] = score
            weighted_total += score * weight

        normalized = round(weighted_total / 5.0, 4)
        return {
            "scores": scores,
            "weighted_score": round(weighted_total, 4),
            "normalized_score": normalized,
            "reasoning": reasoning,
        }

    except Exception as e:
        print(f"  [G-Eval] 채점 실패: {e}")
        return {
            "scores": {k: 3.0 for k in GEVAL_CRITERIA},
            "weighted_score": 3.0,
            "normalized_score": 0.6,
            "reasoning": f"채점 오류 (기본값 사용): {e}",
        }


# ─────────────────────────────────────────────────────────────────────────────
# 3단계: 필터링 — 고품질 Q&A만 선별
# ─────────────────────────────────────────────────────────────────────────────

def filter_qa_by_geval(
    context: str,
    qa_candidates: list[dict],
    threshold: float = 0.70,
    top_k: int = 2,
) -> list[dict]:
    """
    G-Eval로 후보를 채점하고 고품질 Q&A만 반환합니다.

    필터링 전략:
      1. 모든 후보를 G-Eval로 채점
      2. normalized_score >= threshold 인 후보만 1차 선별
      3. 점수 내림차순 정렬 → top_k개 최종 선택
      4. threshold 통과자가 없으면 전체 중 최고점 top_k 반환 (폴백)

    Args:
        context:       원문 문맥
        qa_candidates: [{"question": ..., "answer": ...}, ...]
        threshold:     최소 normalized_score (0~1), 기본값 0.70
        top_k:         최종 선택 수, 기본값 2

    Returns:
        geval 평가 결과가 포함된 Q&A 리스트
        각 항목: {"question": ..., "answer": ..., "geval": {...}}
    """
    if not qa_candidates:
        return []

    scored: list[dict] = []
    for i, qa in enumerate(qa_candidates):
        q = qa.get("question", "").strip()
        a = qa.get("answer", "").strip()
        if not q or not a:
            continue
        print(f"  [G-Eval] 후보 {i+1}/{len(qa_candidates)} 채점 중...")
        eval_result = geval_score_qa(context, q, a)
        scored.append({**qa, "geval": eval_result})

    # 하드 필터: answerability <= 2 이면 컨텍스트 밖 내용 → 무조건 탈락
    context_grounded = [
        qa for qa in scored
        if qa["geval"]["scores"].get("answerability", 0) > 2
    ]
    rejected = len(scored) - len(context_grounded)
    if rejected > 0:
        print(f"  [G-Eval] 컨텍스트 이탈 {rejected}개 하드 탈락 (answerability <= 2)")
    scored = context_grounded if context_grounded else scored  # 전부 탈락 시 폴백

    # 1차: threshold 필터
    passed = [qa for qa in scored if qa["geval"]["normalized_score"] >= threshold]
    pool   = passed if passed else scored  # 폴백: threshold 통과자 없으면 전체 사용

    # 2차: 가중 점수 내림차순 → top_k
    pool.sort(key=lambda x: x["geval"]["weighted_score"], reverse=True)
    selected = pool[:top_k]

    print(
        f"  [G-Eval] {len(qa_candidates)}개 후보 "
        f"→ {len(passed)}개 threshold({threshold}) 통과 "
        f"→ {len(selected)}개 최종 선택"
    )
    return selected
