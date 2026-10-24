from __future__ import annotations

import re
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.ai.guard import force_demo_reason, limiter
from app.api.routes import router
from app.config import ROOT, settings
from app.services.match_store import store


@asynccontextmanager
async def lifespan(app: FastAPI):
    store.ensure_defaults()
    yield


app = FastAPI(title="PULSE AI", version="0.1.0", description="Beyond the Scoreline. Synthetic match intelligence with evidence-grounded commentary verification.",
              lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in settings.cors_origins.split(",")], allow_methods=["*"], allow_headers=["*"])

# Endpoints that may spend model calls (insight explanations, the pundit debate, recaps).
AI_PATH = re.compile(r"^/api/matches/[^/]+/(insights/[^/]+/explain|debate|recap)$")


@app.middleware("http")
async def ai_rate_limit(request: Request, call_next):
    """Per-address hourly limit for model-backed endpoints. Over the limit the request still
    succeeds, with deterministic (demo-labelled) output instead of a model call."""
    if settings.pulse_ai_ip_limit_per_hour > 0 and AI_PATH.match(request.url.path):
        forwarded = request.headers.get("x-forwarded-for", "")
        ip = (forwarded.split(",")[0].strip() if forwarded else None) or (request.client.host if request.client else "unknown")
        if not limiter.allow(ip):
            token = force_demo_reason.set("hourly AI limit for this address reached on the public demo; deterministic output shown")
            try:
                return await call_next(request)
            finally:
                force_demo_reason.reset(token)
    return await call_next(request)


app.include_router(router)

# ------------------------------------------------------------------ built frontend (container / single-origin deploy)
STATIC_DIR = Path(settings.pulse_static_dir) if settings.pulse_static_dir else ROOT / "frontend" / "dist"

if (STATIC_DIR / "index.html").is_file():
    _static_root = STATIC_DIR.resolve()

    @app.get("/{full_path:path}", include_in_schema=False)
    async def frontend(full_path: str) -> FileResponse:
        if full_path.startswith("api/") or full_path == "api":
            raise HTTPException(status_code=404, detail="Not found")
        candidate = (_static_root / full_path).resolve()
        if full_path and candidate.is_file() and _static_root in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(_static_root / "index.html")  # client-side routes
