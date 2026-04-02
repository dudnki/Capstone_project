"""
DART(전자공시시스템) Open API 클라이언트.

수집 흐름:
    1. search_corp()     - 회사명으로 기업 고유코드 검색
    2. get_filings()     - 기업/기간/보고서 유형별 공시 목록 조회
    3. get_document()    - 접수번호로 원본 문서 다운로드 → 텍스트 추출
    4. collect()         - 단일 회사 수집 + 로컬 저장
    5. collect_all()     - 전체 상장사 일괄 수집 (중단 후 재개 가능)

API 키 발급: https://opendart.fss.or.kr → 개발자 센터 → API 신청
.env 파일에 DART_API_KEY=발급받은키 로 저장하세요.
"""

from __future__ import annotations

import io
import json
import logging
import os
import re
import time
import zipfile
from dataclasses import dataclass
from pathlib import Path

import httpx
from bs4 import BeautifulSoup
from dotenv import load_dotenv

from crawler.scaper import CrawlResult
from crawler.storage import save_pages

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

logger = logging.getLogger(__name__)

_BASE_URL = "https://opendart.fss.or.kr/api"
_DATA_DIR  = Path(__file__).resolve().parents[1] / "data"

# 기업 코드 캐시: [{corp_code, corp_name, stock_code}, ...]
_CORP_CODE_CACHE = _DATA_DIR / "dart_corp_codes.json"

# 전체 수집 진행 상황: {completed: [...], failed: [...]}
_PROGRESS_FILE = _DATA_DIR / "dart_progress.json"

REPORT_TYPES = {
    "사업보고서": "A001",
    "반기보고서": "A002",
    "분기보고서": "A003",
    "감사보고서": "F001",
}


# ---------------------------------------------------------------------------
# 데이터 구조
# ---------------------------------------------------------------------------

@dataclass
class DartFiling:
    """DART 공시 하나의 메타 정보."""
    rcept_no: str       # 접수번호 (문서 다운로드 키)
    corp_name: str      # 회사명
    report_nm: str      # 보고서명
    rcept_dt: str       # 접수일자 (YYYYMMDD)
    corp_code: str      # 기업 고유코드


# ---------------------------------------------------------------------------
# 기업 코드 관리
# ---------------------------------------------------------------------------

def _fetch_corp_codes(api_key: str) -> list[dict]:
    """DART에서 전체 기업 코드 목록을 다운로드합니다."""
    logger.info("DART에서 기업 코드 목록 다운로드 중...")
    resp = httpx.get(
        f"{_BASE_URL}/corpCode.xml",
        params={"crtfc_key": api_key},
        timeout=30,
    )
    resp.raise_for_status()

    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
        xml_content = zf.read("CORPCODE.xml").decode("utf-8")

    soup = BeautifulSoup(xml_content, "lxml-xml")
    corps = [
        {
            "corp_code":  tag.find("corp_code").text,
            "corp_name":  tag.find("corp_name").text,
            "stock_code": tag.find("stock_code").text.strip() if tag.find("stock_code") else "",
        }
        for tag in soup.find_all("list")
        if tag.find("corp_code") and tag.find("corp_name")
    ]
    logger.info("총 %d개 기업 로드 완료", len(corps))
    return corps


