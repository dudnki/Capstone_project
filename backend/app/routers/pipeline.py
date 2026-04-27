import os
import json
import fitz
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from groq import Groq
from app.services.supabase_client import supabase_client 
from app.services.ragas_eval import evaluate_qa_quality

router = APIRouter()
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
groq_client = Groq(api_key=GROQ_API_KEY)

DTYPE_STYLES = {
    "pdf": {"color": "#b91c1c", "bg": "#fef2f2"},
    "txt": {"color": "#1d4ed8", "bg": "#eff6ff"},
    "md":  {"color": "#1d4ed8", "bg": "#eff6ff"},
}

class PipelineRequest(BaseModel):
    saved_filename: str
    original_filename: str

def clean_and_parse_json(raw_content):
    try:
        cleaned = raw_content.replace("```json", "").replace("```", "").strip()
        return json.loads(cleaned)
    except:
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

@router.post("/run")
async def run_pipeline(req: PipelineRequest):
    try:
        file_bytes = supabase_client.storage.from_("documents").download(req.saved_filename)
        if not file_bytes: raise HTTPException(status_code=404, detail="파일 없음")

        ext = req.original_filename.rsplit(".", 1)[-1].lower()
        extracted_text = ""
        if ext == "pdf":
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            for page in doc: extracted_text += page.get_text()
        else:
            extracted_text = file_bytes.decode("utf-8")

        # Document 기록
        doc_insert = supabase_client.table("documents").insert({
            "content": extracted_text[:5000],
            "original_filename": req.original_filename,
            "status": "처리중"
        }).execute()
        document_id = doc_insert.data[0]["id"]

        chunks = [extracted_text[i:i + 1000] for i in range(0, len(extracted_text), 1000)]
        qa_pairs = []

        for chunk in chunks[:3]:
            raw_res = generate_qa_with_groq(chunk)
            qa_data = clean_and_parse_json(raw_res)

            if qa_data and "question" in qa_data:
                # ⭐ 점수 계산 (에러 발생 시 내부적으로 0.0 반환하도록 보강됨)
                score_data = evaluate_qa_quality(chunk, qa_data["question"], qa_data["answer"])

                base_insert = {
                    "document_id": document_id,
                    "question": qa_data.get("question"),
                    "ground_truth": qa_data.get("answer"),
                    "context": chunk
                }
                
                full_scores = {
                    "faithfulness": score_data.get("faithfulness", 0.0),
                    "answer_relevancy": score_data.get("answer_relevancy", 0.0),
                    "answer_correctness": score_data.get("answer_correctness", 0.0),
                    "answer_similarity": score_data.get("answer_similarity", 0.0)
                }

                try:
                    qa_insert_res = supabase_client.table("qa_evaluations").insert({**base_insert, **full_scores}).execute()
                except Exception:
                    try:
                        alt = full_scores.copy()
                        alt["answer_relevance"] = alt.pop("answer_relevancy", 0.0)
                        qa_insert_res = supabase_client.table("qa_evaluations").insert({**base_insert, **alt}).execute()
                    except Exception:
                        qa_insert_res = supabase_client.table("qa_evaluations").insert(base_insert).execute()

                if qa_insert_res.data:
                    qa_data["db_id"] = qa_insert_res.data[0]["id"]
                    qa_data["score_data"] = score_data
                    qa_pairs.append(qa_data)

        supabase_client.table("documents").update({"status": "완료"}).eq("id", document_id).execute()

        style = DTYPE_STYLES.get(ext, {"color": "#475569", "bg": "#f8fafc"})
        final_results = []
        for i, qa in enumerate(qa_pairs, start=1):
            s = qa["score_data"]
            # 딕셔너리 안전 접근으로 에러 방지
            scores = [s.get(k, 0.0) for k in ["faithfulness", "answer_relevancy", "answer_correctness", "answer_similarity"]]
            avg_score = round(sum(scores) / len(scores), 2)

            final_results.append({
                "index": i, "qa_uuid": qa.get("db_id"), "document_uuid": document_id,
                "q": qa["question"], "doc": req.original_filename, "dtype": ext,
                "color": style["color"], "bg": style["bg"], "answer": qa["answer"],
                "score": avg_score,
                "faithfulness": round(s.get("faithfulness", 0.0), 2),
                "answer_relevancy": round(s.get("answer_relevancy", 0.0), 2),
                "answer_correctness": round(s.get("answer_correctness", 0.0), 2),
                "answer_similarity": round(s.get("answer_similarity", 2), 2)
            })
        return final_results

    except Exception as e:
        print(f"❌ Pipeline Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"파이프라인 실행 중 오류 발생: {str(e)}")