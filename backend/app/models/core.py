"""Typed data contracts shared by the simulator, analytics, verification, agents and API.

Coordinate convention (documented in docs/architecture.md):
  * The pitch is 105 x 68 metres, matching the brand kit `Pitch` component.
  * `x`, `y` on an event are in the ACTING TEAM'S ATTACKING FRAME: x = 0 is the acting
    team's own goal line, x = 105 is the goal they attack, y = 0 is the top touchline.
  * `pitch_x`, `pitch_y` are in the FIXED DISPLAY FRAME where the home team attacks
    towards x = 105 and the away team attacks towards x = 0. Away events are mirrored
    (105 - x, 68 - y). The frontend draws `pitch_x`, `pitch_y` directly on the kit pitch.
"""
from __future__ import annotations

from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, Field

TeamId = Literal["north-city", "south-united"]
PunditId = Literal["analyst", "fan", "tactician"]


class EventType(str, Enum):
    KICKOFF = "kickoff"
    PASS = "pass"
    CARRY = "carry"
    INTERCEPTION = "interception"
    RECOVERY = "recovery"
    TACKLE = "tackle"
    SHOT = "shot"
    GOAL = "goal"
    FOUL = "foul"
    CARD = "card"
    CORNER = "corner"
    SUBSTITUTION = "substitution"
    HALFTIME = "halftime"
    FULLTIME = "fulltime"


class Player(BaseModel):
    id: str
    team: TeamId
    name: str
    number: int
    position: Literal["GK", "DF", "MF", "FW"]
    role: str = Field(description="Human readable role, e.g. 'Centre back'")
    starter: bool = True
    # 0..1 tendencies used only by the simulator
    passing: float = 0.7
    shooting: float = 0.5
    defending: float = 0.5
    workrate: float = 0.6
    progression: float = 0.5


class Team(BaseModel):
    id: TeamId
    name: str
    short: str
    nickname: str
    primary_color: str
    secondary_color: str
    players: list[Player]


class MatchEvent(BaseModel):
    id: str = Field(description="Stable id, e.g. 'E0142'")
    seq: int
    t: int = Field(description="Seconds since kick-off (0..5400)")
    minute: int = Field(description="floor(t / 60)")
    second: int
    period: Literal[1, 2]
    type: EventType
    team: Optional[TeamId] = None
    player_id: Optional[str] = None
    player_name: Optional[str] = None
    # secondary actor: pass receiver, fouled player, substitute coming on, assister
    related_player_id: Optional[str] = None
    related_player_name: Optional[str] = None
    outcome: Optional[str] = Field(default=None, description="complete|incomplete|on_target|off_target|blocked|saved|goal|won|lost|yellow|red")
    x: Optional[float] = None
    y: Optional[float] = None
    end_x: Optional[float] = None
    end_y: Optional[float] = None
    pitch_x: Optional[float] = None
    pitch_y: Optional[float] = None
    pitch_end_x: Optional[float] = None
    pitch_end_y: Optional[float] = None
    xg: Optional[float] = None
    progressive: bool = False
    final_third_entry: bool = False
    box_entry: bool = False
    key_pass: bool = False
    sequence_id: int = 0
    score_home: int = 0
    score_away: int = 0
    description: str = ""


class ScoreState(BaseModel):
    home: int
    away: int


class MatchMeta(BaseModel):
    id: str
    scenario: str
    title: str
    description: str
    seed: int
    home: TeamId
    away: TeamId
    created_at: str
    event_count: int
    final_score: ScoreState
    competition: str = "PULSE AI Synthetic League (fictional)"


class TeamStats(BaseModel):
    team: TeamId
    possession_pct: float = Field(description="Share of in-play ball time, from sequence durations")
    possession_pct_by_passes: float = Field(description="Alternative reading: share of completed passes")
    passes: int = 0
    passes_completed: int = 0
    pass_accuracy: float = 0.0
    progressive_passes: int = 0
    final_third_entries: int = 0
    box_entries: int = 0
    shots: int = 0
    shots_on_target: int = 0
    goals: int = 0
    xg: float = 0.0
    recoveries: int = 0
    tackles: int = 0
    interceptions: int = 0
    corners: int = 0
    fouls: int = 0
    cards: int = 0
    carries: int = 0


class PlayerStats(BaseModel):
    player_id: str
    name: str
    number: int
    team: TeamId
    position: str
    role: str
    minutes: int = 0
    touches: int = 0
    passes: int = 0
    passes_completed: int = 0
    pass_accuracy: float = 0.0
    progressive_passes: int = 0
    key_passes: int = 0
    assists: int = 0
    pre_assists: int = 0
    goals: int = 0
    shots: int = 0
    shots_on_target: int = 0
    xg: float = 0.0
    carries: int = 0
    final_third_entries: int = 0
    recoveries: int = 0
    tackles: int = 0
    interceptions: int = 0
    defensive_actions: int = 0
    fouls: int = 0
    cards: int = 0
    goals_involved: int = 0


class PulsePoint(BaseModel):
    t: int
    minute: float
    value: float = Field(description="-1..1, positive = home momentum")
    home: float = Field(description="Smoothed home momentum score 0..1")
    away: float
    home_events: int = 0
    away_events: int = 0


class EvidenceReference(BaseModel):
    event_id: str
    t: int
    minute: int
    type: str
    team: Optional[TeamId] = None
    player_name: Optional[str] = None
    description: str


