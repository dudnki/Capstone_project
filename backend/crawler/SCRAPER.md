# scaper.py — 웹 크롤러 서비스

---

## 입출력 포맷

### 입력

| 함수 | 입력 | 타입 |
|---|---|---|
| `crawl_url()` | 단일 URL 문자열 | `str` |
| `crawl_urls()` | URL 문자열 리스트 | `list[str]` |

> `crawl_urls()`는 **동기 함수**입니다. 배치 데이터 수집 목적이므로 `asyncio.run()`을 내부에서 처리합니다. 일반 Python 스크립트에서 바로 호출 가능합니다.

### 출력 — `CrawlResult`

```python
@dataclass
class CrawlResult:
    url: str            # 요청한 원본 URL
    title: str          # 페이지 <title> 값
    markdown: str       # 본문 Markdown 텍스트 ← LLM/청킹 입력으로 사용
    html: str           # 원본 HTML
    success: bool       # 성공 여부 — 항상 먼저 확인할 것
    error: str | None   # 실패 시 에러 메시지, 성공 시 None
    metadata: dict      # og:description, keywords 등 메타 정보
```

> **실패해도 예외를 던지지 않습니다.** 항상 `CrawlResult`를 반환하므로 `if result.success` 로 분기하세요.

---

## 다른 모듈과 연결하는 법

### LangChain 청킹으로 넘기기

```python
from services.scaper import crawl_urls, to_documents
from langchain_core.documents import Document
from langchain.text_splitter import RecursiveCharacterTextSplitter

results = await crawl_urls(urls)
raw_docs = [Document(**d) for d in to_documents(results)]  # 실패한 URL 자동 제외

splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
chunks = splitter.split_documents(raw_docs)
# → Ragas TestsetGenerator에 바로 입력 가능
```

### `to_documents()` 반환 형태

```python
# LangChain Document 스키마와 호환
[
    {
        "page_content": "# 제목\n\n본문 Markdown...",
        "metadata": {
            "source": "https://...",
            "title": "페이지 제목",
            # og:description, keywords 등
        }
    },
    ...
]
```

## 주요 파라미터

| 파라미터 | 기본값 | 설명 |
|---|---|---|
| `bypass_cache` | `False` | `True`로 설정하면 캐시 무시하고 재크롤 |

---

## 전체 파이프라인에서의 위치

```
[scaper.py]             ← 지금 여기
    ↓  CrawlResult 리스트
[to_documents()]
    ↓  LangChain Document 리스트
[LangChain TextSplitter]
    ↓  청크(Chunk) 리스트
[Ragas TestsetGenerator]
    ↓  (질문, 모범답안, 근거) 세트
[Quality Filter (Ragas 지표)]
    ↓  고품질 Q&A 데이터셋
[FastAPI → Next.js 대시보드]
```

---
---

## 코드 내부 상세 설명

### 전체 구조 한눈에 보기

```
scaper.py
│
├── CrawlResult          ← 크롤링 결과를 담는 데이터 클래스
│
├── _browser_config()    ← Playwright 브라우저 설정 (내부용)
├── _run_config()        ← 크롤링 동작 방식 설정 (내부용)
│
├── crawl_url()          ← 단일 URL 크롤링 (핵심 함수)
├── crawl_urls()         ← 다수 URL 동시 크롤링 (배치 처리)
│
└── to_documents()       ← LangChain Document 형식으로 변환
```

---

### 의존성

| 패키지 | 역할 |
|---|---|
| `crawl4ai` | Playwright 기반 비동기 웹 크롤러 |
| `asyncio` | 비동기 동시 실행 제어 (세마포어) |
| `dataclasses` | 결과 구조체 정의 |

설치 방법:
```bash
uv add crawl4ai
crawl4ai-setup   # Playwright 브라우저 바이너리 다운로드
```

---

### 1. `CrawlResult` — 크롤링 결과 구조체

```python
@dataclass
class CrawlResult:
    url: str
    title: str
    markdown: str
    html: str
    success: bool
    error: Optional[str] = None
    metadata: dict = field(default_factory=dict)
```

크롤링 성공/실패 여부와 무관하게 **항상 이 구조체를 반환**합니다.
호출부에서 `if result.success` 한 줄로 처리 흐름을 분기할 수 있습니다.

