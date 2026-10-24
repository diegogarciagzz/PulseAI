"""Labelled Narrative VAR evaluation dataset.

Each case is generated from the *actual* synthetic match so the expected label is
grounded in real computed numbers (a "false numeric" case really is off by more than
the tolerance, a "fabricated contribution" really did not happen). Cases are tagged by
category so the report can break results down.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from app.analytics.stats import player_stats, team_stats
from app.models.core import EventType
from app.services.match_store import Match
from app.simulator.rosters import TEAMS


@dataclass
class EvalCase:
    id: str
    category: str
    text: str
    expected: str
    at_t: int = 5400
    notes: str = ""
    tags: list[str] = field(default_factory=list)


def build_dataset(match: Match) -> list[EvalCase]:
    ev = match.events
    home, away = match.home, match.away
    H, A = TEAMS[home].name, TEAMS[away].name
    hs, as_ = team_stats(ev, home), team_stats(ev, away)
    ps = player_stats(ev)
    goals = [e for e in ev if e.type == EventType.GOAL]
    scorer = goals[0]
    last_goal = goals[-1]
    assister = next((g for g in goals if g.related_player_id), None)
    w67 = team_stats(ev, home, 57 * 60, 67 * 60)
    first_half_home = team_stats(ev, home, 0, 2700)
    top_prog = max((p for p in ps.values() if p.team == home), key=lambda p: p.progressive_passes)
    top_rec = max((p for p in ps.values() if p.team == away), key=lambda p: p.recoveries)
    non_scorer = next(p for p in sorted(ps.values(), key=lambda s: -s.touches) if p.goals == 0 and p.minutes > 30)
    bench_unused = next(p for p in ps.values() if p.minutes == 0)
    sub = next((e for e in ev if e.type == EventType.SUBSTITUTION), None)
    pid = match.meta.id
    cases = [
        # supported
        EvalCase(f"{pid}-s1", "supported", f"{H} have had {hs.shots} shots and {hs.shots_on_target} on target.", "verified"),
        EvalCase(f"{pid}-s2", "supported", f"{scorer.player_name} scored in the {scorer.minute}th minute.", "verified"),
        EvalCase(f"{pid}-s3", "supported", f"{top_prog.name} made {top_prog.progressive_passes} progressive passes.", "verified"),
        EvalCase(f"{pid}-s4", "supported", f"In the first half {H} had {first_half_home.possession_pct:.0f}% possession.", "verified", at_t=2700),
        EvalCase(f"{pid}-s5", "supported", f"{A} have won {as_.corners} corners.", "verified"),
        EvalCase(f"{pid}-s6", "supported", f"{top_rec.name} has {top_rec.recoveries} recoveries and {top_rec.interceptions} interceptions.", "verified"),
        # false numeric
        EvalCase(f"{pid}-f1", "false-numeric", f"{H} has dominated the last ten minutes with 85% possession.", "corrected", at_t=67 * 60,
                 notes=f"actual {w67.possession_pct}%"),
        EvalCase(f"{pid}-f2", "false-numeric", f"{H} have had {hs.shots + 7} shots tonight.", "corrected"),
        EvalCase(f"{pid}-f3", "false-numeric", f"{top_prog.name} made {top_prog.progressive_passes + 12} progressive passes.", "corrected"),
        EvalCase(f"{pid}-f4", "false-numeric", f"{scorer.player_name} scored a hat-trick.", "corrected" if ps[scorer.player_id].goals != 3 else "verified"),
        EvalCase(f"{pid}-f5", "false-numeric", f"{A} have had {as_.shots_on_target + 3} shots on target.", "corrected"),
        # fabricated contributions
        EvalCase(f"{pid}-x1", "fabricated-contribution", f"{non_scorer.name} scored twice.", "unsupported"),
        EvalCase(f"{pid}-x2", "fabricated-contribution", f"{bench_unused.name} assisted the winner.", "unsupported"),
        EvalCase(f"{pid}-x3", "fabricated-contribution", "Jordan Blake scored the equaliser.", "unsupported"),
        EvalCase(f"{pid}-x4", "fabricated-contribution", f"{bench_unused.name} made 6 tackles.", "corrected", notes="player exists but played 0 minutes: figure corrected to 0"),
        # missing evidence / outside data
        EvalCase(f"{pid}-m1", "missing-evidence", f"{H} look nervous at the back.", "unverified"),
        EvalCase(f"{pid}-m2", "missing-evidence", "The referee has lost control of this match.", "unverified"),
        EvalCase(f"{pid}-m3", "missing-evidence", f"{A} have covered 112 kilometres as a team.", "unverified", notes="distance covered is not tracked"),
        # contradictory
        EvalCase(f"{pid}-c1", "contradictory", f"{A if hs.shots > as_.shots else H} have had more shots than {H if hs.shots > as_.shots else A}.", "unsupported"),
        EvalCase(f"{pid}-c2", "contradictory", f"{scorer.player_name} scored.", "unsupported", at_t=max(0, scorer.t - 60), notes="goal exists later; must not verify before it happens"),
        # correct grounded statements with windows
        EvalCase(f"{pid}-g1", "grounded", f"Between {last_goal.minute - 5}' and {last_goal.minute + 1}' {TEAMS[last_goal.team].name} scored {sum(1 for g in goals if g.team == last_goal.team and (last_goal.minute - 5) * 60 <= g.t <= (last_goal.minute + 1) * 60)} goals.", "verified"),
    ]
    if assister:
        cases.append(EvalCase(f"{pid}-s7", "supported", f"{assister.related_player_name} assisted {assister.player_name}.", "verified"))
    if sub:
        cases.append(EvalCase(f"{pid}-s8", "supported", f"{sub.player_name} came on for {sub.related_player_name}.", "verified"))
    return cases
