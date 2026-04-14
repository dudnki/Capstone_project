import os
import uuid
from fastapi import APIRouter, File, UploadFile, HTTPException
from app.services.supabase_client import supabase_client

router = APIRouter()

<<<<<<< HEAD
=======
# 이미 main.py에서 /api 접두사를 붙일 것이므로 여기서는 /upload만 적습니다.
>>>>>>> 1557ed46641e8fbc6be274249f5d768f612c932a
@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        file_contents = await file.read()
        original_filename = file.filename
        
        _, ext = os.path.splitext(original_filename)
<<<<<<< HEAD
        # UUID 기반의 안전한 파일명 생성
        safe_filename = f"{uuid.uuid4()}{ext}"

        # 1. Supabase Storage 'documents' 버킷에 업로드
        # supabase_client가 service_role 키를 사용하므로 권한 에러 없이 업로드됩니다.
        res = supabase_client.storage.from_("documents").upload(
            safe_filename, 
            file_contents, 
            {"content-type": file.content_type, "upsert": "true"} # content-type 추가 권장
        )

        # 2. [선택 사항이지만 추천] DB documents 테이블에 업로드 기록 생성
        # 이렇게 하면 나중에 파이프라인에서 이 ID를 바로 쓸 수 있습니다.
        # 만약 pipeline.py 내부에서 insert를 수행한다면 이 부분은 생략해도 되지만, 
        # 안정성을 위해 여기서 미리 '대기중' 상태로 기록하는 것이 좋습니다.
        """
        db_res = supabase_client.table("documents").insert({
            "original_filename": original_filename,
            "status": "대기중",
            "content": "" # 나중에 pipeline에서 추출 후 업데이트
        }).execute()
        """

=======
        safe_filename = f"{uuid.uuid4()}{ext}"

        # documents 버킷에 업로드 (supabase_client 사용)
        res = supabase_client.storage.from_("documents").upload(
            safe_filename, 
            file_contents, 
            {"upsert": "true"}
        )

>>>>>>> 1557ed46641e8fbc6be274249f5d768f612c932a
        return {
            "message": "파일이 Supabase에 성공적으로 업로드되었습니다.",
            "original_filename": original_filename,
            "saved_filename": safe_filename
        }

    except Exception as e:
<<<<<<< HEAD
        # 에러 발생 시 상세 정보 출력 (디버깅용)
        print(f"Upload Error: {str(e)}")
=======
>>>>>>> 1557ed46641e8fbc6be274249f5d768f612c932a
        raise HTTPException(status_code=500, detail=f"업로드 실패: {str(e)}")