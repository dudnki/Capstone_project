"""
Web scraper service using Crawl4AI for the RAG dataset generation pipeline.

크롤링은 모델 사전 학습용 데이터를 수집하는 배치 작업입니다.
실시간 처리가 필요 없으므로 순차 실행으로 단순하게 구성합니다.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Optional

from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode
from crawl4ai.extraction_strategy import NoExtractionStrategy
from crawl4ai.markdown_generation_strategy import DefaultMarkdownGenerator

logger = logging.getLogger(__name__)


@dataclass
class CrawlResult:
    url: str
    title: str
    markdown: str
    html: str
    success: bool
    error: Optional[str] = None
    metadata: dict = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Config helpers
# ---------------------------------------------------------------------------

def _browser_config() -> BrowserConfig:
    return BrowserConfig(
        headless=True,
        verbose=False,
    )


def _run_config(bypass_cache: bool = False) -> CrawlerRunConfig:
    return CrawlerRunConfig(
        cache_mode=CacheMode.BYPASS if bypass_cache else CacheMode.ENABLED,
        markdown_generator=DefaultMarkdownGenerator(
            options={
                "ignore_links": False,
                "ignore_images": True,
                "body_width": 0,
            }
        ),
        extraction_strategy=NoExtractionStrategy(),
        word_count_threshold=50,
        exclude_external_links=True,
        remove_overlay_elements=True,
        process_iframes=False,
    )


# ---------------------------------------------------------------------------
# Core crawl functions
# ---------------------------------------------------------------------------

async def crawl_url(
    url: str,
    *,
    bypass_cache: bool = False,
) -> CrawlResult:
    """단일 URL을 크롤링하여 Markdown 텍스트로 반환합니다."""
    browser_cfg = _browser_config()
    run_cfg = _run_config(bypass_cache=bypass_cache)

    async with AsyncWebCrawler(config=browser_cfg) as crawler:
        result = await crawler.arun(url=url, config=run_cfg)

    if not result.success:
        logger.warning("Failed to crawl %s: %s", url, result.error_message)
        return CrawlResult(
            url=url,
            title="",
            markdown="",
            html="",
            success=False,
            error=result.error_message,
        )

    title = result.metadata.get("title", "") if result.metadata else ""

    return CrawlResult(
        url=url,
        title=title,
        markdown=result.markdown.raw_markdown if result.markdown else "",
        html=result.html or "",
        success=True,
        metadata=result.metadata or {},
    )


def crawl_urls(
    urls: list[str],
    *,
    bypass_cache: bool = False,
) -> list[CrawlResult]:
    """
    URL 리스트를 순차적으로 크롤링합니다.

    배치 데이터 수집 목적이므로 동시성 제어 없이 단순 순차 실행합니다.
    실패한 URL은 건너뛰고 나머지를 계속 수집합니다.
    """
    async def _run_all() -> list[CrawlResult]:
        results = []
        for url in urls:
            result = await crawl_url(url, bypass_cache=bypass_cache)
            if not result.success:
                logger.warning("Skipping %s — %s", url, result.error)
            results.append(result)
        return results

    return asyncio.run(_run_all())


# ---------------------------------------------------------------------------
# LangChain Document 형식으로 변환
# ---------------------------------------------------------------------------

def to_documents(results: list[CrawlResult]) -> list[dict]:
    """
    성공한 CrawlResult를 LangChain Document 스키마 호환 딕셔너리로 변환합니다.
    실패하거나 내용이 없는 결과는 자동으로 제외됩니다.
    """
    docs = []
    for r in results:
        if r.success and r.markdown.strip():
            docs.append(
                {
                    "page_content": r.markdown,
                    "metadata": {
                        "source": r.url,
                        "title": r.title,
                        **r.metadata,
                    },
                }
            )
    return docs


# ---------------------------------------------------------------------------
# CLI 스모크 테스트
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys

    test_urls = sys.argv[1:] or ["https://en.wikipedia.org/wiki/Retrieval-augmented_generation"]

    results = crawl_urls(test_urls)
    for r in results:
        status = "OK" if r.success else f"FAIL({r.error})"
        preview = r.markdown[:200].replace("\n", " ") if r.markdown else ""
        print(f"[{status}] {r.url}\n  title  : {r.title}\n  preview: {preview}\n")
