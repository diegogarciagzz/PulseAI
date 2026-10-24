"""Deterministic statistics derived from the authoritative event list.

Possession is computed from *ball time*: every event belongs to a possession
sequence owned by one team, so the time between the first and last event of each
sequence (plus the gap until the next sequence starts) is credited to the owner.
A second reading, the share of completed passes, is kept so Narrative VAR can flag
a CONFLICTED claim when the two methods disagree about who had more of the ball.
"""
from __future__ import annotations

from collections import defaultdict

from app.models.core import EventType, MatchEvent, PlayerStats, TeamStats
from app.simulator.rosters import TEAMS

FULL_T = 90 * 60


def _in_window(e: MatchEvent, start_t: int, end_t: int) -> bool:
    return start_t <= e.t <= end_t


def possession_seconds(events: list[MatchEvent], start_t: int = 0, end_t: int = FULL_T) -> dict[str, float]:
    """Seconds of in-play possession per team inside [start_t, end_t]."""
    # Build (owner, start, end) possession spells from sequence ids.
    spells: list[tuple[str, int, int]] = []
    cur_owner, cur_seq, cur_start = None, None, 0
    last_t = 0
    for e in events:
        if e.type in (EventType.HALFTIME, EventType.FULLTIME):
            if cur_owner is not None:
                spells.append((cur_owner, cur_start, e.t))
            cur_owner, cur_seq = None, None
            continue
        if e.team is None:
            continue
        if e.sequence_id != cur_seq:
            if cur_owner is not None:
                spells.append((cur_owner, cur_start, e.t))
            cur_owner, cur_seq, cur_start = e.team, e.sequence_id, e.t
        last_t = e.t
    if cur_owner is not None:
        spells.append((cur_owner, cur_start, last_t))
    out: dict[str, float] = defaultdict(float)
    for owner, s, t in spells:
        a, b = max(s, start_t), min(t, end_t)
        if b > a:
            out[owner] += b - a
    return out


def team_stats(events: list[MatchEvent], team: str, start_t: int = 0, end_t: int = FULL_T) -> TeamStats:
    poss = possession_seconds(events, start_t, end_t)
    total = sum(poss.values()) or 1.0
    ev = [e for e in events if e.team == team and _in_window(e, start_t, end_t)]
    passes = [e for e in ev if e.type == EventType.PASS]
    completed = [e for e in passes if e.outcome == "complete"]
    shots = [e for e in ev if e.type == EventType.SHOT]
    all_completed = [e for e in events if e.type == EventType.PASS and e.outcome == "complete" and _in_window(e, start_t, end_t)]
    st = TeamStats(
        team=team,
        possession_pct=round(100.0 * poss.get(team, 0.0) / total, 1),
        possession_pct_by_passes=round(100.0 * len(completed) / max(1, len(all_completed)), 1),
        passes=len(passes), passes_completed=len(completed),
        pass_accuracy=round(100.0 * len(completed) / max(1, len(passes)), 1),
        progressive_passes=sum(1 for e in completed if e.progressive),
        final_third_entries=sum(1 for e in ev if e.final_third_entry and e.type in (EventType.PASS, EventType.CARRY) and e.outcome == "complete"),
        box_entries=sum(1 for e in ev if e.box_entry and e.type in (EventType.PASS, EventType.CARRY) and e.outcome == "complete"),
        shots=len(shots), shots_on_target=sum(1 for e in shots if e.outcome in ("on_target", "goal")),
        goals=sum(1 for e in ev if e.type == EventType.GOAL), xg=round(sum(e.xg or 0 for e in shots), 2),
        recoveries=sum(1 for e in ev if e.type == EventType.RECOVERY),
        tackles=sum(1 for e in ev if e.type == EventType.TACKLE),
        interceptions=sum(1 for e in ev if e.type == EventType.INTERCEPTION),
        corners=sum(1 for e in ev if e.type == EventType.CORNER),
        fouls=sum(1 for e in ev if e.type == EventType.FOUL),
        cards=sum(1 for e in ev if e.type == EventType.CARD),
        carries=sum(1 for e in ev if e.type == EventType.CARRY),
    )
    return st