| 필드 | 타입 | 설명 |
|---|---|---|
| `url` | `str` | 요청한 원본 URL |
| `title` | `str` | 페이지 `<title>` 태그 값 |
| `markdown` | `str` | HTML을 변환한 Markdown 텍스트 (LLM 입력용) |
| `html` | `str` | 원본 HTML (필요 시 재파싱 가능) |
| `success` | `bool` | 크롤링 성공 여부 |
| `error` | `str \| None` | 실패 시 에러 메시지, 성공 시 `None` |
| `metadata` | `dict` | `og:description`, `keywords` 등 메타 정보 |

---

### 2. `_browser_config()` — 브라우저 설정

```python
def _browser_config() -> BrowserConfig:
    return BrowserConfig(
        headless=True,   # 화면 없이 백그라운드 실행
        verbose=False,   # 불필요한 Playwright 로그 제거
    )
```

- Crawl4AI는 내부적으로 **Playwright**(Chromium)를 사용합니다.
- `headless=True`로 서버 환경(WSL2, Docker 등)에서도 문제없이 동작합니다.
- JavaScript로 렌더링되는 동적 페이지(React, Vue 등)도 크롤링 가능합니다.
- `verbose=False`는 Playwright가 출력하는 브라우저 내부 로그를 억제합니다. 디버깅 시에는 `True`로 바꾸면 더 많은 정보를 볼 수 있습니다.

---

### 3. `_run_config()` — 크롤링 동작 설정

```python
def _run_config(bypass_cache: bool = False) -> CrawlerRunConfig:
    return CrawlerRunConfig(
        cache_mode=CacheMode.BYPASS if bypass_cache else CacheMode.ENABLED,
        markdown_generator=DefaultMarkdownGenerator(
            options={
                "ignore_links": False,   # 링크 텍스트 유지
                "ignore_images": True,   # 이미지 alt 텍스트 제거
                "body_width": 0,         # 줄바꿈 없음 → 청크 품질 향상
            }
        ),
        extraction_strategy=NoExtractionStrategy(),
        word_count_threshold=50,         # 50단어 미만 페이지 스킵
        exclude_external_links=True,     # 외부 링크 제거
        remove_overlay_elements=True,    # 팝업·배너 제거
        process_iframes=False,           # iframe 내용 무시
    )
```

각 옵션의 설계 의도:

| 옵션 | 값 | 이유 |
|---|---|---|
| `cache_mode` | `ENABLED` (기본) | 동일 URL 재크롤 시 캐시 재사용 → LLM API 비용 절감 |
| `ignore_images` | `True` | 이미지 alt 텍스트는 RAG 품질에 기여하지 않음 |
| `body_width: 0` | `0` | 강제 줄바꿈 제거 → LangChain 청크 경계가 자연스러워짐 |
| `word_count_threshold` | `50` | 에러 페이지, 리다이렉트 페이지 등 노이즈 자동 제거 |
| `exclude_external_links` | `True` | 본문 흐름과 무관한 외부 링크 노이즈 제거 |
| `remove_overlay_elements` | `True` | 쿠키 동의창, 광고 팝업 등 제거 |
| `NoExtractionStrategy` | — | JSON 구조 추출 없이 전체 Markdown 텍스트만 사용 |
| `process_iframes` | `False` | iframe 내부 콘텐츠는 본문과 맥락이 달라 노이즈가 됨 |

`bypass_cache=True` 사용 시기:
- 페이지 내용이 자주 바뀌는 뉴스, 블로그 등을 재수집할 때
- 캐시된 데이터가 최신이 아닐 수 있다고 판단될 때

---

### 4. `crawl_url()` — 단일 URL 크롤링

```python
async def crawl_url(url: str, *, bypass_cache: bool = False) -> CrawlResult:
    """Crawl a single URL and return its markdown content."""
```

**동작 흐름:**

```
1. BrowserConfig, CrawlerRunConfig 생성
        ↓
2. AsyncWebCrawler 컨텍스트 열기 (Playwright 브라우저 실행)
        ↓
3. crawler.arun(url) 호출 → JS 렌더링 완료 후 HTML 수집
        ↓
4. 성공 여부 확인
   ├─ 실패 → success=False, error 메시지 담아서 반환 (예외 없음)
   └─ 성공 → markdown, title, metadata 추출하여 CrawlResult 반환
```

