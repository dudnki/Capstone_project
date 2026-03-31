```markdown
# 🚀 RAG Evaluation Pipeline Project

LLM 성능 평가를 위한 자동화된 데이터셋 구축 및 RAG 파이프라인 프로젝트입니다.

## 🛠 Tech Stack
- **Backend**: FastAPI
- **Database**: Supabase (PostgreSQL + pgvector)
- **Environment**: uv (Fast Python package installer)

## 📁 Project Structure
- `backend/`: FastAPI 기반의 API 서버 로직
- `database/`: Supabase 테이블 스키마 및 SQL 명세서
- `frontend/`: Next.js 기반 사용자 인터페이스

## 🚀 Getting Started (Backend)

1. **가상환경 설정 (uv 사용)**
   ```bash
   cd backend
   uv venv
   .\.venv\Scripts\activate
   ```

2. **패키지 설치**
   ```bash
   uv pip install -r requirements.txt (또는 개별 설치)
   ```

3. **서버 실행**
   ```bash
   uvicorn app.main:app --reload
   ```

## ✨ 주요 구현 기능
- **파일 업로드 API**: 사용자가 업로드한 문서를 Supabase Storage(`documents` 버킷)에 자동 저장
- **DB 스키마 설계**: 원천 문서, 텍스트 칩(Chunks), Ragas 평가 지표 저장을 위한 관계형 테이블 구축
```
