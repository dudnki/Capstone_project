import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client

# 1. .env 파일을 탐색하는 로직
def find_dotenv_path():
    current_path = Path(__file__).resolve().parent
    for parent in current_path.parents:
        if (parent / ".env").exists():
            return parent / ".env"
    return None

env_path = find_dotenv_path()

# 2. 환경변수 로드
if env_path:
    load_dotenv(dotenv_path=env_path, override=True)
else:
    load_dotenv()

# 3. 환경변수 가져오기
# 태원님의 .env 파일에 적힌 이름인 SUPABASE_SERVICE_ROLE_KEY를 가져옵니다.
url = os.environ.get("SUPABASE_URL")
service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
anon_key = os.environ.get("SUPABASE_KEY")

# 4. 키 선택 로직 및 권한 상태 확인
if service_key:
    SUPABASE_KEY = service_key
    auth_mode = "🚀 Service Role Key (관리자 권한 / RLS 우회 가능)"
else:
    SUPABASE_KEY = anon_key
    auth_mode = "⚠️ Anon Key (일반 권한 / RLS 차단될 수 있음)"

# 5. 검증 및 클라이언트 생성
if not url or not SUPABASE_KEY:
    raise ValueError(
        f"🚨 Supabase 환경변수를 읽지 못했습니다.\n"
        f"탐색된 .env 경로: {env_path}\n"
        f"URL: {'O' if url else 'X'}, KEY: {'O' if SUPABASE_KEY else 'X'}"
    )

supabase_client: Client = create_client(url, SUPABASE_KEY)

# 터미널에 현재 상태를 출력하여 에러 원인을 파악하기 쉽게 합니다.
print("-" * 50)
print(f"✅ Supabase 클라이언트 로드 성공!")
print(f"📍 경로: {env_path}")
print(f"🔑 모드: {auth_mode}")
print("-" * 50)