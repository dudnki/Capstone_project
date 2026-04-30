import os
import uuid
from fastapi import APIRouter, File, UploadFile, HTTPException
from app.services.supabase_client import supabase_client

router = APIRouter()

<<<<<<< HEAD

=======
# 이미 main.py에서 /api 접두사를 붙였으므로 여기서는 /upload만 정의합니다.
>>>>>>> feature/rag-eval-fix
@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        file_contents = await file.read()
        original_filename = file.filename

        _, ext = os.path.splitext(original_filename)
<<<<<<< HEAD
        safe_filename = f"{uuid.uuid4()}{ext}"

        supabase_client.storage.from_("documents").upload(
            safe_filename,
            file_contents,
            {"content-type": file.content_type, "upsert": "true"}
        )

=======
        # UUID 기반의 안전한 파일명 생성 (중복 방지)
        safe_filename = f"{uuid.uuid4()}{ext}"

        # 1. Supabase Storage 'documents' 버킷에 업로드
        # content-type을 명시하면 브라우저나 Supabase 대시보드에서 파일을 확인할 때 더 정확하게 표시됩니다.
        res = supabase_client.storage.from_("documents").upload(
            path=safe_filename, 
            file=file_contents, 
            file_options={"content-type": file.content_type, "upsert": "true"}
        )

        # 2. 업로드 완료 후 정보 반환
>>>>>>> feature/rag-eval-fix
        return {
            "status": "success",
            "message": "파일이 Supabase에 성공적으로 업로드되었습니다.",
            "original_filename": original_filename,
            "saved_filename": safe_filename
        }

    except Exception as e:
<<<<<<< HEAD
        print(f"Upload Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"업로드 실패: {str(e)}")
=======
        # 에러 발생 시 서버 터미널에 상세 정보 출력 (디버깅용)
        print(f"Upload Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"업로드 실패: {str(e)}")
>>>>>>> feature/rag-eval-fix
