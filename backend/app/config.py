"""Runtime settings. Read from environment variables or a `.env` file in `pulse-ai/`."""
from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=[ROOT / ".env", ROOT.parent / ".env"], env_file_encoding="utf-8", extra="ignore")

    # auto: use Foundry when a project endpoint + model are configured and a credential resolves; otherwise demo.
    pulse_ai_mode: Literal["auto", "demo", "foundry"] = "auto"
    foundry_project_endpoint: str | None = None
    foundry_model: str | None = None
    foundry_eval_model: str | None = None
    # Optional explicit Azure OpenAI endpoint for the groundedness evaluator (azure-ai-evaluation needs an AOAI-style config).
    azure_openai_endpoint: str | None = None
    azure_openai_api_key: str | None = None
    azure_openai_api_version: str = "2024-10-21"
    enable_groundedness_evaluator: bool = False
    ai_timeout_seconds: float = 40.0
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"


settings = Settings()