def minutes_played(events: list[MatchEvent], player_id: str, team: str, end_t: int = FULL_T) -> int:
    starters = {p.id for p in TEAMS[team].players if p.starter}
    on_t = 0 if player_id in starters else None
    off_t = None
    for e in events:
        if e.type != EventType.SUBSTITUTION or e.t > end_t:
            continue
        if e.player_id == player_id:
            on_t = e.t
        if e.related_player_id == player_id:
            off_t = e.t
    if on_t is None:
        return 0
    return max(0, (min(end_t, FULL_T) if off_t is None else min(off_t, end_t)) - on_t) // 60


def player_stats(events: list[MatchEvent], start_t: int = 0, end_t: int = FULL_T) -> dict[str, PlayerStats]:
    out: dict[str, PlayerStats] = {}
    for team in TEAMS.values():
        for p in team.players:
            out[p.id] = PlayerStats(player_id=p.id, name=p.name, number=p.number, team=p.team, position=p.position, role=p.role,
                                    minutes=minutes_played(events, p.id, p.team, end_t))
    ev = [e for e in events if _in_window(e, start_t, end_t)]
    by_id = {e.id: e for e in ev}
    # assist / pre-assist bookkeeping needs the sequence context
    for i, e in enumerate(ev):
        if e.player_id is None or e.player_id not in out:
            continue
        s = out[e.player_id]
        if e.type in (EventType.PASS, EventType.CARRY, EventType.SHOT, EventType.RECOVERY, EventType.TACKLE, EventType.INTERCEPTION):
            s.touches += 1
        if e.type == EventType.PASS:
            s.passes += 1
            if e.outcome == "complete":
                s.passes_completed += 1
                if e.progressive:
                    s.progressive_passes += 1
                if e.key_pass:
                    s.key_passes += 1
                if e.final_third_entry:
                    s.final_third_entries += 1
        elif e.type == EventType.CARRY:
            s.carries += 1
            if e.final_third_entry:
                s.final_third_entries += 1
        elif e.type == EventType.SHOT:
            s.shots += 1
            s.xg = round(s.xg + (e.xg or 0), 2)
            if e.outcome in ("on_target", "goal"):
                s.shots_on_target += 1
        elif e.type == EventType.GOAL:
            s.goals += 1
            s.goals_involved += 1
            if e.related_player_id and e.related_player_id in out:
                out[e.related_player_id].assists += 1
                out[e.related_player_id].goals_involved += 1
                # pre-assist: the completed pass to the assister just before the assist, same sequence
                for prev in reversed(ev[max(0, i - 8):i]):
                    if prev.type == EventType.PASS and prev.outcome == "complete" and prev.related_player_id == e.related_player_id \
                            and prev.sequence_id == e.sequence_id and prev.player_id in out and prev.player_id != e.player_id:
                        out[prev.player_id].pre_assists += 1
                        break
        elif e.type == EventType.RECOVERY:
            s.recoveries += 1
            s.defensive_actions += 1
        elif e.type == EventType.TACKLE:
            s.tackles += 1
            s.defensive_actions += 1
        elif e.type == EventType.INTERCEPTION:
            s.interceptions += 1
            s.defensive_actions += 1
        elif e.type == EventType.FOUL:
            s.fouls += 1
        elif e.type == EventType.CARD:
            s.cards += 1
    for s in out.values():
        s.pass_accuracy = round(100.0 * s.passes_completed / s.passes, 1) if s.passes else 0.0
    del by_id
    return out


def score_at(events: list[MatchEvent], t: int) -> tuple[int, int]:
    h = a = 0
    for e in events:
        if e.t > t:
            break
        h, a = e.score_home, e.score_away
    return h, a


def events_until(events: list[MatchEvent], t: int) -> list[MatchEvent]:
    return [e for e in events if e.t <= t]
