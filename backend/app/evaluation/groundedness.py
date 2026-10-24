"""Optional Microsoft Foundry groundedness evaluation (azure-ai-evaluation).

The evaluator needs an Azure OpenAI style model configuration. It is only invoked
when `ENABLE_GROUNDEDNESS_EVALUATOR=true` and the AI mode is Foundry. If it cannot
run, the function returns a dictionary that says so; it never fabricates a score.
"""
from __future__ import annotations

import asyncio
from typing import Any

from app.config import settings
from app.models.core import VerificationResult


def _model_config() -> dict[str, Any] | None:
    if not settings.azure_openai_endpoint or not (settings.foundry_eval_model or settings.foundry_model):
        return None
    cfg: dict[str, Any] = {"azure_endpoint": settings.azure_openai_endpoint, "azure_deployment": settings.foundry_eval_model or settings.foundry_model,
                           "api_version": settings.azure_openai_api_version}
    if settings.azure_openai_api_key:
        cfg["api_key"] = settings.azure_openai_api_key
    return cfg


def context_from_result(result: VerificationResult) -> str:
    lines = []
    for c in result.claims:
        if c.actual_label is not None:
            lines.append(f"{c.claim.metric}: actual {c.actual_label} for {c.claim.player_name or c.claim.team} in {(c.claim.window.label if c.claim.window else 'the match so far')}")
        for e in c.evidence:
            lines.append(f"{e.event_id} {e.minute}' {e.type}: {e.description}")
    return "\n".join(lines) or "No evidence retrieved."


def run_groundedness_sync(response_text: str, context: str, query: str = "Describe what happened in this match period.") -> dict[str, Any]:
    cfg = _model_config()
    if cfg is None:
        return {"ran": False, "reason": "AZURE_OPENAI_ENDPOINT and a deployment name are required for azure-ai-evaluation"}
    try:
        from azure.ai.evaluation import GroundednessEvaluator
    except ImportError as e:
        return {"ran": False, "reason": f"azure-ai-evaluation not installed: {e}"}
    try:
        kwargs = {}
        if "api_key" not in cfg:
            from azure.identity import DefaultAzureCredential
            kwargs["credential"] = DefaultAzureCredential(exclude_interactive_browser_credential=True)
        evaluator = GroundednessEvaluator(model_config=cfg, **kwargs)
        out = evaluator(query=query, context=context, response=response_text)
        return {"ran": True, "evaluator": "GroundednessEvaluator", "result": out}
    except Exception as e:  # noqa: BLE001
        return {"ran": False, "reason": f"{type(e).__name__}: {e}"}


async def evaluate_groundedness(response_text: str, result: VerificationResult) -> dict[str, Any]:
    return await asyncio.to_thread(run_groundedness_sync, response_text, context_from_result(result))
