"""Grounded explanation of a detected moment, verified by Narrative VAR before it is returned."""
from __future__ import annotations

from app.ai.provider import AIUnavailable, provider
from app.models.core import MomentumInsight, VerificationResult
from app.services.match_store import Match
from app.simulator.rosters import TEAMS
from app.verification.verifier import verify_text

SYSTEM = """You are the PULSE AI insight writer for a football broadcast studio.
Write ONE short paragraph (2 to 3 sentences, max 70 words) explaining the moment for viewers.
Rules:
- Use ONLY the numbers and events in the evidence pack. Never invent players, minutes or statistics.
- Quote at least two numbers from the pack exactly as given.
- Name the time window exactly as given.
- Do not mention probabilities or that the model is an AI.
Return JSON: {"explanation": "<paragraph>"}"""


def evidence_pack(match: Match, insight: MomentumInsight) -> str:
    team = TEAMS[insight.team]
    lines = [f"Match: {TEAMS[match.home].name} (home) vs {TEAMS[match.away].name} (away), scenario '{match.meta.title}'.",
             f"Moment: {insight.headline} at {insight.minute}'. Kind: {insight.kind.value}. Team: {team.name} ({team.short}).",
             f"Window: {insight.stats.get('window')}. Deterministic explanation: {insight.explanation}",
             "Statistics (authoritative):"]
    lines += [f"  - {k}: {v}" for k, v in insight.stats.items()]
    lines.append("Events (authoritative, ids are real):")
    lines += [f"  - {e.event_id} {e.minute}' {e.type} {e.team or ''} {e.player_name or ''}: {e.description}" for e in insight.evidence]
    return "\n".join(lines)


async def explain_insight(match: Match, insight: MomentumInsight) -> tuple[str, str, VerificationResult]:
    prov = provider()
    fallback = {"explanation": insight.explanation}
    try:
        obj, source = await prov.complete_json(SYSTEM, evidence_pack(match, insight), fallback=fallback)
    except AIUnavailable as e:
        obj, source = {"explanation": insight.explanation + " (Foundry unavailable, deterministic explanation shown: " + str(e)[:80] + ")"}, "demo"
    text = str(obj.get("explanation") or insight.explanation).strip()
    verification = verify_text(match.events, text, match.home, match.away, at_t=insight.window_end_t, match_id=match.meta.id, ai_mode=prov.mode)
    return text, source, verification
