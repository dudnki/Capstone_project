import os
import json
import fitz  # PyMuPDF
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from groq import Groq
from app.services.supabase_client import supabase_client
from app.services.ragas_eval import evaluate_qa_quality

router = APIRouter()

GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
groq_client = Groq(api_key=GROQ_API_KEY)

DTYPE_STYLES = {
    "pdf":   {"color": "#b91c1c", "bg": "#fef2f2"},
    "txt":   {"color": "#1d4ed8", "bg": "#eff6ff"},
    "md":    {"color": "#1d4ed8", "bg": "#eff6ff"},
}

class PipelineRequest(BaseModel):
    saved_filename: str
    original_filename: str

def clean_and_parse_json(raw_content):
    try:
        cleaned = raw_content.replace("```json", "").replace("```", "").strip()
        return json.loads(cleaned)
    except Exception:
        return None

def generate_qa_with_groq(context: str):
    prompt = f"다음 문맥을 바탕으로 질문과 답변을 한 쌍의 JSON 형식으로 만들어줘. 결과는 반드시 {{'question': '...', 'answer': '...'}} 형식이어야 해. \n\n[Context]: {context}"
    completion = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"}
    )
    return completion.choices[0].message.content

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

        # 3. DB documents 테이블에 기록
        doc_insert_res = supabase_client.table("documents").insert({
            "content": extracted_text[:5000], 
            "original_filename": req.original_filename,
            "status": "처리중"
        }).execute()
        
        document_id = doc_insert_res.data[0]["id"]

        # 4. 청킹 (1000자 단위)
        chunk_size = 1000
        chunks = [extracted_text[i:i+chunk_size] for i in range(0, len(extracted_text), chunk_size)]

        # 5. LLM Q&A 생성 및 실시간 RAGAS 평가
        qa_pairs = []
        
        # 테스트를 위해 상위 3개 청크만 진행
        for chunk in chunks[:3]: 
            raw_res = generate_qa_with_groq(chunk)
            qa_data = clean_and_parse_json(raw_res)
            
            if qa_data and "question" in qa_data:
                # 🚀 RAGAS 평가 호출
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
                
                # ⭐ [핵심 수정] DB에 인서트하고 생성된 ID(UUID)를 가져옵니다.
                qa_insert_res = supabase_client.table("qa_evaluations").insert(insert_data).execute()
                
                if qa_insert_res.data:
                    # DB에서 할당해준 진짜 UUID를 qa_data에 저장
                    qa_data["db_id"] = qa_insert_res.data[0]["id"]
                    qa_data["score_data"] = score_data
                    qa_pairs.append(qa_data)

        # 6. 상태 업데이트 및 최종 반환 데이터 구성
        supabase_client.table("documents").update({"status": "완료"}).eq("id", document_id).execute()
        
        style = DTYPE_STYLES.get(ext, {"color": "#475569", "bg": "#f8fafc"})
        
        final_results = []
        for i, qa in enumerate(qa_pairs, start=1):
            s = qa["score_data"]
            avg_score = round((s["faithfulness"] + s["answer_relevancy"]) / 2, 2)
            
            final_results.append({
                "index": i,
                "qa_uuid": qa.get("db_id"),      # ⭐ 이제 null이 아니라 진짜 UUID가 들어갑니다.
                "document_uuid": document_id, 
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

    except Exception as e:
        print(f"Error: {str(e)}") 
        raise HTTPException(status_code=500, detail=f"파이프라인 실행 중 오류 발생: {str(e)}")