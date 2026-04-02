"""
로컬 파일 저장 서비스.

크롤링된 데이터를 data/crawled/ 아래에 Markdown 파일로 저장하고,
manifest.json 으로 수집 이력을 관리합니다.

DB는 사용하지 않습니다 — 수집 데이터는 모델 학습 전용입니다.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path

from crawler.scaper import CrawlResult

logger = logging.getLogger(__name__)

# 저장 루트: backend/data/crawled/
_DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "crawled"
_MANIFEST_PATH = _DATA_DIR / "manifest.json"


# ---------------------------------------------------------------------------
# 내부 유틸
# ---------------------------------------------------------------------------

def _ensure_dir() -> None:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)


def _url_to_filename(url: str, title: str) -> str:
    """URL 해시 앞 8자리 + 제목 슬러그로 파일명 생성."""
    url_hash = hashlib.md5(url.encode()).hexdigest()[:8]
    slug = re.sub(r"[^\w\-]", "_", title.strip())[:40] if title.strip() else "untitled"
    return f"{url_hash}_{slug}.md"


def _load_manifest() -> dict:
    if _MANIFEST_PATH.exists():
        return json.loads(_MANIFEST_PATH.read_text(encoding="utf-8"))
    return {}


def _save_manifest(manifest: dict) -> None:
    _MANIFEST_PATH.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


# ---------------------------------------------------------------------------
# 저장
# ---------------------------------------------------------------------------

def save_page(result: CrawlResult) -> Path | None:
    """
    CrawlResult 하나를 Markdown 파일로 저장합니다.

    - 실패하거나 내용이 없는 결과는 저장하지 않습니다.
    - 같은 URL이 이미 있으면 덮어씁니다.
    - 반환값: 저장된 파일 경로 (저장 안 하면 None)
    """
    if not result.success or not result.markdown.strip():
        logger.debug("Skipped %s (success=%s)", result.url, result.success)
        return None

    _ensure_dir()

    filename = _url_to_filename(result.url, result.title)
    file_path = _DATA_DIR / filename

    # 파일 저장 (YAML 프론트매터 + 본문)
    content = (
        f"---\n"
        f"url: {result.url}\n"
        f"title: {result.title}\n"
        f"crawled_at: {datetime.now(timezone.utc).isoformat()}\n"
        f"---\n\n"
        f"{result.markdown}"
    )
    file_path.write_text(content, encoding="utf-8")

    # manifest 갱신
    manifest = _load_manifest()
    manifest[result.url] = {
        "filename": filename,
        "title": result.title,
        "crawled_at": datetime.now(timezone.utc).isoformat(),
    }
    _save_manifest(manifest)

    logger.info("Saved → %s", filename)
    return file_path


def save_pages(results: list[CrawlResult]) -> list[Path]:
    """CrawlResult 리스트를 일괄 저장합니다."""
    saved = []
    for result in results:
        path = save_page(result)
        if path:
            saved.append(path)
    logger.info("Saved %d / %d pages to %s", len(saved), len(results), _DATA_DIR)
    return saved


# ---------------------------------------------------------------------------
# 조회
# ---------------------------------------------------------------------------

def list_pages() -> list[dict]:
    """
    수집된 파일 목록을 반환합니다.

    반환 형태:
    [
        {"url": "...", "title": "...", "filename": "...", "crawled_at": "..."},
        ...
    ]
    """
    manifest = _load_manifest()
    return [{"url": url, **info} for url, info in manifest.items()]


def load_page(url: str) -> str | None:
    """URL로 저장된 Markdown 파일의 본문을 읽어옵니다. 없으면 None."""
    manifest = _load_manifest()
    if url not in manifest:
        return None
    file_path = _DATA_DIR / manifest[url]["filename"]
    if not file_path.exists():
        return None
    return file_path.read_text(encoding="utf-8")


def to_documents() -> list[dict]:
    """
    저장된 모든 파일을 LangChain Document 스키마로 반환합니다.
    모델 학습 데이터 준비 시 사용합니다.
    """
    docs = []
    for entry in list_pages():
        content = load_page(entry["url"])
        if content:
            # 프론트매터 제거하고 본문만 추출
            body = content.split("---\n\n", 1)[-1] if "---\n\n" in content else content
            docs.append({
                "page_content": body,
                "metadata": {
                    "source": entry["url"],
                    "title": entry["title"],
                    "crawled_at": entry["crawled_at"],
                },
            })
    return docs
