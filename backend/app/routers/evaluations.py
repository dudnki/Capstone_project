from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
import pandas as pd
import os

from app.services.database import get_db, Document, QAEvaluation
from app.services.ragas_eval import (
    evaluate_user_document,
    evaluate_model_document,
    generate_question_feedback,
    generate_overall_feedback,
)

router = APIRouter()

UPLOAD_DIR = "uploaded_pdf"


class FileSubmitRequest(BaseModel):
    saved_filename:    str
    original_filename: str
    document_id:       str
    mode:              str = "model"  # "model" | "human"


# ─────────────────────────────────────────────────────────
# 1. 학생 답변 제출 및 채점 API
# ─────────────────────────────────────────────────────────
@router.post("/evaluations/submit")
def submit_student_answers(
    req: FileSubmitRequest,
    db: Session = Depends(get_db),
):
    try:
        # ── STEP 1. 문서 컨텍스트 가져오기 ─────────────────────
        doc = db.query(Document).filter(Document.id == req.document_id).first()
        if not doc:
            raise HTTPException(
                status_code=404,
                detail=f"문서를 찾을 수 없습니다. (document_id={req.document_id})"
            )
        raw_context = doc.content

        # ── STEP 2. 업로드된 파일 읽기 ──────────────────────────
        file_path = os.path.join(UPLOAD_DIR, req.saved_filename)
        if not os.path.exists(file_path):
            raise HTTPException(
                status_code=404,
                detail=f"업로드된 파일을 찾을 수 없습니다. (경로={file_path})"
            )

        # 한글/영문 컬럼명 → 표준 컬럼명 변환
        KOREAN_COL_MAP = {
            "답안": "answer", "답변": "answer", "정답": "answer",
            "질문": "question", "문제": "question",
        }

        def normalize_columns(frame: pd.DataFrame) -> pd.DataFrame:
            col_rename = {}
            for col in frame.columns:
                stripped = col.strip()
                if stripped in KOREAN_COL_MAP:
                    col_rename[col] = KOREAN_COL_MAP[stripped]
                    continue
                for target in ["qa_id", "question", "answer"]:
                    if stripped != target and stripped.lower().endswith(target):
                        col_rename[col] = target
                        break
            return frame.rename(columns=col_rename) if col_rename else frame

        ext = os.path.splitext(req.original_filename)[-1].lower()
        if ext == ".csv":
            df = None
            detected_cols = {}
            for sep in [",", ";", "\t"]:
                try:
                    tmp = pd.read_csv(
                        file_path,
                        encoding="utf-8-sig",
                        sep=sep,
                        engine="python",
                        on_bad_lines="warn",
                    )
                    tmp = normalize_columns(tmp)
                    detected_cols[repr(sep)] = tmp.columns.tolist()
                    print(f"[DEBUG CSV] sep={repr(sep)}, columns={tmp.columns.tolist()}")
                    if {"qa_id", "answer"}.issubset(set(tmp.columns)):
                        df = tmp
                        break
                except Exception as e:
                    print(f"[DEBUG CSV] sep={repr(sep)}, error={e}")
                    continue
            if df is None:
                raise HTTPException(
                    status_code=422,
                    detail=f"CSV 파일에서 qa_id, answer 컬럼을 찾을 수 없습니다. 감지된 컬럼: {detected_cols}",
                )
        elif ext in [".xlsx", ".xls"]:
            df = normalize_columns(pd.read_excel(file_path))
            if not {"qa_id", "answer"}.issubset(set(df.columns)):
                raise HTTPException(
                    status_code=422,
                    detail=f"파일에서 qa_id, answer 컬럼을 찾을 수 없습니다. 감지된 컬럼: {df.columns.tolist()}",
                )
        else:
            raise HTTPException(
                status_code=400,
                detail="지원하지 않는 파일 형식 (csv, xlsx만 지원)"
            )

        print(f"[DEBUG] 파일 컬럼: {df.columns.tolist()}")
        print(f"[DEBUG] 파일 행 수: {len(df)}")

        # ── STEP 3. 필수 컬럼 검증 ──────────────────────────────
        required_columns = {"qa_id", "answer"}
        missing = required_columns - set(df.columns)
        if missing:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"파일에 필수 컬럼이 없습니다: {', '.join(missing)} | "
                    f"현재 컬럼: {', '.join(df.columns.tolist())}"
                )
            )

        # ── STEP 4. 행별 채점 ────────────────────────────────────
        results = []

        for _, row in df.iterrows():
            qa_id       = str(row["qa_id"]).strip()
            user_answer = str(row["answer"]).strip()

            db_qa = db.query(QAEvaluation).filter(QAEvaluation.id == qa_id).first()
            if not db_qa:
                print(f"[WARN] qa_id={qa_id} DB에 없음, 스킵")
                continue

            # ── 채점 호출 (모드에 따라 분기) ─────────────────────
            eval_context = db_qa.context if db_qa.context else raw_context
            if req.mode == "human":
                report = evaluate_user_document(
                    context=eval_context,
                    question=db_qa.question,
                    ground_truth=db_qa.ground_truth,
                    user_answer=user_answer,
                )
            else:
                report = evaluate_model_document(
                    context=eval_context,
                    question=db_qa.question,
                    ground_truth=db_qa.ground_truth,
                    answer=user_answer,
                )

            faithfulness_score       = report.get("faithfulness",       0.0)
            answer_relevance_score   = report.get("answer_relevancy",   0.0)
            correctness_score        = report.get("answer_correctness", 0.0)

            avg_score = report.get("avg_score", round(
                (faithfulness_score + answer_relevance_score + correctness_score) / 3, 4
            ))

            # ── 문항별 피드백 생성 (사용자 평가만) ───────────────
            if req.mode == "human":
                scores_for_feedback = {
                    "faithfulness":       faithfulness_score,
                    "answer_relevancy":   answer_relevance_score,
                    "answer_correctness": correctness_score,
                    "avg_score":          avg_score,
                }
                feedback = generate_question_feedback(
                    question=db_qa.question,
                    user_answer=user_answer,
                    ground_truth=db_qa.ground_truth,
                    scores=scores_for_feedback,
                )
            else:
                feedback = None

            # ── DB 저장 ──────────────────────────────────────────
            db_qa.user_answer            = user_answer
            db_qa.faithfulness_score     = faithfulness_score
            db_qa.answer_relevance_score = answer_relevance_score
            db_qa.correctness_score      = correctness_score
            if hasattr(db_qa, "similarity_score"):
                db_qa.similarity_score   = 0.0

            db.commit()
            db.refresh(db_qa)

            print(
                f"[INFO] qa_id={qa_id} | "
                f"faith={faithfulness_score:.2f} | "
                f"rel={answer_relevance_score:.2f} | "
                f"corr={correctness_score:.2f} | "
                f"avg={avg_score:.2f}"
            )

            row_data = {
                "qa_id":    qa_id,
                "question": db_qa.question,
                "answer":   user_answer,
                "scores": {
                    "faithfulness":       faithfulness_score,
                    "answer_relevancy":   answer_relevance_score,
                    "answer_correctness": correctness_score,
                },
                "avg_score": avg_score,
            }
            if feedback:
                row_data["feedback"] = feedback

            results.append(row_data)

        if not results:
            raise HTTPException(
                status_code=422,
                detail="채점 가능한 데이터가 없습니다. qa_id가 DB와 일치하는지 확인하세요."
            )

        # ── STEP 5. 요약 통계 ────────────────────────────────────
        total       = len(results)
        overall_avg = round(sum(r["avg_score"] for r in results) / total, 4)

        summary = {
            "evaluatedCount":    total,
            "overallAvgScore":   overall_avg,
            "faithfulness":      round(
                sum(r["scores"]["faithfulness"]       for r in results) / total, 4
            ),
            "answerRelevancy":   round(
                sum(r["scores"]["answer_relevancy"]   for r in results) / total, 4
            ),
            "answerCorrectness": round(
                sum(r["scores"]["answer_correctness"] for r in results) / total, 4
            ),
        }

        if req.mode == "human":
            overall_feedback = generate_overall_feedback(results)
            summary["overallFeedback"] = overall_feedback

        print(f"[INFO] 전체 요약: {summary}")

        return {
            "success": True,
            "summary": summary,
            "rows":    results,
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] Submit Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"제출 처리 실패: {str(e)}")


# ─────────────────────────────────────────────────────────
# 2. 히스토리 목록 조회
# ─────────────────────────────────────────────────────────
@router.get("/evaluations")
def get_evaluations_list(db: Session = Depends(get_db)):
    try:
        docs = db.query(Document).order_by(Document.created_at.desc()).all()
        return {
            "success": True,
            "data": [
                {
                    "id":         str(d.id),
                    "status":     d.status,
                    "created_at": d.created_at,
                    "filename":   d.original_filename,
                }
                for d in docs
            ],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"히스토리 조회 실패: {str(e)}")


# ─────────────────────────────────────────────────────────
# 3. 특정 평가 상세 조회
# ─────────────────────────────────────────────────────────
@router.get("/evaluations/{document_id}")
def get_evaluation_detail(
    document_id: str,
    db: Session = Depends(get_db),
):
    try:
        doc     = db.query(Document).filter(Document.id == document_id).first()
        qa_list = db.query(QAEvaluation).filter(
            QAEvaluation.document_id == document_id
        ).all()

        if not doc:
            raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")

        return {
            "success":       True,
            "document_info": doc,
            "qa_details":    qa_list,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"데이터 조회 실패: {str(e)}")