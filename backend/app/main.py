from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
# evaluations 라우터를 추가로 불러옵니다.
from app.routers import upload, pipeline, evaluations 

app = FastAPI(title="RAG Evaluation API")

# 1. 프론트엔드 통신 허용 (CORS) 설정
# 민재 님이 개발할 프론트엔드와 백엔드 간의 데이터 통신을 원활하게 해줍니다.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. 라우터 조립 (기능별 API 경로 설정)
# 각 기능이 /api/upload, /api/pipeline/run, /api/evaluations 경로로 자동 매핑됩니다.
app.include_router(upload.router, prefix="/api", tags=["Upload API"])
app.include_router(pipeline.router, prefix="/api", tags=["Pipeline API"])
app.include_router(evaluations.router, prefix="/api", tags=["Evaluations API"])

# 3. 서버 헬스 체크용 엔드포인트
@app.get("/")
def read_root():
    return {"message": "RAG Evaluation Backend is running!"}