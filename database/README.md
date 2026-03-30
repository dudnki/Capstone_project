# 🗄️ RAG 평가 데이터셋 파이프라인 DB 명세서

본 문서는 Supabase(PostgreSQL) 기반의 데이터베이스 스키마 구조를 설명합니다.
**담당자: 김민철**

## 1. `documents` (원천 문서 및 상태 관리)
사용자가 입력한 원본 텍스트를 저장하고 전체 처리 공정을 추적합니다.
* `id` (UUID): 문서 고유 식별자 (PK)
* `content` (Text): 원본 문서 내용
* `status` (Varchar): 처리 상태 (대기중 / 처리중 / 완료 / 에러)
* `created_at`: 생성 일시

## 2. `chunks` (텍스트 청크 및 벡터)
RAG 검색을 위해 쪼개진 텍스트 조각과 임베딩 값을 저장합니다.
* `document_id` (UUID): 부모 문서 참조 (FK)
* `chunk_text` (Text): 쪼개진 텍스트 내용
* `embedding` (Vector): 1536차원 벡터 데이터 (OpenAI 기준)

## 3. `qa_evaluations` (평가 결과 대시보드용)
생성된 Q&A 쌍과 Ragas 기반 신뢰성 지표 점수를 보관합니다.
* `question` / `answer` / `context`: 생성된 Q&A 세트
* `faithfulness_score` (Float): 충실성 점수
* `answer_relevance_score` (Float): 답변 관련성 점수
* `context_precision_score` (Float): 문맥 정밀도 점수