from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.config import settings
from app.services.match_store import store


@asynccontextmanager
async def lifespan(app: FastAPI):
    store.ensure_defaults()
    yield


app = FastAPI(title="PULSE AI", version="0.1.0", description="Beyond the Scoreline. Synthetic match intelligence with evidence-grounded commentary verification.",
              lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in settings.cors_origins.split(",")], allow_methods=["*"], allow_headers=["*"])
app.include_router(router)