def _load_corp_codes(api_key: str) -> list[dict]:
    """캐시가 있으면 읽고, 없으면 DART에서 새로 다운로드."""
    if _CORP_CODE_CACHE.exists():
        return json.loads(_CORP_CODE_CACHE.read_text(encoding="utf-8"))

    corps = _fetch_corp_codes(api_key)
    _CORP_CODE_CACHE.parent.mkdir(parents=True, exist_ok=True)
    _CORP_CODE_CACHE.write_text(
        json.dumps(corps, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return corps


def get_listed_corps(api_key: str | None = None) -> list[dict]:
    """
    주식 코드가 있는 상장사만 반환합니다.

    반환 형태:
        [{"corp_code": "00126380", "corp_name": "삼성전자", "stock_code": "005930"}, ...]
    """
    key = api_key or os.environ.get("DART_API_KEY", "")
    if not key:
        raise ValueError("DART_API_KEY가 설정되지 않았습니다.")

    corps = _load_corp_codes(key)
    listed = [c for c in corps if c.get("stock_code")]
    logger.info("상장사: %d개", len(listed))
    return listed


def search_corp(company_name: str, api_key: str | None = None) -> str | None:
    """
    회사명으로 DART 기업 고유코드를 반환합니다.

    반환값: corp_code 문자열 (없으면 None)

    사용 예:
        corp_code = search_corp("삼성전자")
    """
    key = api_key or os.environ.get("DART_API_KEY", "")
    if not key:
        raise ValueError("DART_API_KEY가 설정되지 않았습니다.")

    corps = _load_corp_codes(key)

    # 완전 일치
    for c in corps:
        if c["corp_name"] == company_name:
            return c["corp_code"]

    # 부분 일치
    matches = [c for c in corps if company_name in c["corp_name"]]
    if matches:
        logger.info("부분 일치: '%s' → '%s'", company_name, matches[0]["corp_name"])
        return matches[0]["corp_code"]

    logger.warning("기업을 찾을 수 없습니다: %s", company_name)
    return None


# ---------------------------------------------------------------------------
# 공시 목록 조회
# ---------------------------------------------------------------------------

def get_filings(
    corp_code: str,
    start_date: str,
    end_date: str,
    report_type: str = "사업보고서",
    api_key: str | None = None,
) -> list[DartFiling]:
    """
    공시 목록을 조회합니다.

    Args:
        corp_code:   기업 고유코드 (search_corp()로 조회)
        start_date:  조회 시작일 (YYYYMMDD)
        end_date:    조회 종료일 (YYYYMMDD)
        report_type: "사업보고서" | "반기보고서" | "분기보고서" | "감사보고서"
    """
    key = api_key or os.environ.get("DART_API_KEY", "")
    if not key:
        raise ValueError("DART_API_KEY가 설정되지 않았습니다.")

    resp = httpx.get(
        f"{_BASE_URL}/list.json",
        params={
            "crtfc_key": key,
            "corp_code": corp_code,
            "bgn_de": start_date,
            "end_de": end_date,
            "pblntf_detail_ty": REPORT_TYPES.get(report_type, "A001"),
            "page_count": 100,
        },
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()

    if data.get("status") != "000":
        return []

    return [
        DartFiling(
            rcept_no=item["rcept_no"],
            corp_name=item["corp_name"],
            report_nm=item["report_nm"],
            rcept_dt=item["rcept_dt"],
            corp_code=item["corp_code"],
        )
        for item in data.get("list", [])
    ]


# ---------------------------------------------------------------------------
# 문서 다운로드 & 텍스트 추출
# ---------------------------------------------------------------------------

def get_document(filing: DartFiling, api_key: str | None = None) -> CrawlResult:
    """공시 원본 문서를 다운로드하여 텍스트를 추출합니다."""
    key = api_key or os.environ.get("DART_API_KEY", "")
    url = f"https://dart.fss.or.kr/dsaf001/main.do?rcpNo={filing.rcept_no}"

    try:
        resp = httpx.get(
            f"{_BASE_URL}/document.xml",
            params={"crtfc_key": key, "rcept_no": filing.rcept_no},
            timeout=60,
        )
        resp.raise_for_status()

        markdown = _extract_text_from_zip(resp.content)

        if not markdown.strip():
            return CrawlResult(url=url, title="", markdown="", html="", success=False,
                               error="텍스트 추출 실패")

        return CrawlResult(
            url=url,
            title=f"[{filing.corp_name}] {filing.report_nm} ({filing.rcept_dt})",
            markdown=markdown,
            html="",
            success=True,
            metadata={
                "corp_name": filing.corp_name,
                "report_nm": filing.report_nm,
                "rcept_dt":  filing.rcept_dt,
                "rcept_no":  filing.rcept_no,
                "corp_code": filing.corp_code,
            },
        )

    except Exception as e:
        logger.error("문서 다운로드 실패 %s: %s", filing.rcept_no, e)
        return CrawlResult(url=url, title="", markdown="", html="", success=False, error=str(e))


def _extract_text_from_zip(zip_bytes: bytes) -> str:
    """
    ZIP 파일에서 문서 파일들을 찾아 텍스트를 추출합니다.

    DART 문서는 HTML(.html/.htm) 또는 DART 전용 XML(.xml) 형식입니다.
    - 메인 문서(접수번호.xml)를 우선 처리합니다.
    - 서브 문서(접수번호_번호.xml)는 감사보고서 등 첨부 파일입니다.
    """
    texts = []

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        all_names = [n for n in zf.namelist() if not n.startswith("__MACOSX")]

        # HTML 파일 처리 (구형 문서)
        html_files = sorted(n for n in all_names if n.lower().endswith((".html", ".htm")))
        # XML 파일 처리 (신형 DART XML 문서) — 메인 파일을 첫 번째로
        xml_files  = sorted(n for n in all_names if n.lower().endswith(".xml"))

        target_files = html_files if html_files else xml_files

        for filename in target_files:
            raw = zf.read(filename)
            for encoding in ("utf-8", "euc-kr", "cp949"):
                try:
                    content = raw.decode(encoding)
                    break
                except UnicodeDecodeError:
                    continue
            else:
                continue

            text = _dart_xml_to_text(content) if filename.endswith(".xml") else _html_to_text(content)
            if text.strip():
                texts.append(text)

    return "\n\n---\n\n".join(texts)


def _dart_xml_to_text(xml: str) -> str:
    """
    DART 전용 XML(dart3.xsd)에서 본문 텍스트를 추출합니다.

    DART XML 주요 태그:
      <P>           - 문단
      <TD>, <TU>    - 표 셀
      <SECTION-1~4> - 섹션 제목 (목차 구조)
      <COVER-TITLE> - 문서 제목
    """
    soup = BeautifulSoup(xml, "lxml-xml")

    lines = []

    for tag in soup.find_all(True):
        name = tag.name or ""
        text = tag.get_text(separator=" ", strip=True)
        if not text or len(text) < 2:
            continue

        # 자식 태그가 있으면 중복 추출되므로 리프 노드에 가까운 것만 처리
        if tag.find(True) is not None:
            continue

        if "COVER-TITLE" in name or "SECTION-1" in name:
            lines.append(f"# {text}")
        elif "SECTION-2" in name:
            lines.append(f"## {text}")
        elif "SECTION-3" in name or "SECTION-4" in name:
            lines.append(f"### {text}")
        else:
            lines.append(text)

    text = "\n".join(lines)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _html_to_text(html: str) -> str:
    """HTML을 Markdown 형식 텍스트로 변환합니다."""
    soup = BeautifulSoup(html, "lxml")

    for tag in soup(["script", "style", "head"]):
        tag.decompose()

    lines = []
    for tag in soup.find_all(["h1", "h2", "h3", "h4", "p", "td", "th", "li"]):
        text = tag.get_text(separator=" ", strip=True)
        if not text:
            continue
        if tag.name == "h1":
            lines.append(f"# {text}")
        elif tag.name == "h2":
            lines.append(f"## {text}")
        elif tag.name in ("h3", "h4"):
            lines.append(f"### {text}")
        elif tag.name == "li":
            lines.append(f"- {text}")
        else:
            lines.append(text)

    text = "\n".join(lines)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


# ---------------------------------------------------------------------------
# 진행 상황 관리
# ---------------------------------------------------------------------------

def _load_progress() -> dict:
    if _PROGRESS_FILE.exists():
        return json.loads(_PROGRESS_FILE.read_text(encoding="utf-8"))
    return {"completed": [], "failed": []}


def _save_progress(progress: dict) -> None:
    _PROGRESS_FILE.parent.mkdir(parents=True, exist_ok=True)
    _PROGRESS_FILE.write_text(
        json.dumps(progress, ensure_ascii=False, indent=2), encoding="utf-8"
    )


# ---------------------------------------------------------------------------
# 수집 파이프라인
# ---------------------------------------------------------------------------

def collect(
    company_name: str,
    start_date: str,
    end_date: str,
    report_type: str = "사업보고서",
    api_key: str | None = None,
) -> list[Path]:
    """
    단일 회사의 공시 문서를 수집하고 로컬에 저장합니다.

    사용 예:
        collect("삼성전자", "20230101", "20231231")
        collect("카카오", "20220101", "20231231", report_type="반기보고서")
    """
    key = api_key or os.environ.get("DART_API_KEY", "")
    if not key:
        raise ValueError("DART_API_KEY가 설정되지 않았습니다.")

    corp_code = search_corp(company_name, key)
    if not corp_code:
        raise ValueError(f"'{company_name}' 기업을 찾을 수 없습니다.")

    filings = get_filings(corp_code, start_date, end_date, report_type, key)
    if not filings:
        logger.warning("%s: 해당 기간 공시 없음", company_name)
        return []

    results = []
    for filing in filings:
        logger.info("다운로드: %s %s", filing.corp_name, filing.report_nm)
        results.append(get_document(filing, key))
        time.sleep(0.5)  # API rate limit 방지

    return save_pages(results)


def collect_all(
    start_date: str,
    end_date: str,
    report_type: str = "사업보고서",
    api_key: str | None = None,
) -> None:
    """
    전체 상장사의 공시 문서를 순차 수집합니다.

    - 중단 후 재실행하면 이미 완료된 기업은 건너뜁니다.
    - 진행 상황: backend/data/dart_progress.json
    - 수집 파일: backend/data/crawled/

    사용 예:
        collect_all("20230101", "20231231")
        collect_all("20210101", "20231231", report_type="사업보고서")
    """
    key = api_key or os.environ.get("DART_API_KEY", "")
    if not key:
        raise ValueError("DART_API_KEY가 설정되지 않았습니다.")

    listed = get_listed_corps(key)
    progress = _load_progress()
    completed = set(progress["completed"])

    remaining = [c for c in listed if c["corp_code"] not in completed]
    total = len(listed)
    done  = len(completed)

    logger.info("전체 상장사: %d개 | 완료: %d개 | 남은: %d개", total, done, len(remaining))

    for corp in remaining:
        corp_code = corp["corp_code"]
        corp_name = corp["corp_name"]
        done += 1

        logger.info("[%d/%d] %s 수집 중...", done, total, corp_name)

        try:
            filings = get_filings(corp_code, start_date, end_date, report_type, key)

            if not filings:
                logger.info("  → 공시 없음, 건너뜀")
                progress["completed"].append(corp_code)
                _save_progress(progress)
                continue

            results = []
            for filing in filings:
                results.append(get_document(filing, key))
                time.sleep(0.5)  # 문서 간 요청 간격

            saved = save_pages(results)
            logger.info("  → %d개 파일 저장", len(saved))

            progress["completed"].append(corp_code)

        except Exception as e:
            logger.error("  → 실패: %s", e)
            progress["failed"].append({"corp_code": corp_code, "corp_name": corp_name, "error": str(e)})

        _save_progress(progress)
        time.sleep(1)  # 기업 간 요청 간격

    logger.info("수집 완료. 성공: %d, 실패: %d", len(progress["completed"]), len(progress["failed"]))


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    mode = sys.argv[1] if len(sys.argv) > 1 else "single"

    if mode == "all":
        # 전체 상장사 수집
        # python dart.py all 20230101 20231231
        start = sys.argv[2] if len(sys.argv) > 2 else "20230101"
        end   = sys.argv[3] if len(sys.argv) > 3 else "20231231"
        collect_all(start, end)

    else:
        # 단일 회사 수집
        # python dart.py 삼성전자 20230101 20231231
        company = sys.argv[1] if len(sys.argv) > 1 else "삼성전자"
        start   = sys.argv[2] if len(sys.argv) > 2 else "20230101"
        end     = sys.argv[3] if len(sys.argv) > 3 else "20231231"

        saved = collect(company, start, end)
        print(f"\n저장 완료: {len(saved)}개 파일")
        for p in saved:
            print(f"  {p.name}")
