"""
Agentic Q&A 생성 — OpenAI tool calling 기반.

기존 결정론적 파이프라인(select_diverse_chunks → generate_qa_for_chunks)을 대체하여,
LLM 에이전트가 다음을 스스로 결정한다:
- N(목표 개수), λ(MMR 다양성 가중) — 문서 분류/길이 기반
- 어떤 청크를 어떤 Bloom 유형으로 쓸지
- 비교/분석 유형은 find_related_chunks로 짝 청크 검색 후 멀티 청크 결합
- 생성 실패 시 다른 청크로 재시도

[제공 도구]
- inspect_document_stats : 문서 메타 정보
- preview_chunks         : 청크 머리 미리보기
- select_chunks_mmr      : MMR로 후보 N개 추천
- find_related_chunks    : 유사/대비 청크 검색 (멀티 청크 짝 찾기용)
- generate_qa_single     : 단일 청크 Q&A 생성 (사실확인/이해/적용)
- generate_qa_multi      : 멀티 청크 Q&A 생성 (분석/비교)
- finalize               : 루프 종료
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import Any

import numpy as np
from openai import OpenAI

from app.services.document_analyzer import (
    _get_model,
    _is_junk_chunk,
    select_diverse_chunks,
)
from app.services.qa_generator import (
    BLOOM_TYPES,
    QAItem,
    generate_qa_for_chunk,
    generate_qa_multi_chunk,
)


# ---------- 설정 ----------
_OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
_OPENAI_MODEL = os.environ.get("OPENAI_AGENT_MODEL", "gpt-4o")
_openai_client = OpenAI(api_key=_OPENAI_API_KEY) if _OPENAI_API_KEY else None

SINGLE_BLOOM_TYPES = ["사실 확인", "이해", "적용"]
MULTI_BLOOM_TYPES = ["분석", "비교"]


# 사용자가 프론트에서 선택한 난이도(generationLevel)별 생성 정책.
# - bloom_priority      : 권장 Bloom 유형 우선순위
# - lambda_param_hint   : MMR lambda 권장값 (1.0=정보성, 0.0=다양성)
# - instruction         : 에이전트에게 전달할 한 줄 지시문
_DIFFICULTY_GUIDE: dict[str, dict] = {
    "low": {
        "bloom_priority": ["사실 확인", "이해"],
        "lambda_param_hint": 0.8,
        "instruction": (
            "난이도 '낮음': 단일 청크에서 답할 수 있는 '사실 확인'·'이해' 유형 위주로 생성하라. "
            "분석/비교 등 멀티청크 결합이 필요한 질문은 만들지 마라(generate_qa_multi 사용 금지). "
            "select_chunks_mmr는 lambda_param=0.8 권장(정보성 위주)."
        ),
    },
    "medium": {
        "bloom_priority": ["사실 확인", "이해", "적용", "분석", "비교"],
        "lambda_param_hint": 0.6,
        "instruction": (
            "난이도 '중간': 5개 Bloom 유형이 가능한 한 균등하게 분포되도록 생성하라. "
            "단일/멀티 청크 질문을 자연스럽게 섞어라. "
            "select_chunks_mmr는 lambda_param=0.6 권장."
        ),
    },
    "high": {
        "bloom_priority": ["분석", "비교", "적용"],
        "lambda_param_hint": 0.4,
        "instruction": (
            "난이도 '높음': '분석'·'비교'·'적용' 위주로 생성하라. "
            "멀티청크 결합 질문(generate_qa_multi)을 목표 개수의 절반 이상으로 포함하라. "
            "find_related_chunks로 서로 대비되는(different) 청크 짝을 적극 활용하라. "
            "select_chunks_mmr는 lambda_param=0.4 권장(다양성 위주)."
        ),
    },
}


def _difficulty_config(difficulty: str) -> dict:
    return _DIFFICULTY_GUIDE.get(difficulty, _DIFFICULTY_GUIDE["medium"])


# ---------- 상태 ----------
@dataclass
class AgentState:
    """에이전트 도구들이 공유하는 가변 상태."""
    chunks: list[str]                       # 원본 분할 결과 전체 (인덱스 기준)
    valid_indices: list[int]                # junk 제거 후 남은 원본 인덱스
    valid_chunks: list[str]                 # junk 제거 후 텍스트
    category: str
    rare_tokens: list[str]
    target_n: int
    difficulty: str = "medium"              # "low" | "medium" | "high"
    valid_embs: np.ndarray | None = None    # lazy
    qa_items: list[QAItem] = field(default_factory=list)
    used_chunk_indices: set[int] = field(default_factory=set)
    failed_chunk_indices: set[int] = field(default_factory=set)

    def ensure_embeddings(self) -> None:
        if self.valid_embs is None:
            print(f"[Agent] Encoding {len(self.valid_chunks)} valid chunks ...")
            model = _get_model()
            self.valid_embs = model.encode(
                self.valid_chunks, normalize_embeddings=True
            )

    def local_of(self, orig_idx: int) -> int | None:
        try:
            return self.valid_indices.index(orig_idx)
        except ValueError:
            return None

    def chunk_of(self, orig_idx: int) -> str | None:
        local = self.local_of(orig_idx)
        return self.valid_chunks[local] if local is not None else None


# ---------- OpenAI tool 스키마 ----------
TOOLS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "inspect_document_stats",
            "description": (
                "문서 메타 정보(분류, 유효 청크 인덱스, 핵심 키워드, 길이 통계, 사용 가능 Bloom 유형)를 반환한다. "
                "에이전트는 반드시 첫 호출로 이 도구를 사용해야 한다."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "preview_chunks",
            "description": "지정한 원본 청크 인덱스들의 첫 200자 미리보기. 청크 선택 전 내용 확인용.",
            "parameters": {
                "type": "object",
                "properties": {
                    "indices": {
                        "type": "array",
                        "items": {"type": "integer"},
                        "description": "확인할 원본 청크 인덱스 리스트",
                    },
                },
                "required": ["indices"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "select_chunks_mmr",
            "description": (
                "MMR(Maximal Marginal Relevance)로 정보성+다양성 기준 N개 청크를 추천한다. "
                "lambda_param: 0.7=균형(권장), 1.0=정보성만, 0.0=다양성만."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "n": {"type": "integer", "minimum": 1, "maximum": 10},
                    "lambda_param": {"type": "number", "minimum": 0.0, "maximum": 1.0},
                },
                "required": ["n", "lambda_param"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "find_related_chunks",
            "description": (
                "기준 청크와 유사하거나(similar) 대비되는(different) 청크를 검색한다. "
                "비교/분석 유형 Q&A를 위한 짝 청크를 찾을 때 사용."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "chunk_idx": {"type": "integer", "description": "기준 청크의 원본 인덱스"},
                    "mode": {"type": "string", "enum": ["similar", "different"]},
                    "top_k": {"type": "integer", "minimum": 1, "maximum": 5, "default": 3},
                },
                "required": ["chunk_idx", "mode"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_qa_single",
            "description": "단일 청크에서 Q&A 1개를 생성. '사실 확인', '이해', '적용' 유형 전용.",
            "parameters": {
                "type": "object",
                "properties": {
                    "chunk_idx": {"type": "integer"},
                    "bloom_type": {"type": "string", "enum": SINGLE_BLOOM_TYPES},
                },
                "required": ["chunk_idx", "bloom_type"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_qa_multi",
            "description": (
                "2~3개 청크를 결합해 단일 청크로 답할 수 없는 Q&A를 1개 생성. "
                "'분석', '비교' 유형 전용. 청크 인덱스들은 서로 다른 주제/대상이어야 효과적."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "chunk_indices": {
                        "type": "array",
                        "items": {"type": "integer"},
                        "minItems": 2,
                        "maxItems": 3,
                    },
                    "bloom_type": {"type": "string", "enum": MULTI_BLOOM_TYPES},
                },
                "required": ["chunk_indices", "bloom_type"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "finalize",
            "description": "목표 Q&A 개수를 충분히 모았거나 추가 생성이 어렵다고 판단되면 호출. 루프 종료.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
]


# ---------- 도구 구현 ----------
def tool_inspect_document_stats(state: AgentState) -> dict:
    lens = [len(c) for c in state.valid_chunks]
    diff_config = _difficulty_config(state.difficulty)
    return {
        "category": state.category,
        "total_chunks_in_doc": len(state.chunks),
        "valid_chunks_count": len(state.valid_chunks),
        "valid_chunk_indices": state.valid_indices,
        "rare_tokens": state.rare_tokens,
        "chunk_length_avg": round(sum(lens) / len(lens), 1) if lens else 0,
        "chunk_length_min": min(lens) if lens else 0,
        "chunk_length_max": max(lens) if lens else 0,
        "target_qa_count": state.target_n,
        "difficulty": state.difficulty,
        "bloom_priority": diff_config["bloom_priority"],
        "lambda_param_hint": diff_config["lambda_param_hint"],
        "available_bloom_types": [name for name, _ in BLOOM_TYPES],
        "guidance": (
            f"{diff_config['instruction']} "
            "사실확인/이해/적용은 generate_qa_single, 분석/비교는 find_related_chunks로 짝 찾고 generate_qa_multi를 사용하라."
        ),
    }


def tool_preview_chunks(state: AgentState, indices: list[int]) -> dict:
    previews = []
    for idx in indices:
        local = state.local_of(idx)
        if local is None:
            previews.append({"idx": idx, "error": "invalid or junk-filtered"})
            continue
        text = state.valid_chunks[local]
        previews.append({
            "idx": idx,
            "length": len(text),
            "used": idx in state.used_chunk_indices,
            "failed_before": idx in state.failed_chunk_indices,
            "preview": text[:200].strip(),
        })
    return {"previews": previews}


def tool_select_chunks_mmr(state: AgentState, n: int, lambda_param: float) -> dict:
    selected = select_diverse_chunks(state.chunks, n=n, lambda_param=lambda_param)
    return {
        "selected": [
            {
                "idx": idx,
                "used": idx in state.used_chunk_indices,
                "preview": text[:200].strip(),
            }
            for idx, text in selected
        ],
        "note": "추천일 뿐, 다른 청크를 골라도 무방. 이미 used=true인 청크는 재사용 금지.",
    }


def tool_find_related_chunks(
    state: AgentState, chunk_idx: int, mode: str, top_k: int = 3
) -> dict:
    state.ensure_embeddings()
    local = state.local_of(chunk_idx)
    if local is None:
        return {"error": f"chunk_idx={chunk_idx}는 유효하지 않음 (junk 또는 범위 초과)"}

    sims = state.valid_embs @ state.valid_embs[local]
    sims = sims.copy()
    sims[local] = -2.0  # 자기 자신 제외

    if mode == "similar":
        order = np.argsort(-sims)
    elif mode == "different":
        order = np.argsort(sims)
    else:
        return {"error": f"mode는 'similar' 또는 'different'만 가능 (입력: {mode})"}

    top = order[:top_k]
    return {
        "anchor_idx": chunk_idx,
        "mode": mode,
        "results": [
            {
                "idx": state.valid_indices[int(i)],
                "similarity": round(float(sims[i]), 3),
                "used": state.valid_indices[int(i)] in state.used_chunk_indices,
                "preview": state.valid_chunks[int(i)][:200].strip(),
            }
            for i in top
        ],
    }


def tool_generate_qa_single(
    state: AgentState, chunk_idx: int, bloom_type: str
) -> dict:
    if chunk_idx in state.used_chunk_indices:
        return {"error": f"chunk_idx={chunk_idx}는 이미 사용됨. 다른 청크를 선택하라."}

    chunk = state.chunk_of(chunk_idx)
    if chunk is None:
        return {"error": f"chunk_idx={chunk_idx}는 유효하지 않음"}

    matching = [(name, desc) for name, desc in BLOOM_TYPES if name == bloom_type]
    if not matching:
        return {"error": f"bloom_type='{bloom_type}'는 single용이 아님"}

    qa_list = generate_qa_for_chunk(chunk, state.category, state.rare_tokens, matching)
    if not qa_list:
        state.failed_chunk_indices.add(chunk_idx)
        return {
            "success": False,
            "reason": "Best-of-N 모두 검증/점수 미달. 다른 청크 또는 다른 유형 권장.",
            "collected_so_far": len(state.qa_items),
        }
    qa = qa_list[0]  # top_k=1

    state.used_chunk_indices.add(chunk_idx)
    state.qa_items.append(QAItem(
        chunk_idx=chunk_idx,
        chunk=chunk,
        bloom_type=qa.bloom_type,
        question=qa.question,
        answer=qa.answer,
        answer_quote=qa.answer_quote,
        anchor_used=qa.anchor_used,
    ))
    return {
        "success": True,
        "bloom_type": qa.bloom_type,
        "question": qa.question,
        "answer_preview": qa.answer[:150],
        "anchor_used": qa.anchor_used,
        "collected_so_far": len(state.qa_items),
        "remaining_target": max(0, state.target_n - len(state.qa_items)),
    }


def tool_generate_qa_multi(
    state: AgentState, chunk_indices: list[int], bloom_type: str
) -> dict:
    if len(set(chunk_indices)) < 2:
        return {"error": "서로 다른 청크 인덱스 2개 이상 필요"}

    used_overlap = [i for i in chunk_indices if i in state.used_chunk_indices]
    if used_overlap:
        return {"error": f"이미 사용된 청크 포함: {used_overlap}"}

    pairs: list[tuple[int, str]] = []
    for idx in chunk_indices:
        chunk = state.chunk_of(idx)
        if chunk is None:
            return {"error": f"chunk_idx={idx}는 유효하지 않음"}
        pairs.append((idx, chunk))

    qa_list = generate_qa_multi_chunk(pairs, state.category, state.rare_tokens, bloom_type)
    if not qa_list:
        for idx in chunk_indices:
            state.failed_chunk_indices.add(idx)
        return {
            "success": False,
            "reason": "멀티 청크 Best-of-N 모두 검증/점수 미달. 다른 조합 또는 단일 청크 시도 권장.",
            "collected_so_far": len(state.qa_items),
        }
    qa = qa_list[0]  # top_k=1

    main_idx, _ = pairs[0]
    for idx in chunk_indices:
        state.used_chunk_indices.add(idx)

    state.qa_items.append(QAItem(
        chunk_idx=main_idx,
        chunk="\n\n---\n\n".join(c for _, c in pairs),
        bloom_type=qa.bloom_type,
        question=qa.question,
        answer=qa.answer,
        answer_quote=qa.answer_quote,
        anchor_used=qa.anchor_used,
    ))
    return {
        "success": True,
        "bloom_type": qa.bloom_type,
        "question": qa.question,
        "answer_preview": qa.answer[:150],
        "merged_chunks": chunk_indices,
        "collected_so_far": len(state.qa_items),
        "remaining_target": max(0, state.target_n - len(state.qa_items)),
    }


# ---------- 디스패치 ----------
def _dispatch(name: str, args_json: str, state: AgentState) -> dict:
    try:
        args = json.loads(args_json) if args_json else {}
    except json.JSONDecodeError:
        return {"error": "도구 인자 JSON 파싱 실패"}

    try:
        if name == "inspect_document_stats":
            return tool_inspect_document_stats(state)
        if name == "preview_chunks":
            return tool_preview_chunks(state, args["indices"])
        if name == "select_chunks_mmr":
            return tool_select_chunks_mmr(state, args["n"], args["lambda_param"])
        if name == "find_related_chunks":
            return tool_find_related_chunks(
                state, args["chunk_idx"], args["mode"], args.get("top_k", 3)
            )
        if name == "generate_qa_single":
            return tool_generate_qa_single(state, args["chunk_idx"], args["bloom_type"])
        if name == "generate_qa_multi":
            return tool_generate_qa_multi(state, args["chunk_indices"], args["bloom_type"])
        if name == "finalize":
            return {"finalized": True, "total_qa": len(state.qa_items)}
        return {"error": f"알 수 없는 도구: {name}"}
    except KeyError as e:
        return {"error": f"인자 누락: {e}"}
    except Exception as e:
        return {"error": f"도구 실행 예외: {str(e)[:200]}"}


# ---------- 시스템 프롬프트 ----------
SYSTEM_PROMPT = """\
당신은 문서 기반 평가 데이터셋을 만드는 에이전트입니다.

