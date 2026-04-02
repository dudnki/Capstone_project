import os
import uuid
from fastapi import APIRouter, File, UploadFile, HTTPException
from app.services.supabase import supabase_client  # 방금 분리한 DB 클라이언트 호출

router = APIRouter()

# 이미 main.py에서 /api 접두사를 붙일 것이므로 여기서는 /upload만 적습니다.
@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        file_contents = await file.read()
        original_filename = file.filename
        
        _, ext = os.path.splitext(original_filename)
        safe_filename = f"{uuid.uuid4()}{ext}"

        # documents 버킷에 업로드 (supabase_client 사용)
        res = supabase_client.storage.from_("documents").upload(
            safe_filename, 
            file_contents, 
            {"upsert": "true"}
        )

        return {
            "message": "파일이 Supabase에 성공적으로 업로드되었습니다.",
            "original_filename": original_filename,
            "saved_filename": safe_filename
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"업로드 실패: {str(e)}")