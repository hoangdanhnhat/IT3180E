import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.routers import admin, agent, auth, tickets
from app.core.config import settings
from app.core.db import SessionLocal
from app.services.ticket_service import auto_close_stale_tickets

logger = logging.getLogger(__name__)

_AUTO_CLOSE_INTERVAL_SECONDS = 3600  # run once per hour


async def _auto_close_loop() -> None:
    """Background task: periodically close resolved tickets older than 7 days."""
    while True:
        try:
            db = SessionLocal()
            try:
                closed = auto_close_stale_tickets(db)
                if closed:
                    logger.info("Auto-closed %d stale resolved ticket(s)", closed)
            finally:
                db.close()
        except Exception:
            logger.exception("Error during auto-close sweep")
        await asyncio.sleep(_AUTO_CLOSE_INTERVAL_SECONDS)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(_auto_close_loop())
    yield
    task.cancel()


app = FastAPI(
    title="UFMS — User Feedback Management System",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan,
)

# Ensure upload directory exists
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# API routers
# ---------------------------------------------------------------------------
app.include_router(auth.router, prefix="/api/v1")
app.include_router(tickets.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")
app.include_router(agent.router, prefix="/api/v1")

# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/health", tags=["health"])
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Serve React frontend (Vite build output)
# ---------------------------------------------------------------------------
_FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")
_DIST_DIR = os.path.join(_FRONTEND_DIR, "dist")

if os.path.isdir(os.path.join(_DIST_DIR, "assets")):
    app.mount("/assets", StaticFiles(directory=os.path.join(_DIST_DIR, "assets")), name="assets")

app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")


@app.get("/{full_path:path}", include_in_schema=False)
def serve_frontend(full_path: str):
    index = os.path.join(_DIST_DIR, "index.html")
    if os.path.isfile(index):
        return FileResponse(index)
    return {"detail": "Frontend not built. Run: cd frontend && npm run build"}
