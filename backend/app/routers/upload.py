import os
import uuid
from fastapi import APIRouter, File, UploadFile, HTTPException

router = APIRouter()

# 1. 파일이 저장될 로컬 폴더 경로 설정
# (backend 폴더 안에 'uploaded_pdf'라는 폴더가 자동으로 생깁니다)
UPLOAD_DIR = "uploaded_pdf"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        # 파일 내용 읽기
        file_contents = await file.read()
        original_filename = file.filename

        # UUID 기반의 안전한 파일명 생성 (중복 방지)[cite: 3]
        _, ext = os.path.splitext(original_filename)
        safe_filename = f"{uuid.uuid4()}{ext}"

        # 2. 로컬 폴더에 파일 저장하기 (수퍼베이스 대체)
        file_path = os.path.join(UPLOAD_DIR, safe_filename)
        with open(file_path, "wb") as f:
            f.write(file_contents)

        # 3. 업로드 완료 후 정보 반환
        return {
            "status": "success",
            "message": "파일이 로컬 폴더에 성공적으로 저장되었습니다.",
            "original_filename": original_filename,
            "saved_filename": safe_filename,
            "file_path": file_path
        }

    except Exception as e:
        # 에러 발생 시 서버 터미널에 상세 정보 출력 (디버깅용)[cite: 3]
        print(f"Upload Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"로컬 업로드 실패: {str(e)}")