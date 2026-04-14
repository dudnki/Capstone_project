import os
import json
import fitz  # PyMuPDF
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from groq import Groq  # 추가됨
from app.services.supabase import supabase_client 

router = APIRouter()

# API Key는 환경변수에서 가져오는 것을 권장합니다.
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
groq_client = Groq(api_key=GROQ_API_KEY)

DTYPE_STYLES = {
    "pdf":   {"color": "#b91c1c", "bg": "#fef2f2"},
    "txt":   {"color": "#1d4ed8", "bg": "#eff6ff"},
    "md":    {"color": "#1d4ed8", "bg": "#eff6ff"},
}

class PipelineRequest(BaseModel):
    saved_filename: str    # Supabase Storage 저장 파일명 (UUID)
    original_filename: str # 원본 파일명

def clean_and_parse_json(raw_content):
    try:
        # Groq이 JSON 모드로 응답하더라도 간혹 앞뒤에 ```json 같은 마크다운이 붙을 수 있음 처리
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

        # 3. DB 장부(documents 테이블)에 문서 기록 먼저 남기기
        doc_insert_res = supabase_client.table("documents").insert({
            "content": extracted_text[:5000], # 너무 길면 잘라서 저장 (DB 용량 고려)
            "original_filename": req.original_filename,
            "status": "처리중"
        }).execute()
        
        document_id = doc_insert_res.data[0]["id"]

        # 4. 청킹 (1000자 단위)
        chunk_size = 1000
        chunks = [extracted_text[i:i+chunk_size] for i in range(0, len(extracted_text), chunk_size)]

        # 5. LLM Q&A 생성 및 저장
        qa_pairs = []
        for chunk in chunks[:5]: # 테스트용 5개 제한
            raw_res = generate_qa_with_groq(chunk)
            qa_data = clean_and_parse_json(raw_res)
            
            if qa_data and "question" in qa_data:
                insert_data = {
                    "question": qa_data.get("question"),
                    "answer": qa_data.get("answer"),
                    "context": chunk,
                    "original_file": req.original_filename
                    # "document_id": document_id # 외래키 연결이 되어있다면 추가하세요
                }
                supabase_client.table("qa_evaluations").insert(insert_data).execute()
                qa_pairs.append(qa_data)

        # 6. RAGAS 평가 (Stub)
        ragas_scores = [{"faithfulness": 0.8, "answer_relevancy": 0.8, "context_precision": 0.8} for _ in qa_pairs]

        # 7. 상태 업데이트 및 결과 반환
        supabase_client.table("documents").update({"status": "완료"}).eq("id", document_id).execute()
        
        style = DTYPE_STYLES.get(ext, {"color": "#475569", "bg": "#f8fafc"})
        return _build_response(qa_pairs, ragas_scores, req.original_filename, ext, style)

    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Error: {str(e)}") # 디버깅용 로그
        raise HTTPException(status_code=500, detail=f"파이프라인 실행 중 오류 발생: {str(e)}")

def _build_response(qa_pairs, ragas_scores, original_filename, ext, style):
    results = []
    for i, (qa, scores) in enumerate(zip(qa_pairs, ragas_scores), start=1):
        faithfulness      = scores.get("faithfulness", 0)
        answer_relevancy  = scores.get("answer_relevancy", 0)
        context_precision = scores.get("context_precision", 0)
        avg_score = round((faithfulness + answer_relevancy + context_precision) / 3, 2)

        results.append({
            "id":                i,
            "q":                 qa["question"],
            "doc":               original_filename,
            "dtype":             ext,
            "color":             style["color"],
            "bg":                style["bg"],
            "answer":            qa["answer"],
            "score":             avg_score,
            "faithfulness":      round(faithfulness, 2),
            "answer_relevancy":  round(answer_relevancy, 2),
            "context_precision": round(context_precision, 2),
        })
    return results