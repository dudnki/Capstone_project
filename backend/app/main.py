
# C:\Users\65car\capston_project1\Capstone_project\backend\app\main.py
import sys
import os

# Windows cp949 터미널에서 유니코드 문자(em dash 등) print 시 오류 방지
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.stderr.reconfigure(encoding='utf-8', errors='replace')

print(f"현재 서버 파이썬 경로: {sys.executable}")
print(f"현재 서버 환경 변수(PATH): {os.environ.get('PATH')}")

from dotenv import load_dotenv
load_dotenv()  # .env 파일 로드 — 라우터/서비스 import 전에 먼저 실행되어야 함

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import upload, pipeline, evaluations

app = FastAPI(title="RAG Evaluation API")

# 1. 프론트엔드 통신 허용 (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. 라우터 조립 (각 기능이 /api/... 경로로 자동 매핑)
app.include_router(upload.router, prefix="/api", tags=["Upload API"])
app.include_router(pipeline.router, prefix="/api", tags=["Pipeline API"])
app.include_router(evaluations.router, prefix="/api", tags=["Evaluations API"])

# 3. 서버 헬스 체크
@app.get("/")
def read_root():
    return {"message": "RAG Evaluation Backend is running!"}
