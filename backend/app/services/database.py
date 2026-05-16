import uuid
from datetime import datetime, timezone
from sqlalchemy import create_engine, Column, String, Text, Float, DateTime, ForeignKey, JSON
from sqlalchemy.orm import declarative_base, sessionmaker

# ==========================================
# 1. 로컬 DB 연결 설정
# (이 코드가 실행되면 폴더에 capstone.db 파일이 짠! 생성됩니다)
# ==========================================
SQLALCHEMY_DATABASE_URL = "sqlite:///./capstone.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# ==========================================
# 2. schema.sql 완벽 이식 (SQLAlchemy Models)
# ==========================================

class Document(Base):
    __tablename__ = "documents"
    # uuid_generate_v4() 대체
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    original_filename = Column(String(255))
    content = Column(Text, nullable=False)
    status = Column(String(50), default="대기중")
    # timezone('utc'::text, now()) 대체
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

class Chunk(Base):
    __tablename__ = "chunks"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id = Column(String, ForeignKey("documents.id", ondelete="CASCADE"))
    chunk_text = Column(Text, nullable=False)
    # vector(1536) 대체 -> 로컬에서는 배열을 JSON 형태로 안전하게 저장합니다
    embedding = Column(JSON) 

class QAEvaluation(Base):
    __tablename__ = "qa_evaluations"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id = Column(String, ForeignKey("documents.id", ondelete="CASCADE"))
    model_endpoint = Column(String(255))
    question = Column(Text, nullable=False)
    ground_truth = Column(Text, nullable=False)
    user_answer = Column(Text)
    user_context = Column(Text)
    context = Column(Text, nullable=False)
    
    # 🔥 태원 님의 업데이트에 맞춰 4개의 지표로 확장
    faithfulness_score = Column(Float)
    answer_relevance_score = Column(Float)
    correctness_score = Column(Float)  # 추가됨
    similarity_score = Column(Float)   # 추가됨
    feedback = Column(Text, nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

# ==========================================
# 3. 앱 시작 시 테이블 자동 생성 및 DB 세션 함수
# ==========================================
Base.metadata.create_all(bind=engine)

# 기존 DB에 feedback 컬럼이 없을 경우 자동 추가
with engine.connect() as _conn:
    try:
        _conn.execute(__import__('sqlalchemy').text(
            "ALTER TABLE qa_evaluations ADD COLUMN feedback TEXT"
        ))
        _conn.commit()
        print("[DB] qa_evaluations.feedback 컬럼 추가 완료")
    except Exception:
        pass  # 이미 존재하면 무시

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

