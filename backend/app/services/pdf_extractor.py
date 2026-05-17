"""
PDF → Markdown 추출기 (적응형 하이브리드).

페이지마다 모드를 자동 결정해 LLM 호출을 최소화:
- 🟢 TEXT_ONLY: 텍스트만, PyMuPDF만 사용 (LLM 0회)
- 🟡 HYBRID: 본문은 PyMuPDF, 표/그림만 Gemini Vision
- 🔴 FULL_LLM: 스캔본/이미지 페이지, Gemini가 전체 인식
- ⚫ SKIP: 빈 페이지

공개 함수:
- pdf_to_markdown(file_bytes, dpi=300, max_pages=50, force_mode="auto") -> str
"""
from __future__ import annotations

import hashlib
import os
import time
from pathlib import Path
import fitz  # PyMuPDF


# ---------- 캐시 ----------
_CACHE_DIR = Path(__file__).resolve().parents[2] / ".cache" / "pdf_extracts"
_CACHE_DIR.mkdir(parents=True, exist_ok=True)


def _file_hash(file_bytes: bytes) -> str:
    return hashlib.sha256(file_bytes).hexdigest()[:16]


def _cache_path(file_hash: str) -> Path:
    return _CACHE_DIR / f"{file_hash}.md"


# ---------- 프롬프트 ----------
_FULL_PAGE_PROMPT = """이 PDF 페이지 이미지를 정확하게 Markdown으로 변환하라.

[기본 규칙]
- 페이지에 실제로 보이는 내용만 추출. 추측이나 환각 금지.
- 본문 텍스트는 원문 그대로.
- 섹션 헤더는 ## 또는 ### 사용.
- 페이지 번호, 머리말/꼬리말 등 반복 요소는 생략.
- 출력은 오직 Markdown. 추가 설명/주석 금지.

[수식]
- 인라인: $...$, 블록: $$...$$. 가능한 한 정확한 LaTeX.

[표]
- 모든 셀 텍스트를 빠짐없이 옮긴다.
- Markdown 표 형식 (| col | col |).
- 병합 셀은 같은 값을 각 칸에 반복.
- 표 위/아래 캡션이 있으면 **표 N: 캡션** 형식.
- 절대 "(생략)" 처리 금지.

[그림/그래프/다이어그램]
- 형식: [그림 N: 캡션]
- 그래프: 종류, x/y축 라벨, 시리즈 이름, 주요 수치, 추세
- 다이어그램: 노드, 화살표 관계
- 사진: 무엇을 보여주는지 한 문장
- 회사 로고/장식 아이콘은 무시"""


_VISUALS_ONLY_PROMPT = """이 PDF 페이지 이미지에서 **표(table)와 그림(figure/chart/diagram)만** 추출하라.

[절대 규칙]
- 본문 텍스트는 출력하지 않는다 (이미 다른 경로로 추출됨).
- 페이지 번호/머리말/꼬리말 출력 금지.
- 표나 그림이 전혀 없으면 정확히 "NONE" 한 글자만 출력.

[표]
- 모든 셀을 빠짐없이 Markdown 표로.
- 캡션이 있으면 **표 N: 캡션** 형식으로 표 위에.
- 병합 셀은 같은 값을 각 칸에 반복.
- 절대 "(생략)" 처리 금지.

[그림/그래프/다이어그램]
- 형식: [그림 N: 캡션]
- 그래프: 종류, x/y축 라벨과 단위, 시리즈, 주요 수치(피크/저점/시작/끝), 추세
- 다이어그램: 노드 이름, 화살표 방향과 라벨
- 사진/이미지: 무엇을 보여주는지 한 문장
- 회사 로고/장식 아이콘은 무시

여러 표/그림은 페이지 등장 순서대로 모두 출력."""


# ---------- Gemini 모델 ----------
_gemini_model = None
_gemini_init_attempted = False


