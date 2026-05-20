# RAG Evaluation Pipeline

문서를 입력하면 LLM 에이전트가 검증된 평가용 Q&A 셋을 만들고, 사용자가 제출한 답변을 RAGAS 기반 지표로 채점하는 RAG 평가 파이프라인입니다. 사내 LLM이나 모델 엔드포인트의 도메인 적합성을 정량적으로 확인하기 위한 목적으로 만들어졌습니다.

졸업 캡스톤 프로젝트로 진행 중이며, 백엔드는 FastAPI, 프론트엔드는 Next.js로 구현되어 있습니다.


## 주요 기능

- **문서 자동 분류 및 도메인 키워드 추출**
  `BAAI/bge-m3` 임베딩으로 문서를 6개 도메인(기술논문 / 사업보고서 / 약관 / 매뉴얼 / 법률문서 / 일반)으로 분류하고, KeyBERT와 도메인 사전의 차집합으로 희귀 토큰을 뽑아 질문 생성에 힌트로 사용합니다.

- **두 가지 Q&A 생성 파이프라인**
  - `G-Eval` 파이프라인: 청크별로 후보 N개를 생성한 뒤, G-Eval 5개 기준(relevance / answerability / clarity / specificity / difficulty)으로 채점해 top-K만 통과시키는 결정론적 방식입니다.
  - `Agentic` 파이프라인: OpenAI tool calling으로 LLM 에이전트가 MMR 청크 선택, Bloom 유형 결정, 멀티 청크 결합, 재시도까지 직접 수행합니다. 평가는 logprob 기반 G-Eval critic으로 수행하고, 통과한 후보 중 top-1을 선택합니다.

- **PDF 어댑티브 추출**
  페이지 단위로 텍스트 비중을 분석해 PyMuPDF만 쓸지(text-only), 표/그림에만 Gemini Vision을 쓸지(hybrid), 전체를 Vision으로 인식할지(full-LLM) 자동 결정합니다. 캐시가 있어 같은 PDF는 두 번째부터 LLM 호출 없이 즉시 추출합니다.

- **RAGAS 기반 모델/사용자 채점**
  업로드된 답변 CSV를 받아 `Faithfulness`, `Answer Relevancy`, `Answer Correctness`, `Similarity` 4지표로 채점합니다. RAGAS 1차 결과가 0이거나 비정상일 때를 대비해 LLM judge 폴백(키워드+개념 앙상블)을 두어 점수 신뢰도를 보강했습니다.

- **문항별/전체 학습 피드백 자동 생성**
  점수 외에 모범 답안 대비 강·약점, 개선 포인트, 학습 조언을 LLM이 생성해 결과 화면에 함께 표시합니다.


## 기술 스택

**Backend**
- Python 3.13, FastAPI, SQLAlchemy (SQLite, 로컬 단일 파일)
- OpenAI (`gpt-4o-mini`), Groq (`llama-3.3-70b-versatile`), Google Gemini (`gemini-3.1-flash-lite`)
- RAGAS, LangChain, sentence-transformers (`bge-m3`, `paraphrase-multilingual-MiniLM-L12-v2`), KeyBERT
- PyMuPDF, pymupdf4llm, instructor (Pydantic 구조화)
- 패키지 매니저: `uv`

**Frontend**
- Next.js 16 (App Router, Turbopack), React 19, TypeScript 5.9
- Tailwind CSS v4

**Infra (legacy)**
- 초기 버전은 Supabase + pgvector를 사용했으나, 로컬 단일 실행 편의성을 위해 SQLite + 로컬 파일 스토리지로 마이그레이션했습니다. `database/schema.sql`은 PostgreSQL 시절 스키마의 참고용입니다.


## 시스템 구조

```
[Next.js 16]  ──upload──▶  /api/upload         ──▶  uploaded_pdf/{uuid}.pdf
     │                                                       │
     │       ┌──────────── 파이프라인 선택 ────────────┐      │
     │       ▼                                        ▼      ▼
     │   /api/pipeline/run                /api/pipeline/run_agentic
     │       │  ① PDF→Markdown 추출 (PyMuPDF + Gemini Vision, 캐시)
     │       │  ② 문서 분류 (bge-m3) + Rare token (KeyBERT)
     │       │  ③ 청크 분할 (LangChain RecursiveCharacterTextSplitter)
     │       │  ④-A G-Eval: N개 후보 → G-Eval 채점 → top-K 선별
     │       │  ④-B Agentic: tool-calling agent → critic(logprob G-Eval) → top-1
     │       ▼
     │   SQLite (documents / chunks / qa_evaluations)
     │
     └── 사용자 답변 CSV ─────▶ /api/evaluations/submit
                                   ① RAGAS 4지표 평가
                                   ② LLM judge 폴백
                                   ③ 문항별/전체 피드백 생성
```


## 폴더 구조

