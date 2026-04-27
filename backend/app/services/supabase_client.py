import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client

# 1. .env 파일을 찾을 때까지 상위 폴더로 거슬러 올라가는 로직
def find_dotenv_path():
    current_path = Path(__file__).resolve().parent
    # 현재 폴더 포함 상위 폴더들 탐색
    for parent in [current_dir := current_path] + list(current_path.parents):
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
SUPABASE_URL = os.environ.get("SUPABASE_URL")
# 태원님의 .env 파일 변수명인 SUPABASE_SERVICE_ROLE_KEY를 가져옵니다.
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

# 4. 검증 및 클라이언트 생성 (오타 수정 포인트!)
# 정의한 변수 이름은 SUPABASE_KEY이므로 아래처럼 수정해야 합니다.
if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError(
        f"Supabase 환경변수를 읽지 못했습니다.\n"
        f"현재 파일 위치: {Path(__file__).resolve()}\n"
        f"탐색된 .env 경로: {env_path}\n"
        f"프로젝트 최상위 폴더에 .env 파일이 있는지 확인해 주세요."
    )

# 5. 클라이언트 생성
supabase_client: Client = create_client(SUPABASE_URL, SUPABASE_KEY)