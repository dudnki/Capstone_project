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
        # UUID 기반 안전한 파일명 생성 (중복 방지)
        safe_filename = f"{uuid.uuid4()}{ext}"

        # Supabase Storage 'documents' 버킷 업로드
        supabase_client.storage.from_("documents").upload(
            path=safe_filename,
            file=file_contents,
            file_options={"content-type": file.content_type, "upsert": "true"}
        )

        return {
            "status": "success",
            "message": "파일이 Supabase에 성공적으로 업로드되었습니다.",
            "original_filename": original_filename,
            "saved_filename": safe_filename
        }

    except Exception as e:
        print(f"Upload Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"업로드 실패: {str(e)}")
