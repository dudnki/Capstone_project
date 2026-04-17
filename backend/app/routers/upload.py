import os
import uuid
from fastapi import APIRouter, File, UploadFile, HTTPException
from app.services.supabase_client import supabase_client

router = APIRouter()


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        file_contents = await file.read()
        original_filename = file.filename

        _, ext = os.path.splitext(original_filename)
        safe_filename = f"{uuid.uuid4()}{ext}"

        supabase_client.storage.from_("documents").upload(
            safe_filename,
            file_contents,
            {"content-type": file.content_type, "upsert": "true"}
        )

        return {
            "message": "파일이 Supabase에 성공적으로 업로드되었습니다.",
            "original_filename": original_filename,
            "saved_filename": safe_filename
        }

    except Exception as e:
        print(f"Upload Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"업로드 실패: {str(e)}")
