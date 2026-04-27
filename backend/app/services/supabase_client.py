import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client

# 1. .env 파일을 찾을 때까지 상위 폴더로 거슬러 올라가는 로직
def find_dotenv_path():
    current_path = Path(__file__).resolve().parent
    # 최상위 루트까지 올라가면서 .env가 있는지 확인
    for parent in [current_path] + list(current_path.parents):
        if (parent / ".env").exists():
            return parent / ".env"
    return None

env_path = find_dotenv_path()

# 2. 환경변수 로드
if env_path:
    load_dotenv(dotenv_path=env_path, override=True)
else:
    # 찾지 못했을 경우 기본 위치 시도
    load_dotenv()

# 3. 환경변수 가져오기
url = os.environ.get("SUPABASE_URL", "").strip() # 공백 제거
service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
anon_key = os.environ.get("SUPABASE_KEY")

# 4. 키 선택 로직 (Service Role Key 우선)
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
        f"URL: {'O' if url else 'X'}, KEY: {'O' if SUPABASE_KEY else 'X'}\n"
        f"프로젝트 최상위 폴더에 .env 파일이 있는지 확인해 주세요."
    )

supabase_client: Client = create_client(url, SUPABASE_KEY)

# 터미널에 현재 상태를 출력하여 실행 시 확인을 돕습니다.
print("-" * 50)
print(f"✅ Supabase 클라이언트 로드 성공!")
print(f"📍 경로: {env_path}")
print(f"🔑 모드: {auth_mode}")
print("-" * 50)