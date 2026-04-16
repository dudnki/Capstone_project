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
```

**2. 패키지 설치**
```bash
# (주의) poetry가 아닌 uv를 표준으로 사용합니다.
uv pip install fastapi uvicorn supabase python-multipart python-dotenv
```

**3. 환경 변수 설정 (`.env`)**
`backend/` 폴더 최상단에 `.env` 파일을 생성하고 아래 키를 입력합니다. (프론트엔드 직접 접근을 차단하기 위해 백엔드 전용 `service_role` 키를 사용합니다.)
```env
SUPABASE_URL=https://[본인의_프로젝트_ID].supabase.co
SUPABASE_KEY=[본인의_SERVICE_ROLE_KEY]
```

**4. 서버 실행**
```bash
uvicorn app.main:app --reload
```

## ✨ 주요 구현 기능

- **보안 및 권한 통제**:
  - 프론트엔드의 직접적인 Supabase 접근을 차단하여 보안을 강화했습니다.
  - 백엔드(FastAPI)가 `service_role` 키를 쥐고 DB 및 Storage 조작을 안전하게 대행합니다.
- **파일 업로드 API (`POST /api/upload`)**:
  - 프론트엔드에서 업로드한 문서를 Supabase Storage(`documents` 버킷)에 자동 저장합니다.
  - **[한글/공백 인코딩 방어]** 한글이나 공백이 포함된 파일 업로드 시 발생하는 `400 에러`를 방지하기 위해, 백엔드 수신 즉시 **UUID(고유 난수)로 파일명을 안전하게 변환**하여 저장합니다.
  - 통신 성공 시 `original_filename`(원본 파일명)과 `saved_filename`(변환된 저장 파일명)을 함께 반환하여 프론트엔드 렌더링을 지원합니다.
- **DB 스키마 설계**: 원천 문서, 텍스트 청크(Chunks), Ragas 평가 지표 저장을 위한 관계형 테이블(PostgreSQL + pgvector) 구축을 완료했습니다.