- `async with AsyncWebCrawler(...)` 구문은 크롤링이 끝나면 브라우저를 자동으로 종료합니다.
- `result.markdown.raw_markdown`을 사용하는 이유: Crawl4AI는 마크다운을 여러 단계(raw → fit → links)로 제공하는데, `raw_markdown`이 원본에 가장 가깝고 청킹 전처리에 적합합니다.

**사용 예시:**

```python
result = await crawl_url("https://arxiv.org/abs/2005.11401")

if result.success:
    print(result.title)
    print(result.markdown[:500])
else:
    print(f"크롤링 실패: {result.error}")
```

---

### 5. `crawl_urls()` — 다수 URL 순차 크롤링

```python
def crawl_urls(
    urls: list[str],
    *,
    bypass_cache: bool = False,
) -> list[CrawlResult]:
```

배치 데이터 수집 목적이므로 동시성 제어 없이 **순차 실행**합니다.

**동작 흐름:**

```
URLs: [A, B, C, D, E]
        ↓
    asyncio.run(_run_all())   ← 내부에서 이벤트 루프 처리
        ↓
    A 크롤링 완료 → B 크롤링 완료 → C ... (순차)
    실패한 URL은 warning 로그 후 건너뜀
        ↓
    결과 리스트 반환 (입력 순서 유지)
```

- `asyncio.run()`을 내부에서 처리하므로 **동기 함수처럼 바로 호출 가능**합니다.
- 실패한 URL은 `success=False`로 결과에 포함되며 수집을 중단하지 않습니다.

**사용 예시:**

```python
urls = [
    "https://arxiv.org/abs/2005.11401",
    "https://arxiv.org/abs/2302.12345",
    "https://arxiv.org/abs/2310.00000",
]

results = crawl_urls(urls)   # async/await 불필요

success_count = sum(1 for r in results if r.success)
print(f"{success_count}/{len(results)} 페이지 수집 성공")
```

---

### 6. `to_documents()` — LangChain Document 형식 변환

```python
def to_documents(results: list[CrawlResult]) -> list[dict]:
    """
    Convert successful CrawlResult list to a list of dicts compatible with
    LangChain's Document schema (page_content + metadata).
    """
```

- `success=False`이거나 내용이 비어있는 결과는 자동으로 제외됩니다.
- `**r.metadata`로 Crawl4AI가 수집한 모든 메타 정보(`og:description`, `keywords` 등)를 그대로 LangChain Document의 metadata에 포함시킵니다.
- 반환된 딕셔너리를 `langchain_core.documents.Document(**doc)` 으로 바로 변환 가능합니다.

**파이프라인 연결 전체 예시:**

```python
from langchain_core.documents import Document
from langchain.text_splitter import RecursiveCharacterTextSplitter

# 1. 크롤링
results = await crawl_urls(urls)

# 2. LangChain Document로 변환
raw_docs = [Document(**d) for d in to_documents(results)]

# 3. 청킹 (Ragas TestsetGenerator 입력 준비)
splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
chunks = splitter.split_documents(raw_docs)
```

---

### 7. CLI 스모크 테스트

```python
if __name__ == "__main__":
    ...
```

파일을 직접 실행하면 동작을 빠르게 확인할 수 있습니다.

```bash
# 기본 테스트 URL (RAG Wikipedia)
python scaper.py

# 직접 URL 지정
python scaper.py https://arxiv.org/abs/2005.11401 https://huggingface.co/docs

# 출력 예시
[OK] https://arxiv.org/abs/2005.11401
  title  : [2005.11401] Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks
  preview: # Retrieval-Augmented Generation for ...
```

---

### 8. 자주 발생하는 오류 및 해결 방법

| 오류 | 원인 | 해결 방법 |
|---|---|---|
| `playwright._impl._errors.Error: Executable doesn't exist` | Playwright 브라우저 미설치 | `crawl4ai-setup` 또는 `playwright install chromium` 실행 |
| `word_count_threshold` 초과로 빈 결과 | 페이지 본문이 너무 짧음 | `_run_config()`에서 임계값 낮추기 (`word_count_threshold=10`) |
| 특정 사이트에서 계속 실패 | JavaScript 렌더링 대기 시간 부족 | `CrawlerRunConfig`에 `wait_for` 또는 `page_timeout` 옵션 추가 |
| 동시 요청 차단 (429 에러) | 사이트의 rate-limit | `max_concurrent=1` 로 줄이고 `asyncio.sleep()` 추가 고려 |
