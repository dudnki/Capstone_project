import os
import json
import fitz  # PyMuPDF
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from groq import Groq

# 🔥 우리가 새로 만든 로컬 DB 구조를 불러옵니다.
from app.services.database import get_db, Document, QAEvaluation
from dotenv import load_dotenv

load_dotenv()  # .env 파일 로드

router = APIRouter()

# API Key 설정
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
groq_client = Groq(api_key=GROQ_API_KEY)

DTYPE_STYLES = {
    "pdf": {"color": "#b91c1c", "bg": "#fef2f2"},
    "txt": {"color": "#1d4ed8", "bg": "#eff6ff"},
    "md":  {"color": "#1d4ed8", "bg": "#eff6ff"},
}

class PipelineRequest(BaseModel):
    saved_filename: str    # 로컬 폴더에 저장된 파일명
    original_filename: str # 원본 파일명

def clean_and_parse_json(raw_content):
    try:
        # Groq 응답에서 마크다운 태그 제거 후 JSON 파싱
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

# RAGAS 평가 함수 (팀원 분이 남겨둔 임시 로직 유지)
def evaluate_qa_quality(context, question, ground_truth):
    # 실제 RAGAS 로직 연결 전까지 임시 점수(Stub) 반환
    return {
        "faithfulness": 0.85,
        "answer_relevancy": 0.82
    }

# 🔥 파일이 저장되어 있는 로컬 폴더 경로
UPLOAD_DIR = "uploaded_pdf"

# FastAPI 라우터에 DB 의존성(Depends) 추가
@router.post("/pipeline/run")
async def run_pipeline(req: PipelineRequest, db: Session = Depends(get_db)):
    try:
        # 1. 로컬 폴더에서 파일 읽어오기 (Supabase 다운로드 완벽 대체)
        file_path = os.path.join(UPLOAD_DIR, req.saved_filename)
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="로컬 폴더에서 파일을 찾을 수 없습니다.")
            
        with open(file_path, "rb") as f:
            file_bytes = f.read()

        # 2. 텍스트 추출
        ext = req.original_filename.rsplit(".", 1)[-1].lower()
        extracted_text = ""

        if ext == "pdf":
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            for page in doc:
                extracted_text += page.get_text()
        else:
            extracted_text = file_bytes.decode("utf-8")

        # 3. 로컬 DB (SQLite) documents 테이블에 기록
        new_doc = Document(
            original_filename=req.original_filename,
            content=extracted_text[:5000],
            status="처리중"
        )
        db.add(new_doc)
        db.commit()
        db.refresh(new_doc)
        document_id = new_doc.id

        # 4. 청킹 (1000자 단위)
        chunk_size = 1000
        chunks = [extracted_text[i:i + chunk_size] for i in range(0, len(extracted_text), chunk_size)]

        # 5. LLM Q&A 생성 및 실시간 평가 (테스트용 상위 3개 청크)
        qa_pairs = []
        for chunk in chunks[:3]:
            raw_res = generate_qa_with_groq(chunk)
            qa_data = clean_and_parse_json(raw_res)

            if qa_data and "question" in qa_data:
                # RAGAS 평가 호출
                score_data = evaluate_qa_quality(
                    context=chunk,
                    question=qa_data["question"],
                    ground_truth=qa_data["answer"]
                )

                # 로컬 DB qa_evaluations 테이블에 결과 저장
                new_qa = QAEvaluation(
                    document_id=document_id,
                    question=qa_data.get("question"),
                    ground_truth=qa_data.get("answer"),
                    context=chunk,
                    faithfulness_score=score_data.get("faithfulness"),
                    answer_relevance_score=score_data.get("answer_relevancy")
                )
                db.add(new_qa)
                db.commit()
                db.refresh(new_qa)

                qa_data["db_id"] = new_qa.id
                qa_data["score_data"] = score_data
                qa_pairs.append(qa_data)

        # 6. 상태 업데이트 및 최종 반환
        new_doc.status = "완료"
        db.commit()

        style = DTYPE_STYLES.get(ext, {"color": "#475569", "bg": "#f8fafc"})

        final_results = []
        for i, qa in enumerate(qa_pairs, start=1):
            s = qa["score_data"]
            avg_score = round((s["faithfulness"] + s["answer_relevancy"]) / 2, 2)

            final_results.append({
                "index": i,
                "qa_uuid": qa.get("db_id"),
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

    except HTTPException:
        raise
    except Exception as e:
        print(f"Pipeline Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"파이프라인 실행 중 오류 발생: {str(e)}")