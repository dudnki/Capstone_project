import os
from supabase import create_client, Client
from dotenv import load_dotenv

# 환경변수 로드
load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Supabase 환경변수가 설정되지 않았습니다.")

# 프로젝트 전체에서 공유해서 쓸 Supabase 클라이언트 객체
supabase_client: Client = create_client(SUPABASE_URL, SUPABASE_KEY)