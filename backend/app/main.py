from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import upload  # 분리한 upload 라우터 불러오기
from app.routers import upload, pipeline

app = FastAPI(title="RAG Evaluation API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 라우터 조립 (prefix="/api"를 주면 자동으로 /api/upload가 됩니다)
app.include_router(upload.router, prefix="/api", tags=["Upload API"])
app.include_router(pipeline.router, prefix="/api", tags=["Pipeline API"])

@app.get("/")
def read_root():
    return {"message": "RAG Evaluation Backend is running!"}
