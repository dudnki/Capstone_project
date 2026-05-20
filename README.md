# RAG Evaluation Pipeline

> 문서 기반 RAG 시스템의 응답 품질을 자동으로 평가하기 위한 파이프라인

문서를 업로드하면 LLM 에이전트가 평가용 Q&A 데이터셋을 자동으로 만들어 주고,
사용자 모델이 생성한 답변을 RAGAS 지표로 채점한 뒤 문항별 피드백까지 돌려줍니다.

<br>

## 개발 기간

2026.03 ~ 2026.05 (졸업 캡스톤 프로젝트)

<br>

## 팀원

| 이름 | 역할 | GitHub |
| :---: | :---: | :---: |
|  |  |  |
|  |  |  |
|  |  |  |
|  |  |  |

<br>

## 기술 스택

**Backend**

![Python](https://img.shields.io/badge/Python_3.13-3776AB?style=flat-square&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)
![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-D71F00?style=flat-square)
![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white)
![uv](https://img.shields.io/badge/uv-DE5FE9?style=flat-square)

**Frontend**

![Next.js](https://img.shields.io/badge/Next.js_16-000000?style=flat-square&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React_19-61DAFB?style=flat-square&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)

**LLM / NLP**

![OpenAI](https://img.shields.io/badge/OpenAI_gpt--4o--mini-412991?style=flat-square&logo=openai&logoColor=white)
![Groq](https://img.shields.io/badge/Groq_llama--3.3--70B-F55036?style=flat-square)
![Gemini](https://img.shields.io/badge/Gemini_3.1_Flash-4285F4?style=flat-square&logo=googlegemini&logoColor=white)
![HuggingFace](https://img.shields.io/badge/HuggingFace-FFD21E?style=flat-square&logo=huggingface&logoColor=black)
![LangChain](https://img.shields.io/badge/LangChain-1C3C3C?style=flat-square&logo=langchain&logoColor=white)
![RAGAS](https://img.shields.io/badge/RAGAS-FF6F61?style=flat-square)

<br>

## 주요 기능

#### 문서 자동 분류 + 도메인 키워드 추출
- `BAAI/bge-m3` 임베딩으로 문서를 6개 도메인으로 분류
  (기술논문 / 사업보고서 / 약관 / 매뉴얼 / 법률문서 / 일반)
- KeyBERT + 도메인 사전 차집합으로 희귀 토큰 추출 → 질문 생성 힌트로 사용

#### Q&A 생성 파이프라인 2종
- **G-Eval 결정론 방식** — 청크별로 후보 N개 생성 → G-Eval 5개 기준으로 채점 → top-K만 통과
- **Agentic 방식** — OpenAI tool calling으로 에이전트가 직접 MMR 청크 선택 / Bloom 유형 결정 / 멀티 청크 결합 / 재시도 수행

#### PDF 어댑티브 추출
- 페이지 단위로 텍스트 비중을 분석해 PyMuPDF만 쓸지, Gemini Vision을 섞을지 자동 결정
- 추출 결과는 캐시되어 같은 PDF는 두 번째부터 LLM 호출 없이 즉시 반환

#### RAGAS 기반 채점
- `Faithfulness`, `Answer Relevancy`, `Answer Correctness`, `Similarity` 4지표
- RAGAS 1차 결과가 0이거나 비정상일 때를 위한 LLM judge 폴백 (키워드 + 개념 앙상블)

#### 자동 피드백 생성
- 점수 외에 모범 답안 대비 강·약점, 개선 포인트, 학습 조언을 LLM이 생성해 결과 화면에 표시

<br>

## 시스템 구조

```
   [Next.js]                       [FastAPI]
   ─────────                       ─────────
   업로드  ────────────────▶  /api/upload  ──▶  uploaded_pdf/{uuid}
                                    │
   파이프라인 실행 ───────▶  /api/pipeline/run          (G-Eval)
                            /api/pipeline/run_agentic  (Agentic)
                                    │
                                    ├── PDF → Markdown 추출 (PyMuPDF / Gemini Vision)
                                    ├── 문서 분류 + Rare token 추출
                                    ├── 청크 분할 (RecursiveCharacterTextSplitter)
                                    ├── Q&A 생성 (LLM)
                                    └── G-Eval critic (logprob 가중합)
                                            │
                                            ▼
                                    SQLite (capstone.db)
                                            │
   사용자 답변 CSV ───────▶  /api/evaluations/submit
                                    ├── RAGAS 4지표 평가
                                    ├── LLM judge 폴백
                                    └── 문항별 / 전체 피드백 생성
```

<br>

## 디렉토리 구조

```
Capstone_project/
├── backend/
│   ├── app/
│   │   ├── main.py                FastAPI 진입점
│   │   ├── routers/
│   │   │   ├── upload.py          파일 업로드
│   │   │   ├── pipeline.py        Q&A 생성 파이프라인
│   │   │   └── evaluations.py     RAGAS 채점 및 피드백
│   │   └── services/
│   │       ├── database.py        SQLAlchemy 모델
│   │       ├── pdf_extractor.py   PDF 어댑티브 추출 + 캐시
│   │       ├── document_analyzer.py   bge-m3 분류 + KeyBERT + MMR
│   │       ├── domain_keywords.py 도메인 사전
│   │       ├── qa_generator.py    단일 / 멀티 청크 Q&A 생성
│   │       ├── qa_agent.py        Agentic 파이프라인 (tool calling)
│   │       ├── qa_critic.py       G-Eval logprob critic
│   │       ├── geval_filter.py    G-Eval 결정론 필터
│   │       └── ragas_eval.py      RAGAS + LLM judge 폴백
│   ├── uploaded_pdf/              업로드 원본 (gitignore)
│   ├── capstone.db                SQLite (gitignore)
│   └── .cache/                    PDF 추출 캐시 (gitignore)
│
├── frontend/
│   ├── app/
│   │   ├── page.tsx               메인 페이지
│   │   └── layout.tsx
│   ├── components/
│   │   ├── DatasetManager.tsx
│   │   ├── EvaluationResult.tsx
│   │   ├── ReviewManager.tsx
│   │   ├── Header.tsx
│   │   └── Sidebar.tsx
│   └── src/types.ts
│
└── database/
    └── schema.sql                 초기 Supabase + pgvector 스키마 (참고용)
```

<br>

## 실행 방법

### Backend

```bash
cd backend
uv sync

# .env 파일 생성
cat > .env <<'EOF'
OPENAI_API_KEY=sk-...
GROQ_API_KEY=gsk_...
GEMINI_API_KEY=...
USE_KEYWORD_LLM=gemini-3.1-flash-lite-preview
EOF

uv run uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload
```

> 첫 실행 시 `BAAI/bge-m3` (~2.3GB) 와 `paraphrase-multilingual-MiniLM-L12-v2` 모델을 자동 다운로드합니다.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

- Frontend: http://localhost:3000
- Backend:  http://127.0.0.1:8001
- Swagger UI: http://127.0.0.1:8001/docs

<br>

## API

| Method | Path                            | 설명                                                    |
| :----: | :------------------------------ | :------------------------------------------------------ |
| GET    | `/`                             | 헬스 체크                                               |
| POST   | `/api/upload`                   | 문서 업로드 (PDF / TXT / MD), UUID 변환 후 로컬 저장    |
| POST   | `/api/pipeline/run`             | G-Eval 결정론 파이프라인 실행                           |
| POST   | `/api/pipeline/run_agentic`     | Agentic 파이프라인 실행 (tool-calling + logprob critic) |
| POST   | `/api/evaluations/submit`       | 사용자 답변 CSV 제출 → 채점 + 피드백                    |
