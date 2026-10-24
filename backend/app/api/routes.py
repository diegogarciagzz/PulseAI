from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.analytics.stats import events_until, score_at, team_stats
from app.models.core import MatchEvent, MatchMeta, MatchState, MomentumInsight, PlayerStats, PulsePoint, ScoreState, Team, TeamStats
from app.services.match_store import Match, store
from app.simulator.rosters import TEAMS
from app.simulator.scenarios import SCENARIOS

router = APIRouter(prefix="/api")


def _match(match_id: str) -> Match:
    m = store.get(match_id)
    if m is None:
        raise HTTPException(status_code=404, detail=f"Unknown match '{match_id}'")
    return m


@router.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "pulse-ai-backend"}


class ScenarioInfo(BaseModel):
    key: str
    title: str
    description: str
    seed: int
    demo_moments: list[dict]


@router.get("/scenarios", response_model=list[ScenarioInfo])
def scenarios() -> list[ScenarioInfo]:
    return [ScenarioInfo(key=s.key, title=s.title, description=s.description, seed=s.seed, demo_moments=s.demo_moments) for s in SCENARIOS.values()]


@router.get("/matches", response_model=list[MatchMeta])
def list_matches() -> list[MatchMeta]:
    store.ensure_defaults()
    return store.list()


class GenerateRequest(BaseModel):
    scenario: str = Field(default="comeback")
    seed: Optional[int] = None


class MatchDetail(BaseModel):
    meta: MatchMeta
    teams: dict[str, Team]
    demo_moments: list[dict]
    key_moments: list[dict]
    final_team_stats: dict[str, TeamStats]


def _detail(m: Match) -> MatchDetail:
    key_moments = [{"label": f"{e.minute}' GOAL {e.player_name}", "minute": e.minute, "t": e.t, "kind": "goal", "team": e.team}
                   for e in m.events if e.type.value == "goal"]
    key_moments += [{"label": f"{i.minute}' {i.headline}", "minute": i.minute, "t": i.t, "kind": i.kind.value, "team": i.team}
                    for i in m.insights if i.kind.value in ("momentum-swing", "pressure-surge") and i.importance >= 0.6]
    key_moments.sort(key=lambda k: k["t"])
    return MatchDetail(meta=m.meta, teams={t: TEAMS[t] for t in (m.home, m.away)}, demo_moments=m.scenario.demo_moments,
                       key_moments=key_moments, final_team_stats=m.final_team_stats())


@router.post("/matches/generate", response_model=MatchDetail)
def generate(req: GenerateRequest) -> MatchDetail:
    if req.scenario not in SCENARIOS:
        raise HTTPException(status_code=400, detail=f"Unknown scenario '{req.scenario}'. Choose from {list(SCENARIOS)}")
    return _detail(store.generate(req.scenario, req.seed))


@router.get("/matches/{match_id}", response_model=MatchDetail)
def get_match(match_id: str) -> MatchDetail:
    return _detail(_match(match_id))


@router.get("/matches/{match_id}/events", response_model=list[MatchEvent])
def get_events(match_id: str, until_t: Optional[int] = Query(default=None, ge=0, le=5400),
               types: Optional[str] = Query(default=None, description="comma separated event types")) -> list[MatchEvent]:
    m = _match(match_id)
    ev = m.events if until_t is None else events_until(m.events, until_t)
    if types:
        wanted = set(types.split(","))
        ev = [e for e in ev if e.type.value in wanted]
    return ev


@router.get("/matches/{match_id}/pulse", response_model=list[PulsePoint])
def get_pulse(match_id: str, until_t: Optional[int] = Query(default=None, ge=0, le=5400)) -> list[PulsePoint]:
    m = _match(match_id)
    return m.pulse if until_t is None else [p for p in m.pulse if p.t <= until_t]


@router.get("/matches/{match_id}/insights", response_model=list[MomentumInsight])
def get_insights(match_id: str, until_t: Optional[int] = Query(default=None, ge=0, le=5400), min_importance: float = 0.0) -> list[MomentumInsight]:
    m = _match(match_id)
    out = [i for i in m.insights if i.importance >= min_importance]
    if until_t is not None:
        # never reveal moments whose window has not closed yet
        out = [i for i in out if i.window_end_t <= until_t]
    return out


@router.get("/matches/{match_id}/state", response_model=MatchState)
def get_state(match_id: str, t: int = Query(default=5400, ge=0, le=5400)) -> MatchState:
    m = _match(match_id)
    h, a = score_at(m.events, t)
    if t <= 0:
        status = "pre-match"
    elif t < 2700:
        status = "first-half"
    elif t == 2700:
        status = "half-time"
    elif t < 5400:
        status = "second-half"
    else:
        status = "full-time"
    on = {tid: [p.id for p in TEAMS[tid].players if p.starter] for tid in (m.home, m.away)}
    for e in m.events:
        if e.t > t:
            break
        if e.type.value == "substitution" and e.team and e.related_player_id in on[e.team]:
            on[e.team][on[e.team].index(e.related_player_id)] = e.player_id or e.related_player_id
    return MatchState(match_id=m.meta.id, t=t, minute=t // 60, second=t % 60, period=1 if t < 2700 else 2, status=status,
                      score=ScoreState(home=h, away=a), home_stats=team_stats(m.events, m.home, 0, t), away_stats=team_stats(m.events, m.away, 0, t),
                      on_pitch_home=on[m.home], on_pitch_away=on[m.away])


