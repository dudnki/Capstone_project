"""
문서 분석기:
- classify_document(): 임베딩 기반 대분류 (BAAI/bge-m3)
- extract_rare_tokens(): KeyBERT + 도메인 사전 차집합으로 희귀 토큰 추출

모델은 싱글톤으로 1회만 로드 (서버 첫 호출 시 ~10초).
KeyBERT는 같은 SentenceTransformer 인스턴스를 재활용.
"""
import numpy as np
import os
from sentence_transformers import SentenceTransformer
from keybert import KeyBERT
from app.services.domain_keywords import DOMAIN_DESCRIPTIONS, DOMAIN_KEYWORDS

# 한국어 SOTA 다국어 임베딩 모델 (~2.3GB)
_MODEL_NAME = "BAAI/bge-m3"

_model: SentenceTransformer | None = None
_kw_model: KeyBERT | None = None
_category_embeddings: dict[str, np.ndarray] | None = None


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        print(f"[Analyzer] Loading {_MODEL_NAME} ...")
        _model = SentenceTransformer(_MODEL_NAME)
        print("[Analyzer] Model loaded.")
    return _model


def _get_kw_model() -> KeyBERT:
    global _kw_model
    if _kw_model is None:
        _kw_model = KeyBERT(model=_get_model())
    return _kw_model


def _get_category_embeddings() -> dict[str, np.ndarray]:
    """카테고리 자연어 설명을 임베딩으로 변환 (1회 캐시)."""
    global _category_embeddings
    if _category_embeddings is None:
        model = _get_model()
        _category_embeddings = {
            cat: model.encode(desc, normalize_embeddings=True)
            for cat, desc in DOMAIN_DESCRIPTIONS.items()
        }
    return _category_embeddings


def classify_document(text: str) -> tuple[str, dict[str, float]]:
    """
    문서를 대분류로 분류.

    Args:
        text: 문서 본문 (앞 2000자만 사용)

    Returns:
        (best_category, similarities_dict)
    """
    model = _get_model()
    cat_embs = _get_category_embeddings()

    doc_emb = model.encode(text[:2000], normalize_embeddings=True)

    similarities = {
        cat: float(np.dot(doc_emb, emb))
        for cat, emb in cat_embs.items()
    }

    best_category = max(similarities, key=similarities.get)
    return best_category, similarities


import re
import unicodedata


