from fastapi import APIRouter, HTTPException
from app.services.supabase_client import supabase_client  # (주의: 민철님 프로젝트의 실제 경로에 맞게 맞춰주세요)

router = APIRouter()

@router.get("/evaluations")
async def get_evaluations_list():
    """
    [Task 2] 최근 문서 평가 히스토리 목록 조회 API
    - 프론트엔드가 메인 화면에 들어왔을 때, 예전에 평가했던 문서 목록을 뿌려주는 역할.
    """
    try:
        # 1. Supabase의 documents 테이블에서 데이터 조회
        # 2. 최신순으로 정렬 (created_at 내림차순)
        # 3. 프론트엔드 목록 표시에 필요한 최소한의 데이터(id, status, created_at)만 가져옴
        response = supabase_client.table("documents")\
            .select("id, status, created_at")\
            .order("created_at", desc=True)\
            .execute()
        
        return {
            "success": True,
            "data": response.data
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"히스토리 목록 조회 실패: {str(e)}")
        
@router.get("/evaluations/{document_id}")
async def get_evaluation_detail(document_id: str):
    """
    [Task 3] 특정 평가 기록 상세 조회 API
    - 목록에서 항목을 클릭했을 때, 해당 문서의 50개 Q&A 세트와 상세 점수를 쫙 불러옵니다.
    """
    try:
        # 1. 해당 문서의 메타데이터(상태 등) 조회 (.single()로 단건 조회)
        doc_response = supabase_client.table("documents")\
            .select("*")\
            .eq("id", document_id)\
            .single()\
            .execute()
            
        # 2. 해당 문서에 딸린 수십 개의 Q&A 쌍 및 평가 점수 조회
        qa_response = supabase_client.table("qa_evaluations")\
            .select("*")\
            .eq("document_id", document_id)\
            .execute()
            
        return {
            "success": True,
            "document_info": doc_response.data,
            "qa_details": qa_response.data  # 프론트엔드는 이 배열을 받아서 표(Table)로 그립니다.
        }
        
    except Exception as e:
        # DB에 해당 id가 없거나 통신 에러 시 404/500 반환
        raise HTTPException(status_code=404, detail=f"상세 데이터를 찾을 수 없습니다: {str(e)}")