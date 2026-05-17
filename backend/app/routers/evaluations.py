from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
import pandas as pd
import os
import re
import io

from app.services.database import get_db, Document, QAEvaluation
from app.services.ragas_eval import evaluate_user_document, generate_question_feedback, generate_overall_feedback

router = APIRouter()


def _fix_csv_newlines(content: str) -> str:
    """줄바꿈 없이 이어진 CSV 행을 수정합니다.
    예: ...답변.""2","다음질문"... → ...답변."↵"2","다음질문"...
    """
    return re.sub(r'""(\d+)","', '"\n"\\1","', content)

UPLOAD_DIR = "uploaded_pdf"


class FileSubmitRequest(BaseModel):
    saved_filename:    str
    original_filename: str
    document_id:       str


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

        ext = os.path.splitext(req.original_filename)[-1].lower()
        if ext == ".csv":
            df = None

            # 줄바꿈 없이 이어진 CSV 행 전처리
            with open(file_path, "r", encoding="utf-8-sig", errors="replace") as _f:
                _raw = _f.read()
            _fixed = _fix_csv_newlines(_raw)
            if _fixed != _raw:
                print(f"[DEBUG CSV] 줄바꿈 자동 수정 적용됨")
            _csv_source = io.StringIO(_fixed)

            # 시도 1: 헤더 있는 CSV (qa_id, answer 컬럼명 명시)
            for sep in [",", ";", "\t"]:
                try:
                    _csv_source.seek(0)
                    tmp = pd.read_csv(
                        _csv_source,
                        sep=sep,
                        engine="python",
                        on_bad_lines="warn",
                    )
                    _KO_MAP = {"번호": "qa_id", "문제": "question", "질문": "question", "답안": "answer", "답변": "answer"}
                    col_rename = {}
                    for col in tmp.columns:
                        if col in _KO_MAP:
                            col_rename[col] = _KO_MAP[col]
                        else:
                            for target in ["qa_id", "question", "answer"]:
                                if col != target and col.lower().endswith(target):
                                    col_rename[col] = target
                                    break
                    if col_rename:
                        tmp = tmp.rename(columns=col_rename)
                    print(f"[DEBUG CSV] sep={repr(sep)}, columns={tmp.columns.tolist()}")
                    if {"qa_id", "answer"}.issubset(set(tmp.columns)):
                        df = tmp
                        break
                except Exception as e:
                    print(f"[DEBUG CSV] sep={repr(sep)}, error={e}")

            # 시도 2: 헤더 없는 CSV — 위치 기반으로 컬럼 자동 매핑
            # 지원 형식:
            #   (qa_id, answer)               — 2컬럼
            #   (index, question, answer)     — 3컬럼 (순번, 질문, 답변)
            if df is None:
                for sep in [",", ";", "\t"]:
                    try:
                        _csv_source.seek(0)
                        tmp = pd.read_csv(
                            _csv_source,
                            sep=sep,
                            engine="python",
                            header=None,
                            on_bad_lines="warn",
                        )
                        n_cols = len(tmp.columns)
                        if n_cols >= 3:
                            tmp = tmp.iloc[:, :3]
                            tmp.columns = ["qa_id", "question", "answer"]
                        elif n_cols == 2:
                            tmp.columns = ["qa_id", "answer"]
                        else:
                            continue
                        print(f"[DEBUG CSV] no-header mode, sep={repr(sep)}, shape={tmp.shape}")
                        df = tmp
                        break
                    except Exception as e:
                        print(f"[DEBUG CSV] no-header sep={repr(sep)}, error={e}")

            if df is None:
                raise HTTPException(
                    status_code=422,
                    detail=(
                        "CSV를 파싱할 수 없습니다. "
                        "지원 형식: (1) 헤더 포함 — qa_id,answer  "
                        "(2) 헤더 없음 — 순번,질문,답변  또는  qa_id,답변"
                    ),
                )
        elif ext in [".xlsx", ".xls"]:
            df = pd.read_excel(file_path)
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

        # 순번 조회를 위해 문서의 QA 목록을 미리 로드 (생성 순서대로)
        doc_qa_list = (
            db.query(QAEvaluation)
            .filter(QAEvaluation.document_id == req.document_id)
            .order_by(QAEvaluation.created_at)
            .all()
        )

        for _, row in df.iterrows():
            qa_id       = str(row["qa_id"]).strip()
            raw_answer  = row["answer"]
            user_answer = "" if (raw_answer is None or str(raw_answer).strip().lower() in ("nan", "none", "")) else str(raw_answer).strip()

            # UUID로 직접 조회 시도
            db_qa = db.query(QAEvaluation).filter(QAEvaluation.id == qa_id).first()

            # UUID 조회 실패 시 순번(1-based)으로 재시도
            if not db_qa:
                try:
                    idx = int(float(qa_id)) - 1  # "1" → 0번 인덱스
                    if 0 <= idx < len(doc_qa_list):
                        db_qa = doc_qa_list[idx]
                        print(f"[INFO] qa_id={qa_id} → 순번 {idx+1}번 Q&A로 매핑")
                except (ValueError, TypeError):
                    pass

            if not db_qa:
                print(f"[WARN] qa_id={qa_id} DB에 없음, 스킵")
                continue

            # ── RAGAS 채점 호출 ──────────────────────────────────
            # 질문이 생성된 청크를 우선 사용 (없으면 문서 전체로 폴백)
            eval_context = db_qa.context if db_qa.context else raw_context
            report = evaluate_user_document(
                context=eval_context,
                question=db_qa.question,
                ground_truth=db_qa.ground_truth,
                user_answer=user_answer,
            )

            # ✅ 수정: 3개 메트릭만 저장 (answer_similarity 제거)
            faithfulness_score       = report.get("faithfulness",       0.0)
            answer_relevance_score   = report.get("answer_relevancy",   0.0)
            correctness_score        = report.get("answer_correctness", 0.0)

            # ✅ 수정: avg_score 는 ragas_eval.py 에서 직접 반환
            avg_score = report.get("avg_score", round(
                (faithfulness_score + answer_relevance_score + correctness_score) / 3, 4
            ))

            # ── 문항별 피드백 생성 ────────────────────────────────
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

            # ── DB 저장 ──────────────────────────────────────────
            import json as _json
            db_qa.user_answer            = user_answer
            db_qa.faithfulness_score     = faithfulness_score
            db_qa.answer_relevance_score = answer_relevance_score
            db_qa.correctness_score      = correctness_score
            db_qa.feedback               = _json.dumps(feedback, ensure_ascii=False)
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

            results.append({
                "qa_id":    qa_id,
                "question": db_qa.question,
                "answer":   user_answer,
                "scores": {
                    "faithfulness":       faithfulness_score,
                    "answer_relevancy":   answer_relevance_score,
                    "answer_correctness": correctness_score,
                },
                "avg_score": avg_score,
                "feedback":  feedback,
            })

        if not results:
            raise HTTPException(
                status_code=422,
                detail="채점 가능한 데이터가 없습니다. qa_id가 DB와 일치하는지 확인하세요."
            )

        # ── STEP 5. 요약 통계 ────────────────────────────────────
        total       = len(results)
        overall_avg = round(sum(r["avg_score"] for r in results) / total, 4)

        # ✅ 수정: 3개 메트릭 기준 요약 (answerSimilarity 제거)
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