```
.
├── backend/
│   ├── app/
│   │   ├── main.py                # FastAPI 진입점, CORS, 라우터 조립
│   │   ├── routers/
│   │   │   ├── upload.py          # POST /api/upload
│   │   │   ├── pipeline.py        # POST /api/pipeline/run, /run_agentic
│   │   │   └── evaluations.py     # POST /api/evaluations/submit
│   │   └── services/
│   │       ├── database.py        # SQLAlchemy 모델 (documents/chunks/qa_evaluations)
│   │       ├── pdf_extractor.py   # PDF 어댑티브 추출 (PyMuPDF + Gemini Vision + 캐시)
│   │       ├── document_analyzer.py  # bge-m3 분류 + KeyBERT 키워드 + MMR 청크 선택
│   │       ├── domain_keywords.py # 도메인 사전 (희귀 토큰 차집합용)
│   │       ├── qa_generator.py    # 단일/멀티 청크 Q&A 생성
│   │       ├── qa_agent.py        # OpenAI tool-calling 기반 Agentic 파이프라인
│   │       ├── qa_critic.py       # G-Eval logprob critic (Liu et al., 2023)
│   │       ├── geval_filter.py    # G-Eval 결정론적 필터 (5개 기준 가중합)
│   │       └── ragas_eval.py      # RAGAS 4지표 + LLM judge 폴백 + 피드백 생성
│   ├── uploaded_pdf/              # 업로드된 원본 파일 (gitignore)
│   ├── capstone.db                # SQLite 로컬 DB (gitignore)
│   └── .cache/pdf_extracts/       # PDF 추출 결과 캐시 (gitignore)
│
├── frontend/
│   ├── app/
│   │   ├── page.tsx               # 메인 페이지 (테스트셋 생성 / 평가)
│   │   └── layout.tsx
│   ├── components/
│   │   ├── DatasetManager.tsx     # 문서 업로드 + Q&A 미리보기 + CSV 다운로드
│   │   ├── EvaluationResult.tsx   # RAGAS 점수 + 문항별 피드백
│   │   ├── ReviewManager.tsx
│   │   ├── Header.tsx
│   │   └── Sidebar.tsx
│   └── src/types.ts
│
└── database/
    └── schema.sql                 # 초기 Supabase + pgvector 스키마 (참고용)
```


## 시작하기

### 사전 준비

- Python 3.13 이상
- Node.js 20 이상 (Next.js 16 요구사항)
- `uv` (https://docs.astral.sh/uv/)
- API 키: OpenAI, Groq, Google Gemini

### 백엔드

```bash
cd backend

# 가상환경 생성 및 의존성 설치
uv sync

# .env 파일 작성 (아래 키 필요)
cat > .env <<'EOF'
OPENAI_API_KEY=sk-...
GROQ_API_KEY=gsk_...
GEMINI_API_KEY=...
USE_KEYWORD_LLM=gemini-3.1-flash-lite-preview
EOF

# 서버 실행 (프론트엔드가 8001 포트를 호출하므로 포트 고정)
uv run uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload
```

처음 실행 시 `BAAI/bge-m3` (~2.3GB)와 `paraphrase-multilingual-MiniLM-L12-v2` 모델이 자동 다운로드됩니다. 모델 로딩에 10~30초 정도 걸릴 수 있습니다.

서버 헬스 체크:

```bash
curl http://127.0.0.1:8001/
# → {"message":"RAG Evaluation Backend is running!"}
```

### 프론트엔드

```bash
cd frontend
npm install
npm run dev
```

기본 포트는 `http://localhost:3000`이고, 백엔드 주소는 `frontend/app/page.tsx`의 `BASE_URL` 상수에 `http://localhost:8001`로 하드코딩되어 있습니다.


## API

| Method | Path | 설명 |
|---|---|---|
| `GET`  | `/`                          | 헬스 체크 |
| `POST` | `/api/upload`                | 문서(PDF/TXT/MD) 업로드. UUID로 안전 파일명 변환 후 `uploaded_pdf/`에 저장 |
| `POST` | `/api/pipeline/run`          | G-Eval 파이프라인 실행 (후보 생성 → 채점 → top-K) |
| `POST` | `/api/pipeline/run_agentic`  | Agentic 파이프라인 실행 (tool-calling agent + logprob critic) |
| `POST` | `/api/evaluations/submit`    | 사용자 답변 CSV 제출 → RAGAS 채점 + 피드백 |

자세한 요청/응답 스키마는 백엔드 실행 후 `http://127.0.0.1:8001/docs` (FastAPI 자동 생성)에서 확인할 수 있습니다.


## 데이터 흐름 (예시)

업로드한 PDF가 기술논문으로 분류된 경우의 로그 예시:

```
[Classify] '문서.pdf' → 기술논문
[Classify] similarities: {'기술논문': 0.399, '매뉴얼': 0.346, ...}
[RareTokens] ['LoRA', 'SVD', 'PEFT', ...]
[Chunking] 총 19개 청크 생성
[Agent] iter=1 → inspect_document_stats
[Agent] iter=2 → select_chunks_mmr(n=4, lambda=0.7)
[Agent] iter=3 → preview_chunks([16, 2, 9, 0])
[Agent] iter=4 → generate_qa_single(chunk_idx=9, bloom="적용")
  [Q&A] 라운드 1: 하드필터 통과 2/3
  [Q&A] 후보 1 PASS avg=4.33 weighted=4.47 (ground=4.84 bloom=4.88 ...)
[Agent] iter=5 → generate_qa_multi(chunk_indices=[16, 18], bloom="비교")
[Agent] iter=6 → finalize
```


## 팀원

| 이름 | 역할 | GitHub |
|---|---|---|
|  |  |  |
|  |  |  |
|  |  |  |
|  |  |  |


## 라이선스

본 저장소는 학부 캡스톤 프로젝트 결과물이며 별도 라이선스는 명시하지 않았습니다.