def _get_gemini_model():
    global _gemini_model, _gemini_init_attempted
    if _gemini_init_attempted:
        return _gemini_model

    _gemini_init_attempted = True
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        print("[PDF Extractor] GEMINI_API_KEY 미설정 → 모든 페이지 PyMuPDF만 사용")
        return None

    try:
        import google.generativeai as genai  # type: ignore
        genai.configure(api_key=api_key)
        _gemini_model = genai.GenerativeModel("gemini-2.5-flash")
        print("[PDF Extractor] Gemini 2.5 Flash 준비 완료")
    except Exception as e:
        print(f"[PDF Extractor] Gemini 초기화 실패: {e}")
        _gemini_model = None
    return _gemini_model


# ---------- 페이지 프로파일링 ----------
def _significant_image_count(page: fitz.Page, min_size: int = 100, min_area_ratio: float = 0.05) -> int:
    """장식 아이콘/로고는 제외한 의미있는 이미지 개수."""
    try:
        images = page.get_images(full=True)
    except Exception:
        return 0
    if not images:
        return 0

    page_area = page.rect.width * page.rect.height
    count = 0
    for img in images:
        # img tuple: (xref, smask, width, height, bpc, colorspace, alt_colorspace, name, filter)
        try:
            w, h = img[2], img[3]
        except (IndexError, TypeError):
            continue
        if w < min_size or h < min_size:
            continue
        if page_area > 0 and (w * h) / page_area < min_area_ratio:
            continue
        count += 1
    return count


def _table_count(page: fitz.Page) -> int:
    """PyMuPDF 표 감지. 미지원 버전이면 0 반환."""
    try:
        tabs = page.find_tables()
        return len(tabs.tables) if tabs else 0
    except Exception:
        return 0


def _has_proper_korean_spacing(text: str, min_ratio: float = 0.05) -> bool:
    """
    한국어 PDF 본문이 정상적으로 띄어쓰기 되어 있는지 검사.
    한글 문자 대비 '한글 + 공백 + 한글' 패턴 비율로 판단.
    """
    import re
    if len(text) < 100:
        return True  # 너무 짧으면 판단 보류

    korean = len(re.findall(r"[가-힣]", text))
    if korean < 50:
        return True  # 한글 거의 없으면 무관 (영문/숫자 위주 페이지)

    # '한글 공백 한글' 패턴 — 정상 띄어쓰기의 자연스러운 흔적
    spaced = len(re.findall(r"[가-힣]\s+[가-힣]", text))
    ratio = spaced / korean
    return ratio >= min_ratio


def _classify_page(page: fitz.Page, text_min_chars: int = 100) -> str:
    """
    페이지 모드 결정: TEXT_ONLY | HYBRID | FULL_LLM | SKIP

    추가 보호: PyMuPDF 추출 결과의 한국어 띄어쓰기가 깨졌으면 FULL_LLM으로 다운그레이드
    (PDF 폰트 인코딩 이슈로 본문이 통째 붙어있는 케이스 대응)
    """
    text = page.get_text("text").strip()
    text_len = len(text)
    n_imgs = _significant_image_count(page)
    n_tables = _table_count(page)

    if text_len < text_min_chars:
        # 텍스트 빈약
        if n_imgs > 0:
            return "FULL_LLM"  # 스캔본/이미지 페이지
        return "SKIP"  # 빈 페이지

    # 텍스트는 있지만 띄어쓰기가 깨진 한국어 페이지 → Gemini로 풀 추출
    if not _has_proper_korean_spacing(text):
        return "FULL_LLM"

    # 정상 페이지
    if n_imgs == 0 and n_tables == 0:
        return "TEXT_ONLY"
    return "HYBRID"


