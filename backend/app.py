"""FastAPI application assembly and database lifecycle."""

from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routes.chat import router as chat_router
from backend.routes.rag import router as rag_router
from backend.services.chat.database import init_chat_schema
from backend.services.rag.database import init_rag_schema

load_dotenv(Path(__file__).parents[1] / ".env")


@asynccontextmanager
async def lifespan(application: FastAPI):
    try:
        init_chat_schema()
        init_rag_schema()
        application.state.database_error = None
    except Exception as error:
        application.state.database_error = str(error)
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(chat_router)
app.include_router(rag_router)


@app.get("/api/health")
def health():
    error = getattr(app.state, "database_error", None)
    return {"ok": not bool(error), "database_error": error}
