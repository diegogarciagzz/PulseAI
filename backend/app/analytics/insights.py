"""Deterministic moment detection on top of Match Pulse and the event list.

Every insight carries the ids of the events that produced it and a short set of
supporting statistics computed over its window, so Narrative VAR and the UI can
show evidence rather than assertions.
"""
from __future__ import annotations

from app.analytics.pulse import compute_pulse
from app.analytics.stats import team_stats
from app.models.core import EventType, EvidenceReference, InsightKind, MatchEvent, MomentumInsight, PulsePoint
from app.simulator.rosters import TEAMS

FULL_T = 90 * 60


def evidence_ref(e: MatchEvent) -> EvidenceReference:
    return EvidenceReference(event_id=e.id, t=e.t, minute=e.minute, type=e.type.value, team=e.team,
                             player_name=e.player_name, description=e.description)


def _window_events(events: list[MatchEvent], team: str, start_t: int, end_t: int, types: set[EventType] | None = None) -> list[MatchEvent]:
    return [e for e in events if e.team == team and start_t <= e.t <= end_t and (types is None or e.type in types)]


def _label(start_t: int, end_t: int) -> str:
    return f"{start_t // 60}' to {-(-end_t // 60)}'"


def _snap(start_t: int, end_t: int) -> tuple[int, int]:
    """Snap a window outwards to whole minutes so the text label 'A' to B'' means exactly [A*60, B*60]."""
    return max(0, (start_t // 60) * 60), min(FULL_T, -(-end_t // 60) * 60)


def detect_insights(events: list[MatchEvent], home: str, away: str, pulse: list[PulsePoint] | None = None) -> list[MomentumInsight]:
    pulse = pulse or compute_pulse(events, home, away)
    out: list[MomentumInsight] = []
    n = 0

    def nid() -> str:
        nonlocal n
        n += 1
        return f"I{n:02d}"

    # 1. Momentum swings: sign flips of the smoothed signal with enough amplitude on both sides.
    THRESH = 0.18
    side_prev, extreme = 0, 0.0
    cooldown_until = -1
    for p in pulse:
        side = 1 if p.value >= THRESH else (-1 if p.value <= -THRESH else 0)
        if side == 0:
            continue
        if side_prev == 0 or side == side_prev:
            if side_prev == 0:
                extreme = p.value
            extreme = max(extreme, p.value) if side > 0 else min(extreme, p.value)
            side_prev = side
            continue
        # sign flip
        if p.t >= cooldown_until:
            team = home if side > 0 else away
            start_t, end_t = _snap(max(0, p.t - 300), p.t)
            ts = team_stats(events, team, start_t, end_t)
            evs = _window_events(events, team, start_t, end_t, {EventType.SHOT, EventType.RECOVERY, EventType.INTERCEPTION, EventType.TACKLE})
            evs += [e for e in _window_events(events, team, start_t, end_t, {EventType.PASS, EventType.CARRY}) if e.final_third_entry or e.box_entry]
            evs.sort(key=lambda e: e.t)
            swing = abs(p.value - extreme)
            out.append(MomentumInsight(
                id=nid(), kind=InsightKind.MOMENTUM_SWING, minute=p.t // 60, t=p.t, window_start_t=start_t, window_end_t=end_t, team=team,
                importance=round(min(1.0, 0.45 + swing * 0.5), 2),
                headline=f"Momentum swings to {TEAMS[team].name.replace(' FC', '')}",
                explanation=(f"The Match Pulse index moved from {extreme:+.2f} to {p.value:+.2f} between {_label(start_t, end_t)}. "
                             f"In that window {TEAMS[team].short} recorded {ts.shots} shot{'s' if ts.shots != 1 else ''}, "
                             f"{ts.final_third_entries} final-third entries and {ts.recoveries + ts.interceptions + ts.tackles} ball wins, "
                             f"with {ts.possession_pct:.0f}% possession."),
                stats={"pulse_before": round(extreme, 2), "pulse_after": p.value, "shots": ts.shots, "final_third_entries": ts.final_third_entries,
                       "ball_wins": ts.recoveries + ts.interceptions + ts.tackles, "possession_pct": ts.possession_pct, "window": _label(start_t, end_t)},
                event_ids=[e.id for e in evs][:40], evidence=[evidence_ref(e) for e in evs][:12], marker_kind="momentum-shift"))
            cooldown_until = p.t + 240
        side_prev, extreme = side, p.value

    # 2. Pressure surges: a team's own momentum above 0.55 for at least 3 minutes.
    for team in (home, away):
        run_start = None
        for p in pulse + [PulsePoint(t=FULL_T + 30, minute=91, value=0, home=0, away=0)]:
            v = p.home if team == home else p.away
            if v >= 0.55 and run_start is None:
                run_start = p.t
            elif v < 0.55 and run_start is not None:
                if p.t - run_start >= 180:
                    start_t, end_t = _snap(max(0, run_start - 60), p.t)
                    ts = team_stats(events, team, start_t, end_t)
                    wins = _window_events(events, team, start_t, end_t, {EventType.RECOVERY, EventType.INTERCEPTION, EventType.TACKLE})
                    high_wins = [e for e in wins if (e.x or 0) >= 52.5]
                    entries = [e for e in _window_events(events, team, start_t, end_t, {EventType.PASS, EventType.CARRY}) if e.final_third_entry]
                    peak = max((pp.home if team == home else pp.away) for pp in pulse if start_t <= pp.t <= end_t)
                    out.append(MomentumInsight(
                        id=nid(), kind=InsightKind.PRESSURE_SURGE, minute=run_start // 60, t=run_start, window_start_t=start_t, window_end_t=end_t, team=team,
                        importance=round(min(1.0, 0.35 + peak * 0.5 + (end_t - start_t) / 1800), 2),
                        headline=f"{TEAMS[team].name.replace(' FC', '')} pressure spell, {_label(start_t, end_t)}",
                        explanation=(f"{TEAMS[team].short} kept their momentum index above 0.55 for {(p.t - run_start) // 60} minutes. "
                                     f"Between {_label(start_t, end_t)} they won the ball {len(high_wins)} times in the opposition half, "
                                     f"made {len(entries)} final-third entries and took {ts.shots} shots (xG {ts.xg:.2f}) while holding {ts.possession_pct:.0f}% possession."),
                        stats={"peak_momentum": round(peak, 2), "duration_min": (p.t - run_start) // 60, "high_ball_wins": len(high_wins),
                               "final_third_entries": len(entries), "shots": ts.shots, "xg": ts.xg, "possession_pct": ts.possession_pct, "window": _label(start_t, end_t)},
                        event_ids=[e.id for e in sorted(high_wins + entries, key=lambda e: e.t)][:40],
                        evidence=[evidence_ref(e) for e in sorted(high_wins + entries, key=lambda e: e.t)][:12], marker_kind="attacking-pressure"))
                run_start = None

    # 3. Attacking surges: three or more shots by one team inside five minutes.
    for team in (home, away):
        shots = [e for e in events if e.team == team and e.type == EventType.SHOT]
        i = 0
        while i < len(shots):
            j = i
            while j + 1 < len(shots) and shots[j + 1].t - shots[i].t <= 300:
                j += 1
            if j - i + 1 >= 3:
                grp = shots[i:j + 1]
                start_t, end_t = _snap(grp[0].t, grp[-1].t)
                grp = [e for e in shots if start_t <= e.t <= end_t]
                xg = sum(e.xg or 0 for e in grp)
                on_t = sum(1 for e in grp if e.outcome in ("on_target", "goal"))
                out.append(MomentumInsight(
                    id=nid(), kind=InsightKind.ATTACKING_SURGE, minute=start_t // 60, t=start_t, window_start_t=start_t, window_end_t=end_t, team=team,
                    importance=round(min(1.0, 0.3 + 0.08 * len(grp) + xg * 0.3), 2),
                    headline=f"{TEAMS[team].short} shot flurry: {len(grp)} shots in {max(1, (end_t - start_t) // 60)} minutes",
                    explanation=(f"Between {_label(start_t, end_t)} {TEAMS[team].name.replace(' FC', '')} took {len(grp)} shots, {on_t} on target, "
                                 f"worth {xg:.2f} xG in total."),
                    stats={"shots": len(grp), "on_target": on_t, "xg": round(xg, 2), "window": _label(start_t, end_t)},
                    event_ids=[e.id for e in grp], evidence=[evidence_ref(e) for e in grp], marker_kind="high-intensity"))
                i = j + 1
            else:
                i += 1

    # 4. Defensive stands: a ball win inside the own box that ends an opponent spell with a shot in the previous 90 s.
    for team in (home, away):
        opp = away if team == home else home
        stand_cooldown = -1
        for k, e in enumerate(events):
            if e.team != team or e.type not in (EventType.TACKLE, EventType.INTERCEPTION, EventType.RECOVERY) or (e.x or 99) > 18 or e.t < stand_cooldown:
                continue
            prior = [p for p in events[max(0, k - 25):k] if p.team == opp and e.t - p.t <= 90]
            opp_shots = [p for p in prior if p.type == EventType.SHOT]
            opp_entries = [p for p in prior if p.box_entry]
            if len(opp_shots) >= 1 and len(opp_shots) + len(opp_entries) >= 3:
                stand_cooldown = e.t + 420
                ws, we = _snap(max(0, e.t - 90), e.t)
                w_shots = [p for p in events if p.team == opp and p.type == EventType.SHOT and ws <= p.t <= we]
                w_entries = [p for p in events if p.team == opp and p.box_entry and p.type in (EventType.PASS, EventType.CARRY) and p.outcome == "complete" and ws <= p.t <= we]
                refs = sorted(w_shots + w_entries + [e], key=lambda z: z.t)
                out.append(MomentumInsight(
                    id=nid(), kind=InsightKind.DEFENSIVE_STAND, minute=e.minute, t=e.t, window_start_t=ws, window_end_t=we, team=team,
                    importance=round(min(1.0, 0.35 + 0.1 * len(opp_shots) + 0.05 * len(opp_entries)), 2),
                    headline=f"{e.player_name} ends a {TEAMS[opp].short} siege",
                    explanation=(f"{e.player_name} won the ball inside the {TEAMS[team].short} box at {e.minute}'. "
                                 f"Between {_label(ws, we)} {TEAMS[opp].short} had {len(w_shots)} shot{'s' if len(w_shots) != 1 else ''} and {len(w_entries)} box entries."),
                    stats={"opp_shots": len(w_shots), "opp_box_entries": len(w_entries), "window": _label(ws, we)},
                    event_ids=[z.id for z in refs], evidence=[evidence_ref(z) for z in refs], marker_kind="defensive-recovery"))

    # 5. Goal build-ups: the possession sequence that produced each goal.
    for e in events:
        if e.type != EventType.GOAL or e.team is None:
            continue
        seq = [z for z in events if z.sequence_id == e.sequence_id and z.t <= e.t]
        passes = [z for z in seq if z.type == EventType.PASS and z.outcome == "complete"]
        start = seq[0]
        out.append(MomentumInsight(
            id=nid(), kind=InsightKind.GOAL_BUILDUP, minute=e.minute, t=e.t, window_start_t=start.t, window_end_t=e.t, team=e.team,
            importance=1.0,
            headline=f"GOAL {e.player_name} ({TEAMS[e.team].short}) {e.score_home}-{e.score_away}",
            explanation=(f"The goal came from a {len(passes)}-pass move lasting {e.t - start.t} seconds that started with {start.player_name}"
                         f"{' winning the ball' if start.type in (EventType.RECOVERY, EventType.INTERCEPTION, EventType.TACKLE) else ''}. "
                         + (f"Assist: {e.related_player_name}. " if e.related_player_name else "") + f"Shot xG {e.xg:.2f}."),
            stats={"passes_in_move": len(passes), "move_seconds": e.t - start.t, "xg": e.xg or 0, "score": f"{e.score_home}-{e.score_away}",
                   "assist": e.related_player_name or "none", "window": _label(start.t, e.t)},
            event_ids=[z.id for z in seq], evidence=[evidence_ref(z) for z in seq][-10:], marker_kind="goal"))

    # 6. Substitution impact: compare the team's momentum 10 minutes before and after a change.
    for e in events:
        if e.type != EventType.SUBSTITUTION or e.team is None:
            continue
        before = [p for p in pulse if e.t - 600 <= p.t < e.t]
        after = [p for p in pulse if e.t <= p.t <= e.t + 600]
        if not before or not after:
            continue
        key = "home" if e.team == home else "away"
        b = sum(getattr(p, key) for p in before) / len(before)
        a = sum(getattr(p, key) for p in after) / len(after)
        if a - b >= 0.18:
            bs, be = _snap(e.t - 600, e.t)
            as_, ae = _snap(e.t, e.t + 600)
            ts_b = team_stats(events, e.team, bs, be)
            ts_a = team_stats(events, e.team, as_, ae)
            out.append(MomentumInsight(
                id=nid(), kind=InsightKind.SUBSTITUTION_IMPACT, minute=e.minute, t=e.t, window_start_t=e.t - 600, window_end_t=e.t + 600, team=e.team,
                importance=round(min(1.0, 0.4 + (a - b)), 2),
                headline=f"{e.player_name} lifts {TEAMS[e.team].short} after coming on",
                explanation=(f"{TEAMS[e.team].short} averaged a momentum index of {b:.2f} in the ten minutes before {e.player_name} replaced "
                             f"{e.related_player_name} and {a:.2f} in the ten minutes after. Between {_label(bs, be)} {TEAMS[e.team].short} took {ts_b.shots} shots; "
                             f"between {_label(as_, ae)} they took {ts_a.shots} shots and made {ts_a.final_third_entries} final-third entries."),
                stats={"momentum_before": round(b, 2), "momentum_after": round(a, 2), "shots_before": ts_b.shots, "shots_after": ts_a.shots,
                       "entries_before": ts_b.final_third_entries, "entries_after": ts_a.final_third_entries, "window": _label(e.t - 600, e.t + 600)},
                event_ids=[e.id], evidence=[evidence_ref(e)], marker_kind="substitution"))

    out.sort(key=lambda i: (i.t, -i.importance))
    return out