# ---------- 본문 텍스트 추출 ----------
def _clean_pymupdf4llm_noise(md: str) -> str:
    """
    pymupdf4llm 출력의 인라인 노이즈 제거.
    - `text` (인라인 백틱) → text
    - _text_ (인라인 언더스코어) → text
    - "==> picture ... <==" 마커 + "Start/End of picture text" 블록 제거
      (Gemini Vision이 이미 같은 영역을 깔끔하게 추출하므로 중복)
    - 코드펜스(```), 표(|), 헤더(##), **bold**, 수식($)은 보존
    """
    import re
    # 코드펜스 블록은 잠시 마스킹
    code_blocks: list[str] = []
    def _save_code(m: re.Match) -> str:
        code_blocks.append(m.group(0))
        return f"§§CODE{len(code_blocks)-1}§§"
    md = re.sub(r"```[\s\S]*?```", _save_code, md)

    # picture 영역 통째로 제거 (Gemini가 처리)
    # 1) "==> picture [WxH] intentionally omitted <==" 한 줄 제거
    md = re.sub(r"\*{0,2}==>\s*picture[^<\n]*<==\*{0,2}\s*", "", md)
    # 2) "----- Start of picture text -----" ~ "----- End of picture text -----" 블록 제거
    md = re.sub(
        r"\*{0,2}-{2,}\s*Start of picture text\s*-{2,}\*{0,2}[\s\S]*?\*{0,2}-{2,}\s*End of picture text\s*-{2,}\*{0,2}",
        "",
        md,
    )

    # 인라인 백틱 제거 (코드펜스 외)
    md = re.sub(r"`([^`\n]+)`", r"\1", md)
    # 인라인 언더스코어 제거 (단어 경계 보장 - 변수명 word_2 등 보호)
    md = re.sub(r"(?<![A-Za-z0-9_])_([^_\n]+?)_(?![A-Za-z0-9_])", r"\1", md)

    # 코드펜스 복원
    for i, blk in enumerate(code_blocks):
        md = md.replace(f"§§CODE{i}§§", blk)

    # 줄 시작 잉여 공백/들여쓰기 정리 (표 들여쓰기는 보존되도록 마지막에 처리)
    md = re.sub(r"<br>", "\n", md)  # pymupdf4llm가 가끔 <br>로 줄바꿈 표기
    md = re.sub(r"[ \t]+\n", "\n", md)  # 줄 끝 공백
    md = re.sub(r"\n{3,}", "\n\n", md)  # 빈 줄 3개 이상 → 2개로
    return md.strip()


def _extract_text_pymupdf(page: fitz.Page) -> str:
    """
    PyMuPDF 텍스트 추출.

    1순위: pymupdf4llm (공백/구조 보존) + 노이즈 제거
    2순위: 단순 get_text (폴백)
    """
    try:
        import pymupdf4llm  # type: ignore
        doc = page.parent
        md = pymupdf4llm.to_markdown(doc, pages=[page.number])
        if md and md.strip():
            return _clean_pymupdf4llm_noise(md)
    except Exception:
        pass
    return page.get_text("text").strip()


# ---------- Gemini 호출 ----------
def _render_page_to_png(page: fitz.Page, dpi: int = 300) -> bytes:
    zoom = dpi / 72.0
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    return pix.tobytes(output="png")


def _gemini_call(model, prompt: str, img_bytes: bytes, page_idx: int,
                 max_tokens: int = 4096, max_retries: int = 2) -> str:
    """프롬프트 + 이미지로 Gemini 호출. 실패 시 빈 문자열."""
    for attempt in range(max_retries + 1):
        try:
            response = model.generate_content(
                [prompt, {"mime_type": "image/png", "data": img_bytes}],
                generation_config={"temperature": 0.1, "max_output_tokens": max_tokens},
            )
            text = (response.text or "").strip()
            return text
        except Exception as e:
            err = str(e)
            err_low = err.lower()
            if "limit: 0" in err or "api_key_invalid" in err_low or "api key expired" in err_low:
                print(f"[PDF Extractor] Page {page_idx+1} 즉시 중단(키/quota 0): {err[:150]}")
                break
            if "not found for api version" in err_low or err.startswith("404"):
                print(f"[PDF Extractor] Page {page_idx+1} 모델 미지원: {err[:120]}")
                break
            if "429" in err[:20] or "rate" in err_low or "quota" in err_low:
                wait = 4 * (attempt + 1)
                print(f"[PDF Extractor] Page {page_idx+1} rate limit, {wait}s 대기 후 재시도")
                time.sleep(wait)
                continue
            print(f"[PDF Extractor] Page {page_idx+1} 실패: {err[:150]}")
            break
    return ""


