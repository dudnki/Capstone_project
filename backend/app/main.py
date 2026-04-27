
# C:\Users\65car\capston_project1\Capstone_project\backend\app\main.py
import sys
import os
print(f"현재 서버 파이썬 경로: {sys.executable}")
print(f"현재 서버 환경 변수(PATH): {os.environ.get('PATH')}")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# main.py 상단
import os
from dotenv import load_dotenv
load_dotenv()

print(f"체크 - SUPABASE_URL: {os.getenv('SUPABASE_URL')}")

# 수정된 부분: 현재 파일이 app 폴더 안에 있으므로 'app.'을 뺍니다.
try:
    from routers import upload, pipeline, evaluations
except ImportError as e:
    print(f"Import Error 발생: {e}")
    # 만약 여전히 에러가 난다면, 파이썬 경로 인식을 위해 명시적으로 호출
    import sys
    import os
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    from routers import upload, pipeline, evaluations

app = FastAPI(title="RAG Evaluation API")

# 1. CORS 설정: 프론트엔드와 백엔드 간의 원활한 데이터 통신 허용
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 실제 배포 시에는 특정 도메인으로 제한하는 것이 좋습니다.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. 라우터 등록: 각 기능별 API 경로 설정
# /api/upload, /api/pipeline, /api/evaluations 경로로 매핑됩니다.
app.include_router(upload.router, prefix="/api", tags=["Upload API"])
app.include_router(pipeline.router, prefix="/api", tags=["Pipeline API"])
app.include_router(evaluations.router, prefix="/api", tags=["Evaluations API"])

# 3. 서버 헬스 체크용 엔드포인트
@app.get("/")
def read_root():
    return {"message": "RAG Evaluation Backend is running!"}