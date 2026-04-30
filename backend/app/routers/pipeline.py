import os
import json
import fitz  # PyMuPDF
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from groq import Groq
from app.services.supabase_client import supabase_client 

router = APIRouter()

<<<<<<< HEAD
=======
# API Key 설정
>>>>>>> feature/rag-eval-fix
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
groq_client = Groq(api_key=GROQ_API_KEY)

DTYPE_STYLES = {
    "pdf": {"color": "#b91c1c", "bg": "#fef2f2"},
    "txt": {"color": "#1d4ed8", "bg": "#eff6ff"},
    "md":  {"color": "#1d4ed8", "bg": "#eff6ff"},
}


class PipelineRequest(BaseModel):
<<<<<<< HEAD
    saved_filename: str
    original_filename: str


def clean_and_parse_json(raw_content):
    try:
=======
    saved_filename: str    # Supabase Storage 저장 파일명 (UUID)
    original_filename: str # 원본 파일명

def clean_and_parse_json(raw_content):
    try:
        # Groq 응답에서 마크다운 태그 제거 후 JSON 파싱
>>>>>>> feature/rag-eval-fix
        cleaned = raw_content.replace("```json", "").replace("```", "").strip()
        return json.loads(cleaned)
    except Exception:
        return None


def generate_qa_with_groq(context: str):
    prompt = (
        f"다음 문맥을 바탕으로 질문과 답변을 한 쌍의 JSON 형식으로 만들어줘. "
        f"결과는 반드시 {{'question': '...', 'answer': '...'}} 형식이어야 해. \n\n[Context]: {context}"
    )
    completion = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"}
    )
    return completion.choices[0].message.content

<<<<<<< HEAD
=======
# RAGAS 평가 함수 (만약 별도 모듈에 있다면 import 하세요)
def evaluate_qa_quality(context, question, ground_truth):
    # 실제 RAGAS 로직 연결 전까지 임시 점수(Stub) 반환
    # 나중에 실제 평가 로직으로 교체하세요.
    return {
        "faithfulness": 0.85,
        "answer_relevancy": 0.82
    }
>>>>>>> feature/rag-eval-fix

@router.post("/pipeline/run")
async def run_pipeline(req: PipelineRequest):
    try:
        # 1. Supabase Storage에서 파일 다운로드
        file_bytes = supabase_client.storage.from_("documents").download(req.saved_filename)
        if not file_bytes:
            raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다.")

        # 2. 텍스트 추출
        ext = req.original_filename.rsplit(".", 1)[-1].lower()
        extracted_text = ""

        if ext == "pdf":
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            for page in doc:
                extracted_text += page.get_text()
        else:
            extracted_text = file_bytes.decode("utf-8")

<<<<<<< HEAD
        # 3. DB documents 테이블 기록
        doc_insert_res = supabase_client.table("documents").insert({
            "content": extracted_text[:5000],
=======
        # 3. DB documents 테이블에 기록
        doc_insert_res = supabase_client.table("documents").insert({
            "content": extracted_text[:5000], 
>>>>>>> feature/rag-eval-fix
            "original_filename": req.original_filename,
            "status": "처리중"
        }).execute()

        document_id = doc_insert_res.data[0]["id"]

        # 4. 청킹 (1000자 단위)
        chunk_size = 1000
        chunks = [extracted_text[i:i + chunk_size] for i in range(0, len(extracted_text), chunk_size)]

<<<<<<< HEAD
        # 5. LLM Q&A 생성 및 RAGAS 평가 (테스트용 상위 3개 청크)
        qa_pairs = []
        for chunk in chunks[:3]:
=======
        # 5. LLM Q&A 생성 및 실시간 평가
        qa_pairs = []
        # 테스트를 위해 상위 3개 청크만 진행
        for chunk in chunks[:3]: 
>>>>>>> feature/rag-eval-fix
            raw_res = generate_qa_with_groq(chunk)
            qa_data = clean_and_parse_json(raw_res)

            if qa_data and "question" in qa_data:
<<<<<<< HEAD
=======
                # RAGAS 평가 호출
>>>>>>> feature/rag-eval-fix
                score_data = evaluate_qa_quality(
                    context=chunk,
                    question=qa_data["question"],
                    ground_truth=qa_data["answer"]
                )

                insert_data = {
                    "document_id": document_id,
                    "question": qa_data.get("question"),
                    "ground_truth": qa_data.get("answer"),
                    "context": chunk
                }
<<<<<<< HEAD

=======
                
                # DB에 인서트하고 생성된 ID(UUID)를 가져옴
>>>>>>> feature/rag-eval-fix
                qa_insert_res = supabase_client.table("qa_evaluations").insert(insert_data).execute()

                if qa_insert_res.data:
                    qa_data["db_id"] = qa_insert_res.data[0]["id"]
                    qa_data["score_data"] = score_data
                    qa_pairs.append(qa_data)

        # 6. 상태 업데이트 및 최종 반환
        supabase_client.table("documents").update({"status": "완료"}).eq("id", document_id).execute()

        style = DTYPE_STYLES.get(ext, {"color": "#475569", "bg": "#f8fafc"})

        final_results = []
        for i, qa in enumerate(qa_pairs, start=1):
            s = qa["score_data"]
            avg_score = round((s["faithfulness"] + s["answer_relevancy"]) / 2, 2)

            final_results.append({
                "index": i,
<<<<<<< HEAD
                "qa_uuid": qa.get("db_id"),
                "document_uuid": document_id,
=======
                "qa_uuid": qa.get("db_id"), 
                "document_uuid": document_id, 
>>>>>>> feature/rag-eval-fix
                "q": qa["question"],
                "doc": req.original_filename,
                "dtype": ext,
                "color": style["color"],
                "bg": style["bg"],
                "answer": qa["answer"],
                "score": avg_score,
                "faithfulness": round(s["faithfulness"], 2),
                "answer_relevancy": round(s["answer_relevancy"], 2)
            })

        return final_results

    except HTTPException:
        raise
    except Exception as e:
<<<<<<< HEAD
        print(f"Pipeline Error: {str(e)}")
=======
        print(f"Error: {str(e)}") 
>>>>>>> feature/rag-eval-fix
        raise HTTPException(status_code=500, detail=f"파이프라인 실행 중 오류 발생: {str(e)}")