@router.get("/matches/{match_id}/stats", response_model=dict[str, TeamStats])
def get_stats(match_id: str, from_t: int = Query(default=0, ge=0, le=5400), to_t: int = Query(default=5400, ge=0, le=5400)) -> dict[str, TeamStats]:
    m = _match(match_id)
    if to_t < from_t:
        raise HTTPException(status_code=400, detail="to_t must be >= from_t")
    return {t: team_stats(m.events, t, from_t, to_t) for t in (m.home, m.away)}


@router.get("/matches/{match_id}/players", response_model=list[PlayerStats])
def get_players(match_id: str, until_t: Optional[int] = Query(default=None, ge=0, le=5400),
                sort: Literal["involvement", "name"] = "involvement") -> list[PlayerStats]:
    m = _match(match_id)
    from app.analytics.stats import player_stats
    ps = m.final_player_stats() if until_t is None else player_stats(m.events, 0, until_t)
    rows = [s for s in ps.values() if s.minutes > 0 or s.touches > 0]
    if sort == "involvement":
        rows.sort(key=lambda s: -(s.touches + s.goals * 10 + s.assists * 6 + s.defensive_actions * 1.5 + s.progressive_passes * 1.5))
    else:
        rows.sort(key=lambda s: s.name)
    return rows


# ---------------------------------------------------------------- phase 2+: AI, Narrative VAR

from app.ai.provider import agent_framework_available, evaluation_sdk_available, resolve_provider  # noqa: E402
from app.config import settings  # noqa: E402
from app.models.core import Capabilities, VerificationResult  # noqa: E402
from app.verification.verifier import example_claims, verify_text  # noqa: E402


@router.get("/system/capabilities", response_model=Capabilities)
def capabilities() -> Capabilities:
    st = resolve_provider()
    mode = st.provider.mode
    return Capabilities(
        ai_mode=mode, ai_mode_label="Foundry live" if mode == "foundry" else "Demo mode",
        foundry_configured=st.foundry_configured, foundry_endpoint_host=st.endpoint_host, foundry_model=st.model,
        agent_framework_available=agent_framework_available(), evaluation_sdk_available=evaluation_sdk_available(),
        groundedness_evaluator_enabled=bool(settings.enable_groundedness_evaluator and mode == "foundry"),
        credential_source=st.credential_source, notes=st.notes)


class VerifyRequest(BaseModel):
    text: str = Field(min_length=3, max_length=2000)
    at_t: Optional[int] = Field(default=None, ge=0, le=5400, description="Verify against events up to this second (defaults to full-time)")


@router.post("/matches/{match_id}/verify", response_model=VerificationResult)
async def verify(match_id: str, req: VerifyRequest) -> VerificationResult:
    m = _match(match_id)
    st = resolve_provider()
    result = verify_text(m.events, req.text, m.home, m.away, at_t=req.at_t if req.at_t is not None else 5400, match_id=m.meta.id, ai_mode=st.provider.mode)
    if settings.enable_groundedness_evaluator and st.provider.mode == "foundry":
        from app.evaluation.groundedness import evaluate_groundedness
        result.groundedness = await evaluate_groundedness(req.text, result)
    return result


class ClaimExample(BaseModel):
    label: str
    text: str
    category: str
    expected: str


@router.get("/matches/{match_id}/claims/examples", response_model=list[ClaimExample])
def claim_examples(match_id: str) -> list[ClaimExample]:
    m = _match(match_id)
    return [ClaimExample(**e) for e in example_claims(m.events, m.home, m.away)]


class InsightExplanation(BaseModel):
    insight_id: str
    explanation: str
    source: str
    verification: VerificationResult


@router.post("/matches/{match_id}/insights/{insight_id}/explain", response_model=InsightExplanation)
async def explain(match_id: str, insight_id: str) -> InsightExplanation:
    from app.ai.insight_writer import explain_insight
    m = _match(match_id)
    ins = next((i for i in m.insights if i.id == insight_id), None)
    if ins is None:
        raise HTTPException(status_code=404, detail=f"Unknown insight '{insight_id}'")
    text, source, verification = await explain_insight(m, ins)
    ins.ai_explanation, ins.ai_explanation_source, ins.verification_status = text, source, verification.status
    return InsightExplanation(insight_id=ins.id, explanation=text, source=source, verification=verification)


# ---------------------------------------------------------------- phase 4/5: roundtable, recap

from app.models.core import DebateResult, MatchRecap  # noqa: E402

_debate_cache: dict[str, DebateResult] = {}


@router.post("/matches/{match_id}/debate", response_model=DebateResult)
async def debate(match_id: str, refresh: bool = False) -> DebateResult:
    from app.agents.pundits import run_debate
    m = _match(match_id)
    if not refresh and match_id in _debate_cache:
        return _debate_cache[match_id]
    result = await run_debate(m)
    _debate_cache[match_id] = result
    return result


@router.get("/matches/{match_id}/debate/candidates")
def debate_candidates(match_id: str) -> list[dict]:
    from app.agents.pundits import candidate_scores
    m = _match(match_id)
    return [c.model_dump() for c in candidate_scores(m)]


@router.get("/matches/{match_id}/recap", response_model=MatchRecap)
async def recap(match_id: str, mode: Literal["fan", "analyst"] = "fan", lang: Literal["en", "es"] = "en") -> MatchRecap:
    from app.agents.recap import build_recap
    m = _match(match_id)
    return await build_recap(m, mode, lang)
