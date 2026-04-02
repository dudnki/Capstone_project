-- 1. pgvector 확장 활성화
create extension if not exists vector;

-- 2. 원천 문서 및 상태 관리 테이블
create table documents (
  id uuid primary key default uuid_generate_v4(),
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
  question text not null,
  answer text not null,
  context text not null,
  faithfulness_score float,
  answer_relevance_score float,
  context_precision_score float,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);