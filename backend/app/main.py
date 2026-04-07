from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
<<<<<<< feat/backend-api-v2
from app.routers import upload  # 분리한 upload 라우터 불러오기
=======
from supabase import create_client, Client
import os
import uuid  # UUID 생성을 위해 추가된 패키지
from dotenv import load_dotenv
>>>>>>> gen_model

app = FastAPI(title="RAG Evaluation API")

# 프론트엔드 통신 허용 (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

<<<<<<< feat/backend-api-v2
# 라우터 조립 (prefix="/api"를 주면 자동으로 /api/upload가 됩니다)
app.include_router(upload.router, prefix="/api", tags=["Upload API"])

@app.get("/")
def read_root():
    return {"message": "RAG Evaluation Backend is running!"}
=======
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Supabase 환경변수가 설정되지 않았습니다.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        file_contents = await file.read()
        original_filename = file.filename
        
        # 1. 원본 파일에서 확장자만 추출 (예: .pdf, .txt)
        _, ext = os.path.splitext(original_filename)
        
        # 2. UUID(고유 난수)를 사용하여 안전한 새 파일명 생성
        # 예: 550e8400-e29b-41d4-a716-446655440000.pdf
        safe_filename = f"{uuid.uuid4()}{ext}"

        # 3. documents 버킷에 안전한 파일명으로 업로드
        res = supabase.storage.from_("documents").upload(
            safe_filename, 
            file_contents, 
            {"upsert": "true"}
        )

        # 4. 프론트엔드에 원본 이름과 변환된 저장 이름을 모두 반환
        return {
            "message": "파일이 Supabase에 성공적으로 업로드되었습니다.",
            "original_filename": original_filename,
            "saved_filename": safe_filename
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"업로드 실패: {str(e)}")
>>>>>>> gen_model
