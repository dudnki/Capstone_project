import os
import uuid
import sys
from datetime import datetime
from supabase import create_client, Client
from dotenv import load_dotenv
from groq import Groq  # [추가] Groq 라이브러리

# [1] 환경 변수 로드
load_dotenv()
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_ANON_KEY")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY") # [추가] .env에 GROQ_API_KEY를 설정하세요.

# Groq 클라이언트 초기화
groq_client = Groq(api_key=GROQ_API_KEY)

def generate_qa_with_groq(context):
    """
    [추가] Groq 모델을 사용하여 문맥(Context)으로부터 질문과 답변 쌍을 생성합니다.
    """
    prompt = f"""
    아래 제공된 [Context]를 바탕으로 질문 하나와 그에 대한 정확한 답변을 만들어줘.
    결과는 반드시 아래의 JSON 형식으로만 출력해.
    
    {{
        "question": "질문 내용",
        "answer": "답변 내용"
    }}

    [Context]:
    {context}
    """
    
    completion = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile", # 혹은 llama3-8b-8192
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"}
    )
    
    # JSON 문자열을 파이썬 딕셔너리로 변환
    import json
    return json.loads(completion.choices[0].message.content)

def run():
    if not SUPABASE_URL or not SUPABASE_KEY or not GROQ_API_KEY:
        print("❌ .env 파일의 설정(URL, KEY, GROQ_API_KEY)을 확인해주세요.")
        return

    try:
        # Supabase 클라이언트 생성
        supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
        
        # [2] 실제 데이터 생성 단계
        # 캡스톤 프로젝트 시에는 documents 테이블에서 context를 가져오도록 루프를 돌릴 수 있습니다.
        sample_context = "수원 화성은 조선 시대 정조 임금이 자신의 아버지인 사도세자의 묘를 옮기면서 축조한 성곽으로, 거중기 등 당대의 최첨단 기술이 동원되었습니다."
        
        print("🤖 Groq이 질문과 답변을 생성 중입니다...")
        generated_pair = generate_qa_with_groq(sample_context)
        
        # [3] 데이터 구성 (생성된 데이터 + 평가 점수 예시)
        test_data = {
            "question": generated_pair["question"],
            "answer": generated_pair["answer"],
            "context": sample_context,
            "faithfulness_score": 1.0,  # 실제로는 Ragas 등으로 계산 필요
            "answer_relevance_score": 1.0,
            "context_precision_score": 1.0,
            # "document_id": "민철/민재님께 받은 실제 ID"
        }

        # 'qa_evaluations' 테이블에 데이터 삽입
        response = supabase.table("qa_evaluations").insert(test_data).execute()
        
        print(f"✅ 생성된 질문: {test_data['question']}")
        print(f"✅ 생성된 답변: {test_data['answer']}")
        print("🎉 대성공! Groq이 만든 데이터가 Supabase에 저장되었습니다.")
        
    except Exception as e:
        print(f"❌ 실행 중 오류 발생: {e}")

if __name__ == "__main__":
    run()