import os
import uuid
from fastapi import APIRouter, File, UploadFile, HTTPException
from app.services.supabase_client import supabase_client

router = APIRouter()

@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        # 1. 파일 읽기
        file_contents = await file.read()
        original_filename = file.filename

        # 2. 안전한 파일명 생성 (UUID)
        _, ext = os.path.splitext(original_filename)
        safe_filename = f"{uuid.uuid4()}{ext}"

        # 3. Supabase Storage 업로드
        # .upload(경로, 파일내용, 옵션)
        response = supabase_client.storage.from_("documents").upload(
            path=safe_filename,
            file=file_contents,
            file_options={"content-type": file.content_type, "upsert": "true"}
        )

        # app/routers/upload.py (응답 부분 수정)

        return {
            "status": "success",
            "message": "파일이 Supabase에 성공적으로 업로드되었습니다.",
            "original_filename": original_filename,
            "saved_filename": safe_filename,
            "path": safe_filename  # 프론트엔드의 uploadData.path를 위해 추가
        }

    except Exception as e:
        # 터미널에 에러 로그 출력
        print(f"❌ Upload Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"업로드 실패: {str(e)}")