[목표]
주어진 문서에서 목표 개수의 Q&A를 생성한다. Bloom 유형(사실 확인, 이해, 적용, 분석, 비교)이 가능한 한 다양하게 분포해야 한다.

[작업 순서]
1. inspect_document_stats로 문서 메타 정보를 먼저 확인.
2. 문서 도메인/길이 기반으로 적절한 lambda 값을 결정한 뒤(보통 0.5~0.8), select_chunks_mmr로 후보 청크 추천 받음. n은 target_qa_count보다 약간 크게(여유 두기).
3. preview_chunks로 추천 청크 내용을 확인.
4. 각 청크에 어울리는 Bloom 유형을 선택:
   - 자족적 사실/원리/적용 → generate_qa_single (사실 확인/이해/적용)
   - 두 청크의 정보 결합이 필요 → find_related_chunks로 짝 청크 찾고 generate_qa_multi (분석/비교)
5. 생성 실패 시 다른 청크 또는 다른 유형으로 재시도.
6. target_qa_count에 도달하면 finalize 호출.

[엄수]
- 이미 사용된 청크(used=true)는 재사용 금지. 도구가 거부함.
- Bloom 유형을 가능한 한 중복 없이 배치.
- 멀티 청크 결합은 분석/비교 전용. 단일 청크로 답 가능한 질문에 결합 사용 금지.
- 한 응답에서 여러 도구를 병렬 호출해도 됨. 단, 같은 청크를 동시에 두 곳에 쓰지 말 것.
"""


# ---------- 메인 진입점 ----------
def run_qa_agent(
    chunks: list[str],
    category: str,
    rare_tokens: list[str],
    target_n: int = 3,
    difficulty: str = "medium",
    max_iterations: int = 25,
) -> list[QAItem]:
    """
    Agentic Q&A 생성. OpenAI tool calling으로 LLM이 청크/유형/결합을 동적으로 결정.

    Args:
        chunks: 전체 청크 리스트 (RecursiveCharacterTextSplitter 결과)
        category: classify_document 결과
        rare_tokens: extract_rare_tokens 결과
        target_n: 목표 Q&A 개수
        difficulty: 사용자가 선택한 난이도 ("low"|"medium"|"high"). Bloom 유형 분포와
                    멀티청크 사용 비율을 결정한다.
        max_iterations: 도구 호출 라운드 상한
    """
    if _openai_client is None:
        raise RuntimeError("OPENAI_API_KEY 환경변수가 설정되지 않았습니다.")

    valid = [(i, c) for i, c in enumerate(chunks) if not _is_junk_chunk(c)]
    if not valid:
        valid = sorted(enumerate(chunks), key=lambda x: -len(x[1]))[: max(target_n * 2, 5)]

    state = AgentState(
        chunks=chunks,
        valid_indices=[i for i, _ in valid],
        valid_chunks=[c for _, c in valid],
        category=category,
        rare_tokens=rare_tokens,
        target_n=target_n,
        difficulty=difficulty,
    )

    diff_config = _difficulty_config(difficulty)
    messages: list[Any] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"이 문서에서 Q&A {target_n}개를 생성하라.\n"
                f"{diff_config['instruction']}\n"
                f"먼저 inspect_document_stats를 호출하여 문서를 파악한 뒤 계획을 세워라."
            ),
        },
    ]

    for i in range(max_iterations):
        print(f"[Agent] iter={i+1} qa_count={len(state.qa_items)}/{target_n}")
        resp = _openai_client.chat.completions.create(
            model=_OPENAI_MODEL,
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
            temperature=0.3,
        )
        msg = resp.choices[0].message

        asst_entry: dict[str, Any] = {"role": "assistant", "content": msg.content}
        if msg.tool_calls:
            asst_entry["tool_calls"] = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.function.name,
                        "arguments": tc.function.arguments,
                    },
                }
                for tc in msg.tool_calls
            ]
        messages.append(asst_entry)

        if not msg.tool_calls:
            print("[Agent] no tool calls — exiting")
            break

        finalized = False
        for tc in msg.tool_calls:
            args_repr = (tc.function.arguments or "")[:120]
            print(f"[Agent]   → {tc.function.name}({args_repr})")
            result = _dispatch(tc.function.name, tc.function.arguments, state)
            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "name": tc.function.name,
                "content": json.dumps(result, ensure_ascii=False)[:4000],
            })
            if tc.function.name == "finalize":
                finalized = True

        if finalized:
            print("[Agent] finalize called — exiting")
            break

        if len(state.qa_items) >= target_n + 2:
            print(f"[Agent] qa_count {len(state.qa_items)} >= target+2 — forcing exit")
            break
    else:
        print(f"[Agent] max_iterations({max_iterations}) reached")

    return state.qa_items
