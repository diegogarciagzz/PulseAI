"""In-memory registry of generated matches with cached analytics."""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from app.analytics.insights import detect_insights
from app.analytics.pulse import compute_pulse
from app.analytics.stats import player_stats, team_stats
from app.models.core import MatchEvent, MatchMeta, MomentumInsight, PlayerStats, PulsePoint, ScoreState, TeamStats
from app.simulator.engine import simulate
from app.simulator.scenarios import SCENARIOS, Scenario

DATA_DIR = Path(__file__).resolve().parents[3] / "data" / "scenarios"


@dataclass
class Match:
    meta: MatchMeta
    scenario: Scenario
    events: list[MatchEvent]
    pulse: list[PulsePoint] = field(default_factory=list)
    insights: list[MomentumInsight] = field(default_factory=list)
    _player_stats: dict[str, PlayerStats] | None = None
    _team_stats: dict[str, TeamStats] | None = None

    @property
    def home(self) -> str:
        return self.meta.home

    @property
    def away(self) -> str:
        return self.meta.away

    def final_player_stats(self) -> dict[str, PlayerStats]:
        if self._player_stats is None:
            self._player_stats = player_stats(self.events)
        return self._player_stats

    def final_team_stats(self) -> dict[str, TeamStats]:
        if self._team_stats is None:
            self._team_stats = {t: team_stats(self.events, t) for t in (self.home, self.away)}
        return self._team_stats

    def event_by_id(self, event_id: str) -> MatchEvent | None:
        return next((e for e in self.events if e.id == event_id), None)


class MatchStore:
    def __init__(self) -> None:
        self._matches: dict[str, Match] = {}

    @staticmethod
    def match_id(scenario_key: str, seed: int) -> str:
        return f"{scenario_key}-{seed}"

    def generate(self, scenario_key: str, seed: int | None = None) -> Match:
        scenario = SCENARIOS[scenario_key]
        seed = scenario.seed if seed is None else seed
        mid = self.match_id(scenario_key, seed)
        if mid in self._matches:
            return self._matches[mid]
        events = simulate(scenario, seed)
        last = events[-1]
        meta = MatchMeta(id=mid, scenario=scenario_key, title=scenario.title, description=scenario.description, seed=seed,
                         home=scenario.home, away=scenario.away, created_at=datetime.now(timezone.utc).isoformat(),
                         event_count=len(events), final_score=ScoreState(home=last.score_home, away=last.score_away))
        m = Match(meta=meta, scenario=scenario, events=events)
        m.pulse = compute_pulse(events, scenario.home, scenario.away)
        m.insights = detect_insights(events, scenario.home, scenario.away, m.pulse)
        self._matches[mid] = m
        return m

    def get(self, match_id: str) -> Match | None:
        if match_id in self._matches:
            return self._matches[match_id]
        # lazily regenerate well-formed ids ("<scenario>-<seed>") so restarts are harmless
        if "-" in match_id:
            key, _, seed = match_id.rpartition("-")
            if key in SCENARIOS and seed.isdigit():
                return self.generate(key, int(seed))
        return None

    def list(self) -> list[MatchMeta]:
        return [m.meta for m in self._matches.values()]

    def ensure_defaults(self) -> None:
        for key in SCENARIOS:
            self.generate(key)

    def export_fixture(self, match: Match) -> Path:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        path = DATA_DIR / f"{match.meta.id}.jsonl"
        with path.open("w", encoding="utf-8") as fh:
            fh.write(json.dumps({"meta": match.meta.model_dump()}) + "\n")
            for e in match.events:
                fh.write(json.dumps(e.model_dump(mode="json")) + "\n")
        return path

    @staticmethod
    def fingerprint(events: list[MatchEvent]) -> str:
        h = hashlib.sha256()
        for e in events:
            h.update(e.model_dump_json().encode())
        return h.hexdigest()[:16]


store = MatchStore()
