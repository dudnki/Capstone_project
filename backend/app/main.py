from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import upload, pipeline, evaluations

app = FastAPI(title="RAG Evaluation API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router, prefix="/api", tags=["Upload API"])
app.include_router(pipeline.router, prefix="/api", tags=["Pipeline API"])
app.include_router(evaluations.router, prefix="/api", tags=["Evaluations API"])


@app.get("/")
def read_root():
    return {"message": "RAG Evaluation Backend is running!"}