import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.routers import auth
from app.core.config import settings

app = FastAPI(
    title="UFMS — User Feedback Management System",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

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

# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/health", tags=["health"])
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Serve simple frontend (static files + SPA index)
# ---------------------------------------------------------------------------
_FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")

if os.path.isdir(os.path.join(_FRONTEND_DIR, "static")):
    app.mount("/static", StaticFiles(directory=os.path.join(_FRONTEND_DIR, "static")), name="static")


@app.get("/{full_path:path}", include_in_schema=False)
def serve_frontend(full_path: str):
    index = os.path.join(_FRONTEND_DIR, "index.html")
    return FileResponse(index)
