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
