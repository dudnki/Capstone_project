from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
import os
from dotenv import load_dotenv

# .env 파일 로드
load_dotenv()

app = FastAPI()

# 프론트엔드(Next.js) 요청 허용용 CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Supabase 환경변수가 설정되지 않았습니다.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        file_contents = await file.read()
        file_name = file.filename

        # documents 버킷에 업로드
        res = supabase.storage.from_("documents").upload(
            file_name, 
            file_contents, 
            {"upsert": "true"}
        )

        return {
            "message": "파일이 Supabase에 성공적으로 업로드되었습니다.",
            "file_name": file_name
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"업로드 실패: {str(e)}")