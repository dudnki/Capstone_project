import os
import uuid
import sys
from datetime import datetime
from supabase import create_client, Client
from dotenv import load_dotenv

# [1] 환경 변수 로드
load_dotenv()
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_ANON_KEY")

def run():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print(" .env 파일의 설정x(URL, KEY)을 확인해주세요.")
        return

    try:
        # Supabase 클라이언트 생성
        supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
        
        # [수정된 부분] 팀원들이 알려준 실제 컬럼명에 맞게 데이터 구성
        # document_id는 실제 documents 테이블에 존재하는 ID여야 하지만, 
        # 테스트를 위해 임시 UUID를 생성하여 넣어봅니다.
        test_data = {
            "question": "테스트 질문입니다. RAG 성능은 어떤가요?",
            "answer": "테스트 답변입니다. 성능이 우수합니다.",
            "context": "여기에 검색된 참고 문장들이 들어갑니다.",
            "faithfulness_score": 0.95,
            "answer_relevance_score": 0.88,
            "context_precision_score": 0.92,
            # document_id는 외래키이므로, 오류가 난다면 실제 있는 ID로 바꿔야 할 수 있습니다.
            # "document_id": "실제_존재하는_UUID_값" 
        }

        # 'qa_evaluations' 테이블에 데이터 삽입
        response = supabase.table("qa_evaluations").insert(test_data).execute()
        
        print("🎉 대성공! 데이터가 'qa_evaluations' 테이블에 정상적으로 저장되었습니다.")
        
    except Exception as e:
        # 외래키 제약 조건(document_id) 때문에 에러가 날 경우에 대한 안내
        error_msg = str(e)
        if "foreign key constraint" in error_msg.lower():
            print(f"❌ 외래키 오류: 'document_id'가 실제 documents 테이블에 존재하지 않습니다.")
            print("민철/민재 님께 'documents 테이블에 있는 테스트용 ID 하나만 알려줘'라고 하세요.")
        else:
            print(f"❌ 실행 중 오류 발생: {e}")

if __name__ == "__main__":
    run()