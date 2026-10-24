"""AI provider abstraction.

Two implementations share one interface:

* `DemoProvider`   deterministic, template-based text built only from computed facts.
                   Works offline. Every output is labelled `source="demo"`.
* `FoundryProvider` real model calls through Microsoft Foundry (azure-ai-projects 2.x,
                   `AIProjectClient.get_openai_client()` + the Responses API). Outputs are
                   labelled `source="foundry"`. The model only ever sees an evidence pack
                   computed by code and is asked for JSON; the result is validated and then
                   passed through Narrative VAR like any other commentary.

Mode resolution (see `resolve_provider`): `PULSE_AI_MODE=foundry` forces Foundry and fails
loudly if it is not configured; `demo` forces the local provider; `auto` (default) uses
Foundry when `FOUNDRY_PROJECT_ENDPOINT` and `FOUNDRY_MODEL` are set and a credential can be
obtained, otherwise demo.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

from app.config import settings

log = logging.getLogger("pulse.ai")


@dataclass
class AIText:
    text: str
    source: str  # "demo" | "foundry"
    model: str | None = None
    raw: dict | None = None


class AIUnavailable(RuntimeError):
    pass


class BaseProvider:
    mode = "demo"

    async def complete_json(self, system: str, user: str, *, fallback: dict[str, Any]) -> tuple[dict[str, Any], str]:
        """Return (json_object, source). Demo returns the fallback object unchanged."""
        raise NotImplementedError


class DemoProvider(BaseProvider):
    mode = "demo"

    async def complete_json(self, system: str, user: str, *, fallback: dict[str, Any]) -> tuple[dict[str, Any], str]:
        return fallback, "demo"


class FoundryProvider(BaseProvider):
    mode = "foundry"

    def __init__(self, endpoint: str, model: str, credential: Any, credential_source: str):
        from azure.ai.projects import AIProjectClient  # imported lazily so demo mode has no Azure dependency at runtime

        self.endpoint = endpoint
        self.model = model
        self.credential_source = credential_source
        self.credential = credential
        self._project = AIProjectClient(endpoint=endpoint, credential=credential)
        self._client = self._project.get_openai_client()

    def _call(self, system: str, user: str) -> str:
        # System prompt goes in `instructions`, the evidence pack as plain `input` text: the Foundry
        # Responses endpoint rejects role-only message items without an explicit item type.
        kwargs: dict[str, Any] = {"model": self.model, "instructions": system, "input": user}
        if self.model.lower().startswith(("gpt-5", "o1", "o3", "o4")):
            kwargs["reasoning"] = {"effort": "low"}  # reasoning models: keep latency demo-friendly
        resp = self._client.responses.create(**kwargs)
        text = getattr(resp, "output_text", None) or ""
        if not text.strip():
            raise AIUnavailable("Foundry returned an empty response")
        return text

    async def complete_json(self, system: str, user: str, *, fallback: dict[str, Any]) -> tuple[dict[str, Any], str]:
        from app.ai.guard import check_model_call

        check_model_call(1)
        try:
            text = await asyncio.wait_for(asyncio.to_thread(self._call, system, user), timeout=settings.ai_timeout_seconds)
        except asyncio.TimeoutError as e:
            raise AIUnavailable(f"Foundry call timed out after {settings.ai_timeout_seconds:.0f}s") from e
        except Exception as e:  # network, auth, quota
            raise AIUnavailable(f"Foundry call failed: {type(e).__name__}: {e}") from e
        obj = _parse_json(text)
        if obj is None:
            raise AIUnavailable("Foundry response was not valid JSON")
        return obj, "foundry"


def _parse_json(text: str) -> dict[str, Any] | None:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    try:
        obj = json.loads(text)
        return obj if isinstance(obj, dict) else None
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.S)
        if m:
            try:
                obj = json.loads(m.group(0))
                return obj if isinstance(obj, dict) else None
            except json.JSONDecodeError:
                return None
    return None


# ------------------------------------------------------------------------- resolution

@dataclass
class ProviderStatus:
    provider: BaseProvider
    foundry_configured: bool
    credential_source: str | None
    notes: list[str]
    endpoint_host: str | None
    model: str | None


_status: ProviderStatus | None = None


def _try_credential() -> tuple[Any | None, str | None, str | None]:
    """Resolve an Azure credential without prompting. Returns (credential, source, error)."""
    try:
        from azure.identity import AzureCliCredential, DefaultAzureCredential, EnvironmentCredential, ManagedIdentityCredential
    except ImportError as e:
        return None, None, f"azure-identity not installed: {e}"
    scope = "https://ai.azure.com/.default"
    candidates = [("environment (AZURE_CLIENT_ID/SECRET)", EnvironmentCredential), ("azure cli", AzureCliCredential), ("managed identity", ManagedIdentityCredential)]
    errors = []
    for name, cls in candidates:
        try:
            cred = cls()
            cred.get_token(scope)
            return cred, name, None
        except Exception as e:  # noqa: BLE001
            errors.append(f"{name}: {type(e).__name__}")
    try:
        cred = DefaultAzureCredential(exclude_interactive_browser_credential=True)
        cred.get_token(scope)
        return cred, "default azure credential", None
    except Exception as e:  # noqa: BLE001
        errors.append(f"default: {type(e).__name__}")
    return None, None, "; ".join(errors)


def resolve_provider(force: bool = False) -> ProviderStatus:
    global _status
    if _status is not None and not force:
        return _status
    notes: list[str] = []
    endpoint, model = settings.foundry_project_endpoint, settings.foundry_model
    configured = bool(endpoint and model)
    host = urlparse(endpoint).hostname if endpoint else None
    if settings.pulse_ai_mode == "demo":
        notes.append("PULSE_AI_MODE=demo: deterministic local outputs, no model calls.")
        _status = ProviderStatus(DemoProvider(), configured, None, notes, host, model)
        return _status
    if not configured:
        notes.append("Foundry not configured: set FOUNDRY_PROJECT_ENDPOINT and FOUNDRY_MODEL in .env to enable live inference.")
        if settings.pulse_ai_mode == "foundry":
            raise AIUnavailable("PULSE_AI_MODE=foundry but FOUNDRY_PROJECT_ENDPOINT / FOUNDRY_MODEL are not set")
        _status = ProviderStatus(DemoProvider(), False, None, notes, host, model)
        return _status
    cred, source, err = _try_credential()
    if cred is None:
        notes.append(f"Foundry endpoint configured but no Azure credential resolved ({err}). Run `az login` or set AZURE_CLIENT_ID/AZURE_TENANT_ID/AZURE_CLIENT_SECRET.")
        if settings.pulse_ai_mode == "foundry":
            raise AIUnavailable(notes[-1])
        _status = ProviderStatus(DemoProvider(), True, None, notes, host, model)
        return _status
    try:
        provider = FoundryProvider(endpoint, model, cred, source or "unknown")
        notes.append(f"Live Microsoft Foundry inference via azure-ai-projects (model '{model}').")
        _status = ProviderStatus(provider, True, source, notes, host, model)
    except Exception as e:  # noqa: BLE001
        notes.append(f"Foundry client could not be created: {type(e).__name__}: {e}")
        if settings.pulse_ai_mode == "foundry":
            raise AIUnavailable(notes[-1]) from e
        _status = ProviderStatus(DemoProvider(), True, source, notes, host, model)
    return _status


def provider() -> BaseProvider:
    return resolve_provider().provider


def agent_framework_available() -> bool:
    try:
        import agent_framework  # noqa: F401
        import agent_framework.foundry  # noqa: F401
        return True
    except Exception:  # noqa: BLE001
        return False


def evaluation_sdk_available() -> bool:
    try:
        import azure.ai.evaluation  # noqa: F401
        return True
    except Exception:  # noqa: BLE001
        return False
