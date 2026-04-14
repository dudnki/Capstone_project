import os
import json
from dotenv import load_dotenv
from datasets import Dataset
from supabase import create_client, Client
from groq import Groq

# Ragas 최신 버전 임포트 규칙
from ragas import evaluate
from ragas.metrics.collections import Faithfulness, AnswerCorrectness, AnswerRelevancy 
from langchain_groq import ChatGroq
from langchain_huggingface import HuggingFaceEmbeddings

# 그래픽카드 라이브러리 충돌 방지 설정
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

# [1] .env 로드 (경로 문제 방지를 위해 여러 시도)
load_dotenv()
if not os.environ.get("SUPABASE_KEY"):
    load_dotenv("../../../.env") # 루트 폴더 경로 시도

# [2] 환경 변수 가져오기 (이름을 .env와 정확히 일치시킴)
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")  # .env 파일의 이름과 동일하게 수정
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")

# [3] 로드 확인용 디버깅 (에러 발생 시 범인을 바로 잡기 위함)
print(f"--- 환경 변수 로드 상태 ---")
print(f"URL: {'✅ 로드됨' if SUPABASE_URL else '❌ 누락'}")
print(f"KEY: {'✅ 로드됨' if SUPABASE_KEY else '❌ 누락'}")
print(f"GROQ: {'✅ 로드됨' if GROQ_API_KEY else '❌ 누락'}")
print(f"--------------------------")

if not all([SUPABASE_URL, SUPABASE_KEY, GROQ_API_KEY]):
    raise ValueError("❌ 환경 변수 중 일부가 누락되었습니다. .env 파일을 다시 확인하세요.")

# [4] 클라이언트 초기화


# ... 이후 모델 설정 및 함수 코드 시작



# ... (나머지 모델 설정 및 함수들은 동일)
groq_client = Groq(api_key=GROQ_API_KEY)
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# 2. 평가용 모델(Judge) 및 임베딩 설정
# Groq Llama 3.3 모델 사용
evaluator_llm = ChatGroq(
    groq_api_key=GROQ_API_KEY,
    model_name="llama-3.3-70b-versatile",
    temperature=0
)

# 유사도 측정을 위한 무료 임베딩 모델 (AnswerRelevancy에 필수)
evaluator_embeddings = HuggingFaceEmbeddings(model_name="BAAI/bge-small-en-v1.5")

# 3. Ragas 메트릭 인스턴스 생성
# 최신 버전 규칙에 따라 인스턴스를 생성하여 리스트에 담습니다.
metrics = [
    Faithfulness(),
    AnswerRelevancy(embeddings=evaluator_embeddings),
    AnswerCorrectness()
]

def generate_gold_standard(context):
    """
    [우리 역할] 문서를 기반으로 질문과 모범 답안 생성
    """
    prompt = f"""
    아래 [Context]를 바탕으로 질문 하나와 그에 대한 정확한 모범 답안을 만드세요.
    결과는 반드시 아래의 JSON 형식으로만 출력하세요.
    {{ "question": "질문 내용", "ground_truth": "모범 답안 내용" }}

    [Context]: {context}
    """
    completion = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"}
    )
    return json.loads(completion.choices[0].message.content)

def run_ragas_comparison(question, opponent_answer, opponent_contexts, gold_truth):
    """
    [평가 단계] 상대방의 응답 데이터를 받아 Ragas 점수 산출
    """
    # Ragas 전용 데이터셋 생성
    data_dict = {
        "question": [question],
        "answer": [opponent_answer],
        "contexts": [opponent_contexts],
        "ground_truth": [gold_truth]
    }
    dataset = Dataset.from_dict(data_dict)

    # 평가 실행
    result = evaluate(
        dataset=dataset,
        metrics=metrics,
        llm=evaluator_llm,
        embeddings=evaluator_embeddings
    )
    
    return result.to_pandas().iloc[0].to_dict()

def run_project_flow():
    try:
        # [데이터 예시] 상대방이 제공한 문서
        raw_context = "수원 화성은 1796년에 완공되었으며, 정약용이 설계한 거중기가 사용되었습니다."

        # STEP 1: 우리 쪽에서 골드 데이터(질문/정답) 생성
        print("💡 [우리] 질문과 모범 답안(Gold Standard) 생성 중...")
        gold_data = generate_gold_standard(raw_context)
        question = gold_data["question"]
        gold_truth = gold_data["ground_truth"]

        # STEP 2: 상대방 답변 시뮬레이션 (실제로는 상대방 모델 결과값을 받아와야 함)
        print("🤖 [상대방] 답변 생성 중 (시뮬레이션)...")
        opponent_answer = "화성은 정약용의 거중기를 이용해 1796년에 지어졌습니다."
        opponent_contexts = ["화성 완공 시기는 1796년이다.", "거중기는 정약용이 만들었다."]

        # STEP 3: Ragas 평가 수행
        print("📊 [Ragas] 상대방 모델 품질 평가 시작...")
        eval_result = run_ragas_comparison(
            question, 
            opponent_answer, 
            opponent_contexts, 
            gold_truth
        )

        # STEP 4: 결과 정리 및 Supabase 저장
        # 결과 딕셔너리의 키값은 소문자로 들어옵니다.
        final_report = {
            "question": question,
            "gold_truth": gold_truth,
            "opponent_answer": opponent_answer,
            "faithfulness": float(eval_result.get("faithfulness", 0)),
            "answer_relevancy": float(eval_result.get("answer_relevancy", 0)),
            "answer_correctness": float(eval_result.get("answer_correctness", 0)),
        }

        # Supabase 'model_evaluations' 테이블에 저장
        supabase.table("model_evaluations").insert(final_report).execute()
        
        print("\n" + "="*50)
        print(f"🎯 생성 질문: {question}")
        print(f"✅ 우리 정답: {gold_truth}")
        print(f"📝 상대방 답변: {opponent_answer}")
        print(f"⭐ 충실도(Faithfulness): {final_report['faithfulness']:.4f}")
        print(f"⭐ 정답 유사도(Correctness): {final_report['answer_correctness']:.4f}")
        print("🎉 모든 평가 프로세스가 완료되어 Supabase에 저장되었습니다.")

    except Exception as e:
        print(f"❌ 실행 중 오류 발생: {e}")

if __name__ == "__main__":
    run_project_flow()