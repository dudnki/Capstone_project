# C:\Users\65car\capston_project1\Capstone_project\backend\app\main.py

import sys
import os
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from app.routers import upload, pipeline, evaluations

app = FastAPI(title="RAG Evaluation API")

# 1. CORS 설정 (단 한 번만 설정!)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. 라우터 조립
app.include_router(upload.router, prefix="/api", tags=["Upload API"])
app.include_router(pipeline.router, prefix="/api", tags=["Pipeline API"])
app.include_router(evaluations.router, prefix="/api", tags=["Evaluations API"])

# 3. 서버 헬스 체크
@app.get("/")
def read_root():
    return {"message": "RAG Evaluation Backend is running!"}


