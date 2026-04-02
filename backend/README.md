# 🚀 RAG Evaluation Pipeline Project

LLM 성능 평가를 위한 자동화된 데이터셋 구축 및 RAG 파이프라인 프로젝트입니다.

## 🛠 Tech Stack
- **Backend**: FastAPI
- **Database**: Supabase (PostgreSQL + pgvector)
- **Environment**: uv (Fast Python package installer)

## 📁 Project Structure
- `backend/`: FastAPI 기반의 API 서버
  - `app/main.py`: 애플리케이션 진입점 및 전역 설정 (CORS, 라우터 조립)
  - `app/routers/`: API 엔드포인트 라우팅 (파일 업로드 등)
  - `app/services/`: 핵심 비즈니스 로직 및 외부 연동 (Supabase 클라이언트 등)
- `database/`: Supabase 테이블 스키마 및 SQL 명세서
- `frontend/`: Next.js 기반 사용자 인터페이스

## 🚀 Getting Started (Backend)

**1. 가상환경 설정 (uv 사용)**
```bash
cd backend
uv venv

# 윈도우 환경
.\.venv\Scripts\activate

# Mac/Linux 환경
source .venv/bin/activate