def _normalize_text(text: str) -> str:
    """간단한 정규화: 하이픈 이어짐 제거, 줄바꿈→공백, 연속공백 정리, unicode 정규화."""
    t = unicodedata.normalize("NFKC", text)
    t = t.replace("-\n", "")  # 하이픈으로 끊긴 단어 복원
    t = t.replace("\n", " ")
    t = re.sub(r"[\x00-\x1f\x7f]+", "", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def _is_valid_candidate(tok: str) -> bool:
    tok = tok.strip()
    if not tok:
        return False
    if len(tok) < 2:
        return False
    if len(tok) > 60:
        return False
    # must contain Hangul syllable or sufficient Latin letters/digits
    if re.search(r"[\uac00-\ud7af]", tok):
        # reject if too many odd symbols
        odd = len(re.findall(r"[^\uac00-\ud7af0-9a-zA-Z\s\-_.]", tok))
        if odd > 3:
            return False
        return True
    else:
        letters = re.sub(r"[^A-Za-z]", "", tok)
        if len(letters) >= 3:
            return True
    return False


def _dedupe_preserve_order(cands: list[str]) -> list[str]:
    out: list[str] = []
    for c in cands:
        norm = re.sub(r"\s+", " ", c.lower()).strip()
        skip = False
        for e in out:
            en = re.sub(r"\s+", " ", e.lower()).strip()
            if norm == en or norm in en or en in norm:
                skip = True
                break
        if not skip:
            out.append(c)
    return out


def extract_rare_tokens(
    text: str,
    category: str,
    top_n: int = 8,
    candidate_n: int = 20,
) -> list[str]:
    """
    하이브리드 키워드 추출:
    1) KeyBERT(혹은 대체)로 후보 생성
    2) 로컬 임베딩으로 문서-후보 유사도 계산 후 MMR/greedy로 상위 후보 선택
    3) (옵션) LLM으로 후보 정제 (환경변수 USE_KEYWORD_LLM=1)

    Args:
        text: 문서 본문
        category: classify_document 결과
        top_n: 최종 반환할 희귀 토큰 개수
        candidate_n: KeyBERT가 1차로 뽑을 후보 개수
    """
    kw_model = _get_kw_model()
    model = _get_model()

    cleaned = _normalize_text(text[:5000])

    # 1) 후보 생성 (KeyBERT fallback 포함)
    try:
        keywords = kw_model.extract_keywords(
            cleaned,
            keyphrase_ngram_range=(1, 3),
            stop_words=None,
            top_n=candidate_n,
            use_mmr=True,
            diversity=0.6,
        )
        extracted = [kw for kw, _ in keywords]
    except Exception:
        tokens = re.split(r"\s+", cleaned)
        extracted = [t for t in tokens if len(t) >= 2][:candidate_n]

    # early exit
    if not extracted:
        return []

    # 2) 임베딩 기반 정렬 + MMR으로 다양성 확보
    try:
        doc_emb = model.encode(cleaned[:2000], normalize_embeddings=True)
        cand_embs = model.encode(extracted, normalize_embeddings=True)
        sims = np.dot(cand_embs, doc_emb)

        # pairs
        cand_pairs = [(extracted[i], float(sims[i]), cand_embs[i]) for i in range(len(extracted))]
        # sort by relevance
        cand_pairs.sort(key=lambda x: x[1], reverse=True)

        # MMR selection
        def mmr_select(pairs, k=12, lambda_param=0.7):
            if not pairs:
                return []
            selected = []
            cand_embs_local = [p[2] for p in pairs]
            docsims = [p[1] for p in pairs]
            remaining = list(range(len(pairs)))
            # pick the most relevant first
            first = remaining.pop(0)
            selected.append(first)
            while remaining and len(selected) < k:
                best_idx = None
                best_score = -1e9
                for idx in remaining:
                    rel = docsims[idx]
                    # diversity term: max similarity to already selected
                    max_sim = 0.0
                    for sidx in selected:
                        sim = float(np.dot(cand_embs_local[idx], cand_embs_local[sidx]))
                        if sim > max_sim:
                            max_sim = sim
                    score = lambda_param * rel - (1 - lambda_param) * max_sim
                    if score > best_score:
                        best_score = score
                        best_idx = idx
                if best_idx is None:
                    break
                remaining.remove(best_idx)
                selected.append(best_idx)
            return [pairs[i][0] for i in selected]

        top_m = min(12, len(cand_pairs))
        mmr_selected = mmr_select(cand_pairs, k=top_m, lambda_param=0.7)
    except Exception:
        # 임베딩 단계 실패 시 단순 상위 후보 사용
        mmr_selected = extracted[:min(12, len(extracted))]

    # domain 차집합 및 후보 검증
    domain_common = DOMAIN_KEYWORDS.get(category, [])
    final_cands = []
    for kw in mmr_selected:
        kw_clean = kw.strip()
        if not _is_valid_candidate(kw_clean):
            continue
        if any(d for d in domain_common if d and d in kw_clean):
            continue
        final_cands.append(kw_clean)

    # fallback 완화
    if len(final_cands) < 3:
        for kw in mmr_selected:
            kw_clean = kw.strip()
            if _is_valid_candidate(kw_clean) and kw_clean not in final_cands:
                final_cands.append(kw_clean)
                if len(final_cands) >= 3:
                    break

    # dedupe
    deduped = _dedupe_preserve_order(final_cands)
    
    # 3) (옵션) LLM 정제: 환경변수로 켜기 (USE_KEYWORD_LLM=1)
    use_llm = os.environ.get("USE_KEYWORD_LLM", "0") == "1"
    if use_llm and deduped:
        try:
            import json as _json
            import google.generativeai as genai  # type: ignore
            api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
            if api_key:
                genai.configure(api_key=api_key)
                model_name = os.environ.get("KEYWORD_LLM_MODEL", "gemini-3.1-flash-lite-preview")
                model_llm = genai.GenerativeModel(model_name)
                print(f"[RareTokens] Gemini model set to {model_name}")

                domain_common = DOMAIN_KEYWORDS.get(category, [])

                prompt = (
                    f"다음은 '{category}' 도메인의 문서 일부다. "
                    f"이 문서를 다른 문서와 구별짓는 핵심 키워드를 정확히 {top_n}개 뽑아라.\n\n"
                    "[선정 기준]\n"
                    "- 이 문서 고유의 핵심 개념/용어/대상을 우선 선정\n"
                    "  · 학술/기술문서면: 기법명, 모델명, 지표명, 신조어 (예: PiSSA, GSM8K, Frozen-A)\n"
                    "  · 법률/약관이면: 특정 조항명, 권리 의무 관계, 절차 명칭\n"
                    "  · 사업보고서면: 사업명, 제품명, 핵심 사업지표 명칭\n"
                    "  · 매뉴얼이면: 부품명, 기능명, 절차명\n"
                    "- 도메인 일반 단어 제외: " + ", ".join(domain_common[:15]) + "\n"
                    "- 한 글자, 숫자만, 의미 없는 결합, 메타 표현(이 문서, 위 글) 제외\n"
                    "- 각 키워드는 1~4단어, 30자 이내, 문서에 실제 등장하는 표기 그대로\n\n"
                    "[KeyBERT 1차 후보 — 참고용, 노이즈 있을 수 있음]\n"
                    + ", ".join(deduped[:15]) + "\n\n"
                    "[문서 본문]\n"
                    + text[:6000] + "\n\n"
                    "출력은 오직 JSON 객체로: {\"keywords\": [\"..\", ...]}"
                )
                resp = model_llm.generate_content(
                    prompt,
                    generation_config={
                        "temperature": 0.1,
                        "max_output_tokens": 4096,  # 2.5-flash는 thinking 토큰 사용 → 큰 여유
                        "response_mime_type": "application/json",
                    },
                )

                # 응답 안전 추출 (resp.text가 None일 수 있음)
                out_text = ""
                try:
                    out_text = (resp.text or "").strip()
                except Exception:
                    pass

                if not out_text:
                    # candidates 직접 탐색
                    try:
                        for cand in (resp.candidates or []):
                            for part in (cand.content.parts or []):
                                t = getattr(part, "text", "")
                                if t:
                                    out_text += t
                    except Exception:
                        pass
                    out_text = out_text.strip()

                if not out_text:
                    print(f"[RareTokens] LLM 응답 비어있음 (finish_reason={getattr(resp.candidates[0], 'finish_reason', 'unknown') if resp.candidates else 'no candidates'})")

                # 마크다운 코드블록 제거
                out_text = re.sub(r"^```(?:json)?\s*", "", out_text)
                out_text = re.sub(r"\s*```$", "", out_text)

                llm_keys = []
                if out_text:
                    # 1차 시도: 정상 JSON 파싱
                    try:
                        json_start = out_text.find('{')
                        json_end = out_text.rfind('}')
                        if json_start >= 0 and json_end > json_start:
                            json_part = out_text[json_start:json_end + 1]
                            parsed = _json.loads(json_part)
                            llm_keys = parsed.get("keywords", [])
                        else:
                            raise ValueError("닫는 } 없음 (응답 잘림 가능성)")
                    except Exception:
                        # 2차 fallback: 정규식으로 닫힌 문자열만 추출 (잘려도 안전)
                        matches = re.findall(r'"([^"]+)"', out_text)
                        llm_keys = [m for m in matches if m.lower() not in ("keywords", "keyword")]
                        if llm_keys:
                            print(f"[RareTokens] JSON 잘림 → 정규식으로 {len(llm_keys)}개 복구")
                        else:
                            print(f"[RareTokens] LLM raw output (debug): {out_text[:300]}")

                if llm_keys:
                    processed = []
                    for k in llm_keys:
                        s = re.sub(r"\s+", " ", str(k).strip())[:20]
                        if _is_valid_candidate(s) and s not in processed:
                            processed.append(s)
                    if processed:
                        return processed[:top_n]
        except Exception as e:
            print(f"[RareTokens] LLM 정제 실패: {e}")

    # 마지막 간소화(기존 shortener 사용)
    def _shorten_candidate(tok: str) -> str:
        tok = tok.strip()
        if not tok:
            return ""
        tok = re.sub(r"\d{4}[-/년\.\s]*\d{1,2}([-/월\.\s]*\d{1,2})?", " ", tok)
        tok = re.sub(r"\d+", " ", tok)
        tok = re.sub(r"[^\uac00-\ud7afA-Za-z\s]", " ", tok)
        tok = re.sub(r"\s+", " ", tok).strip()
        stop = {
            "is", "only", "the", "a", "an", "of", "and", "in",
            "회사", "주식회사", "법인", "자회사", "본사", "현대", "한국", "제출", "관리", "관련",
            "업", "사업", "확인서", "제출대상법인", "유형", "주권상장법인", "설립일", "연월일",
            "년", "월", "일", "연구", "본연구", "형식", "방법", "방식", "결과", "신규취득",
        }
        parts = re.findall(r"[\uac00-\ud7af]+|[A-Za-z]+", tok)
        parts = [p for p in parts if p and p.lower() not in stop]
        if not parts:
            return ""
        hangul = [p for p in parts if re.search(r"[\uac00-\ud7af]", p)]
        if hangul:
            chosen = hangul[:2]
        else:
            chosen = parts[:2]
        short = " ".join(chosen)
        short = short[:20].strip()
        if short.lower() in stop or len(short) < 2:
            return ""
        return short

    shortened = []
    for c in deduped:
        s = _shorten_candidate(c)
        if s and _is_valid_candidate(s) and s not in shortened:
            shortened.append(s)
    if not shortened:
        shortened = deduped

    return shortened[:top_n]


# ====================================================================
# 청크 선택 (Junk 필터 + MMR 다양성)
# ====================================================================

def _is_junk_chunk(chunk: str) -> bool:
    """규칙 기반 잉여 청크 필터: 표지/목차/면책/거의 빈 페이지 등."""
    text = chunk.strip()

    # 1) 너무 짧음
    if len(text) < 200:
        return True

    # 2) 목차 패턴 (점선 + 페이지 번호 반복)
    if len(re.findall(r"\.{3,}\s*\d+", text)) >= 3:
        return True

    # 3) 한글/영문 비율이 너무 낮음 (숫자/기호 위주)
    letters = len(re.findall(r"[가-힣A-Za-z]", text))
    if len(text) > 100 and letters / len(text) < 0.4:
        return True

    # 4) Boilerplate 표현 다수 포함
    boilerplate = [
        "저작권", "본 문서는 외부", "무단 복제 금지", "Copyright",
        "책임을 지지 않", "All rights reserved", "Confidential",
    ]
    if sum(b.lower() in text.lower() for b in boilerplate) >= 2:
        return True

    # 5) 동일 줄 반복 (목차 / 리스트성 잉여 페이지)
    lines = [ln for ln in text.split("\n") if ln.strip()]
    if len(lines) > 5 and len(set(lines)) / len(lines) < 0.5:
        return True

    return False


def select_diverse_chunks(
    chunks: list[str],
    n: int = 3,
    lambda_param: float = 0.7,
) -> list[tuple[int, str]]:
    """
    잉여 청크 필터링 + MMR로 정보성 + 다양성 기준 N개 청크 선택.

    Args:
        chunks: 전체 청크 리스트
        n: 선택할 청크 수
        lambda_param: relevance vs diversity 비율 (0.7 = 적합도 우선)

    Returns:
        [(원본 인덱스, 청크 텍스트), ...]
    """
    if not chunks:
        return []

    # 1) Junk 필터
    valid = [(i, c) for i, c in enumerate(chunks) if not _is_junk_chunk(c)]

    # 모두 junk이면 폴백: 가장 긴 N개
    if not valid:
        sorted_by_len = sorted(enumerate(chunks), key=lambda x: -len(x[1]))
        return sorted_by_len[:n]

    if len(valid) <= n:
        return valid

    # 2) 임베딩 + centroid 유사도 (정보성 점수)
    model = _get_model()
    valid_indices = [i for i, _ in valid]
    valid_texts = [c for _, c in valid]
    chunk_embs = model.encode(valid_texts, normalize_embeddings=True)

    centroid = chunk_embs.mean(axis=0)
    centroid_norm = np.linalg.norm(centroid)
    if centroid_norm > 0:
        centroid = centroid / centroid_norm
    relevance = chunk_embs @ centroid  # 코사인 유사도

    # 3) MMR 선택
    selected_local: list[int] = [int(np.argmax(relevance))]

    while len(selected_local) < n:
        best_score = -1e9
        best_idx = -1
        for i in range(len(valid)):
            if i in selected_local:
                continue
            rel = float(relevance[i])
            max_sim = max(float(np.dot(chunk_embs[i], chunk_embs[s])) for s in selected_local)
            mmr = lambda_param * rel - (1 - lambda_param) * max_sim
            if mmr > best_score:
                best_score = mmr
                best_idx = i
        if best_idx < 0:
            break
        selected_local.append(best_idx)

    return [(valid_indices[i], valid_texts[i]) for i in selected_local]
