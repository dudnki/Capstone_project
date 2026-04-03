import os
import json
import psycopg2
from psycopg2.extras import RealDictCursor
from groq import Groq
from dotenv import load_dotenv

# .env 파일 로드 (파일이 없을 경우 대비)
load_dotenv()

# 1. Groq 설정 (환경 변수 우선, 없으면 직접 입력된 키 사용)
GROQ_API_KEY = os.getenv("키입력")
sever_password=("비번입력")
client = Groq(api_key="키입력")
sever_password=("비번입력")

# 2. DB 설정 (로컬 테스트용 기본값 세팅)
db_config = {
    "dbname": os.getenv("DB_NAME", "captsgit branchon_project"),
    "user": os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASSWORD", "비번입력"), 
    "host": os.getenv("DB_HOST", "127.0.0.1"),
    "port": os.getenv("DB_PORT", "5432")
}

def generate_qa_pair(context):
    """
    Groq AI를 사용하여 문맥(Context) 기반의 Q&A 쌍을 생성합니다.
    """
    if not context:
        return None

    # 문구에 JSON 형식을 강력하게 요청하는 프롬프트
    prompt = f"""
    아래 [Context]를 바탕으로 질문과 답변 쌍을 하나 생성해줘.
    반드시 아래 JSON 형식으로만 응답해야 해:
    {{
        "question": "질문 내용",
        "answer": "답변 내용"
    }}
    
    [Context]:
    {context}
    """
    
    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"}
        )
        
        # JSON 결과 파싱
        content = json.loads(response.choices[0].message.content)
        
        # 대소문자 구분 없이 데이터 추출 (안정성 확보)
        q = content.get("question") or content.get("Question")
        a = content.get("answer") or content.get("Answer")
        
        if q and a:
            return {"question": q, "answer": a}
        return None

    except Exception as e:
        print(f"❌ Groq API 호출 중 오류 발생: {e}")
        return None

def process_and_save_eval_data():
    """
    DB에서 '대기중' 문서를 읽어 Q&A를 생성하고 저장합니다.
    """
    conn = None
    cur = None
    
    try:
        print("🔄 데이터베이스 연결 시도 중...")
        conn = psycopg2.connect(**db_config)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        print("✅ DB 연결 성공!")

        # 1. '대기중' 상태인 문서 목록 조회
        cur.execute("SELECT id, content FROM documents WHERE status = '대기중';")
        documents = cur.fetchall()

        if not documents:
            print("ℹ️ 처리할 '대기중' 문서가 없습니다. 작업을 종료합니다.")
            return

        print(f"📝 총 {len(documents)}개의 문서를 처리합니다.")

        for doc in documents:
            doc_id = doc['id']
            content_text = doc['content']

            # 데이터가 바이트 타입인 경우 문자열로 변환
            if isinstance(content_text, bytes):
                content_text = content_text.decode('utf-8', errors='ignore')

            print(f"🚀 문서 ID [{doc_id}] Q&A 생성 시작...")

            # 2. AI를 통한 Q&A 생성
            res = generate_qa_pair(content_text)
            
            if res:
                # 3. qa_evaluations 테이블에 결과 저장
                insert_query = """
                INSERT INTO qa_evaluations (document_id, question, answer, context)
                VALUES (%s, %s, %s, %s);
                """
                # 컨텍스트가 너무 길면 DB 저장 시 에러가 날 수 있으므로 앞부분만 예시로 저장하거나 전체 저장
                cur.execute(insert_query, (doc_id, res['question'], res['answer'], content_text[:1000]))
                
                # 4. 해당 문서의 상태를 '완료'로 업데이트
                cur.execute("UPDATE documents SET status = '완료' WHERE id = %s", (doc_id,))
                
                # 건별로 즉시 반영 (안전한 저장)
                conn.commit()
                print(f"✅ 문서 ID [{doc_id}] 처리 및 DB 저장 완료!")
            else:
                print(f"⚠️ 문서 ID [{doc_id}] 생성 실패: AI 응답이 올바르지 않습니다.")

    except Exception as e:
        print(f"\n❌ 치명적 에러 발생: {e}")
        if conn:
            conn.rollback()
            
    finally:
        if cur: cur.close()
        if conn: conn.close()
        print("🚪 DB 연결 세션을 종료합니다.")

if __name__ == "__main__":
    process_and_save_eval_data()