class InsightKind(str, Enum):
    MOMENTUM_SWING = "momentum-swing"
    PRESSURE_SURGE = "pressure-surge"
    ATTACKING_SURGE = "attacking-surge"
    DEFENSIVE_STAND = "defensive-stand"
    GOAL_BUILDUP = "goal-buildup"
    SUBSTITUTION_IMPACT = "substitution-impact"


class MomentumInsight(BaseModel):
    id: str
    kind: InsightKind
    minute: int
    t: int
    window_start_t: int
    window_end_t: int
    team: TeamId
    importance: float = Field(description="0..1, used to rank and to size chart markers")
    headline: str
    explanation: str = Field(description="Deterministic, template-generated from the evidence")
    stats: dict[str, float | int | str] = Field(default_factory=dict)
    event_ids: list[str] = Field(default_factory=list)
    evidence: list[EvidenceReference] = Field(default_factory=list)
    ai_explanation: Optional[str] = None
    ai_explanation_source: Optional[str] = Field(default=None, description="'foundry' or 'demo'")
    verification_status: Optional[str] = None
    marker_kind: str = Field(default="momentum-shift", description="Brand kit marker name for the chart")


class MatchState(BaseModel):
    """Everything the dashboard needs at a given replay time."""
    match_id: str
    t: int
    minute: int
    second: int
    period: Literal[1, 2]
    status: Literal["pre-match", "first-half", "half-time", "second-half", "full-time"]
    score: ScoreState
    home_stats: TeamStats
    away_stats: TeamStats
    on_pitch_home: list[str]
    on_pitch_away: list[str]


# ---- Narrative VAR -------------------------------------------------------------

VarStatus = Literal["verified", "corrected", "unsupported", "conflicted", "unverified", "checking"]


class ClaimWindow(BaseModel):
    start_t: int
    end_t: int
    label: str


class NarrativeClaim(BaseModel):
    id: str
    text: str = Field(description="The sentence the claim was extracted from")
    fragment: Optional[str] = Field(default=None, description="The specific number+metric fragment when a sentence yields several claims")
    kind: Literal["metric", "event", "comparison", "opinion", "unknown"]
    metric: Optional[str] = None
    team: Optional[TeamId] = None
    player_id: Optional[str] = None
    player_name: Optional[str] = None
    comparator: Optional[Literal["eq", "gte", "lte", "approx", "more", "less"]] = None
    value: Optional[float] = None
    unit: Optional[str] = None
    window: Optional[ClaimWindow] = None
    event_type: Optional[str] = None
    extraction_source: Literal["deterministic", "foundry"] = "deterministic"


class ClaimCheck(BaseModel):
    claim: NarrativeClaim
    status: VarStatus
    actual_value: Optional[float] = None
    actual_label: Optional[str] = None
    tolerance: Optional[float] = None
    reasoning: str
    evidence: list[EvidenceReference] = Field(default_factory=list)
    evidence_strength: int = Field(default=0, ge=0, le=5)
    corrected_text: Optional[str] = None
    alternative_readings: dict[str, float] = Field(default_factory=dict)


class VerificationResult(BaseModel):
    id: str
    match_id: str
    original_text: str
    status: VarStatus
    claims: list[ClaimCheck]
    corrected_text: Optional[str] = None
    summary: str
    window: Optional[ClaimWindow] = None
    checked_at_t: int
    evidence_strength: int = 0
    groundedness: Optional[dict] = Field(default=None, description="Foundry evaluator output when it ran")
    ai_mode: str
    audit: list[dict] = Field(default_factory=list)


# ---- Pundit roundtable ---------------------------------------------------------


class CandidateScore(BaseModel):
    player_id: str
    name: str
    team: TeamId
    number: int
    role: str
    analyst_score: float
    fan_score: float
    tactician_score: float
    composite: float
    stats: PlayerStats


class PunditArgument(BaseModel):
    pundit: PunditId
    pundit_name: str
    round: Literal["opening", "rebuttal"]
    pick_player_id: str
    pick_name: str
    text: str
    source: Literal["foundry", "demo", "agent-framework"]
    verification: Optional[VerificationResult] = None


class DebateResult(BaseModel):
    match_id: str
    candidates: list[CandidateScore]
    arguments: list[PunditArgument]
    moderator_summary: str
    verdict_player_id: str
    verdict_name: str
    verdict_team: TeamId
    verdict_number: int
    verdict_rating: str
    verdict_stats: list[dict]
    votes: list[dict]
    unanimous: bool
    ai_mode: str
    rounds: int


# ---- Recap ---------------------------------------------------------------------


class RecapSection(BaseModel):
    title: str
    body: str
    status: Optional[VarStatus] = None


class MatchRecap(BaseModel):
    match_id: str
    mode: Literal["fan", "analyst"]
    language: Literal["en", "es"] = "en"
    headline: str
    summary: str
    summary_source: str
    summary_status: Optional[VarStatus] = None
    final_score: ScoreState
    key_events: list[EvidenceReference]
    momentum_shifts: list[MomentumInsight]
    top_players: list[PlayerStats]
    verified_insights: list[RecapSection]
    player_of_the_match: Optional[dict] = None
    team_stats: dict[str, TeamStats]
    ai_mode: str


class Capabilities(BaseModel):
    ai_mode: Literal["demo", "foundry"]
    ai_mode_label: str
    foundry_configured: bool
    foundry_endpoint_host: Optional[str] = None
    foundry_model: Optional[str] = None
    agent_framework_available: bool
    evaluation_sdk_available: bool
    groundedness_evaluator_enabled: bool
    credential_source: Optional[str] = None
    notes: list[str] = Field(default_factory=list)
