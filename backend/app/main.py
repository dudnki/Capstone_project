from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import upload, pipeline

app = FastAPI(title="RAG Evaluation API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
from app.routers import upload  # 분리한 upload 라우터 불러오기

app = FastAPI(title="RAG Evaluation API")

# 프론트엔드 통신 허용 (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router, prefix="/api", tags=["Upload API"])
app.include_router(pipeline.router, prefix="/api", tags=["Pipeline API"])
# 라우터 조립 (prefix="/api"를 주면 자동으로 /api/upload가 됩니다)
app.include_router(upload.router, prefix="/api", tags=["Upload API"])

@app.get("/")
def read_root():
    return {"message": "RAG Evaluation Backend is running!"}
