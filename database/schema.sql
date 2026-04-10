-- 1. pgvector 확장 활성화
create extension if not exists vector;

-- 2. 원천 문서 및 상태 관리 테이블
create table documents (
  id uuid primary key default uuid_generate_v4(),
  original_filename varchar(255),  -- 🔥 [추가됨] 프론트엔드 목록 조회 시 필요한 원본 파일명
  content text not null,
  status varchar(50) default '대기중',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. 텍스트 청크 및 벡터 저장 테이블
create table chunks (
  id uuid primary key default uuid_generate_v4(),
  document_id uuid references documents(id) on delete cascade,
  chunk_text text not null,
  embedding vector(1536)
);

-- 4. Q&A 쌍 및 Ragas 평가 지표 테이블
create table qa_evaluations (
  id uuid primary key default uuid_generate_v4(),
  document_id uuid references documents(id) on delete cascade,
  model_endpoint varchar(255),     -- 🔥 [추가됨] 어떤 모델을 평가했는지 식별
  question text not null,
  ground_truth text not null,      -- 🔥 [변경됨] answer -> ground_truth (모범 답안)
  user_answer text,                -- 🔥 [추가됨] 사용자가 본인 모델에서 가져온 답변
  user_context text,               -- 🔥 [추가됨] 사용자가 참고한 문맥
  context text not null,           -- 시스템이 생성한 원본 문맥
  faithfulness_score float,
  answer_relevance_score float,
  context_precision_score float,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);