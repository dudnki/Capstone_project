## 1. `documents` (원천 문서 및 상태 관리)
사용자가 입력한 원본 텍스트를 저장하고 전체 처리 공정을 추적합니다.
* `id` (UUID): 문서 고유 식별자 (PK)
* `original_filename` (Varchar): 사용자가 업로드한 원본 파일명 (프론트엔드 목록 표시용)
* `content` (Text): 원본 문서 내용
* `status` (Varchar): 처리 상태 (대기중 / 처리중 / 완료 / 에러)
* `created_at`: 생성 일시

## 2. `chunks` (텍스트 청크 및 벡터)
RAG 검색을 위해 쪼개진 텍스트 조각과 임베딩 값을 저장합니다.
* `document_id` (UUID): 부모 문서 참조 (FK)
* `chunk_text` (Text): 쪼개진 텍스트 내용
* `embedding` (Vector): 1536차원 벡터 데이터 (OpenAI 기준)

## 3. `qa_evaluations` (평가 결과 대시보드용)
생성된 Q&A 쌍과 사용자 답변, Ragas 기반 신뢰성 지표 점수를 보관합니다.
* `document_id` (UUID): 부모 문서 참조 (FK)
* `model_endpoint` (Varchar): 평가 대상 사용자 모델 식별자
* `question` (Text): 시스템이 문서에서 뽑아낸 질문
* `ground_truth` (Text): 시스템이 생성한 모범 답안
* `user_answer` (Text): 사용자가 본인 모델에서 가져온 답변
* `user_context` (Text): 사용자가 답변 시 참고한 문맥 (선택)
* `context` (Text): 시스템이 참고한 원본 문맥
* `faithfulness_score` / `answer_relevance_score` / `context_precision_score` (Float): Ragas 평가 점수