# ---------- 메인 ----------
def pdf_to_markdown(
    file_bytes: bytes,
    dpi: int = 300,
    max_pages: int = 50,
    force_mode: str = "auto",
) -> str:
    """
    PDF 바이트 → Markdown.

    Args:
        force_mode: "auto" (페이지별 자동), "text_only", "hybrid", "full"
    """
    # 캐시
    fhash = _file_hash(file_bytes)
    cache_file = _cache_path(fhash)
    if cache_file.exists():
        print(f"[PDF Extractor] 캐시 히트 ({fhash}) → API 호출 생략")
        return cache_file.read_text(encoding="utf-8")

    doc = fitz.open(stream=file_bytes, filetype="pdf")
    total_pages = len(doc)
    process_pages = min(total_pages, max_pages)

    model = _get_gemini_model()
    has_llm = model is not None

    print(f"[PDF Extractor] {total_pages}페이지 중 {process_pages}페이지 처리 (hash={fhash})")

    parts: list[str] = []
    mode_counts = {"TEXT_ONLY": 0, "HYBRID": 0, "FULL_LLM": 0, "SKIP": 0}
    llm_calls = 0

    for i in range(process_pages):
        page = doc[i]

        # 모드 결정
        if force_mode != "auto":
            mode = force_mode.upper()
        else:
            mode = _classify_page(page)

        # LLM 사용 불가 시 강제 다운그레이드
        if not has_llm and mode in ("HYBRID", "FULL_LLM"):
            mode = "TEXT_ONLY"

        mode_counts[mode] = mode_counts.get(mode, 0) + 1

        if mode == "SKIP":
            print(f"[PDF Extractor] Page {i+1} ⚫ SKIP (빈 페이지)")
            continue

        # RPM 5 한도 대응: LLM 호출 페이지 사이에 13초 sleep
        if mode in ("HYBRID", "FULL_LLM") and llm_calls > 0:
            time.sleep(13)

        if mode == "TEXT_ONLY":
            body = _extract_text_pymupdf(page)
            print(f"[PDF Extractor] Page {i+1} 🟢 TEXT_ONLY (LLM X, {len(body)}자)")
            parts.append(f"\n\n## --- Page {i+1} ---\n\n{body}")

        elif mode == "HYBRID":
            body = _extract_text_pymupdf(page)
            img_bytes = _render_page_to_png(page, dpi=dpi)
            visuals = _gemini_call(model, _VISUALS_ONLY_PROMPT, img_bytes, i, max_tokens=4096)
            llm_calls += 1

            if visuals.upper() == "NONE" or not visuals:
                visuals = ""
            print(f"[PDF Extractor] Page {i+1} 🟡 HYBRID (본문 {len(body)}자, 시각요소 {len(visuals)}자)")
            page_md = f"\n\n## --- Page {i+1} ---\n\n{body}"
            if visuals:
                page_md += f"\n\n### [Page {i+1} 표/그림]\n\n{visuals}"
            parts.append(page_md)

        elif mode == "FULL_LLM":
            img_bytes = _render_page_to_png(page, dpi=dpi)
            full = _gemini_call(model, _FULL_PAGE_PROMPT, img_bytes, i, max_tokens=8192)
            llm_calls += 1

            if not full:
                # 폴백: 부족하나마 PyMuPDF 시도
                full = _extract_text_pymupdf(page)
            print(f"[PDF Extractor] Page {i+1} 🔴 FULL_LLM ({len(full)}자)")
            parts.append(f"\n\n## --- Page {i+1} ---\n\n{full}")

    print(f"[PDF Extractor] 완료. 모드 분포: {mode_counts}, LLM 호출 {llm_calls}회")

    result = "\n".join(parts)
    cache_file.write_text(result, encoding="utf-8")
    print(f"[PDF Extractor] 캐시 저장: {cache_file}")
    return result
