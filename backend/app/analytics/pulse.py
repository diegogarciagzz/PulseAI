"""Match Pulse: a deterministic, documented momentum signal.

Algorithm (also described in docs/architecture.md):

1. Every event earns its team a *threat weight* (table below). Weights favour actions
   that move the ball towards goal and actions that win it back high up the pitch.
2. Weights are accumulated into 30-second buckets per team.
3. Each team's bucket series is smoothed with an exponential moving average whose
   half-life is 150 seconds (five buckets), so a burst of pressure decays over a few
   minutes rather than vanishing instantly.
4. The smoothed scores are normalised to 0..1 by a fixed scale (so values are
   comparable across matches and scenarios), then the chart value is the signed
   difference `home - away` clipped to -1..1.

The signal is a description of *activity and territory*, not a probability of
scoring. The UI labels it as a momentum index for that reason.
"""
from __future__ import annotations

import math

from app.models.core import EventType, MatchEvent, PulsePoint

BUCKET = 30  # seconds
HALF_LIFE = 150.0  # seconds
SCALE = 9.0  # smoothed weight that maps to momentum 1.0
FULL_T = 90 * 60


def event_weight(e: MatchEvent) -> float:
    x = e.end_x if e.end_x is not None else (e.x or 0.0)
    if e.type == EventType.GOAL:
        return 14.0
    if e.type == EventType.SHOT:
        base = {"goal": 2.0, "on_target": 3.5, "blocked": 2.0, "off_target": 1.6}.get(e.outcome or "", 1.6)
        return base + 2.0 * (e.xg or 0.0)
    if e.type == EventType.PASS:
        if e.outcome != "complete":
            return -0.3
        w = 0.15
        if e.progressive:
            w += 0.5
        if e.final_third_entry:
            w += 0.9
        if e.box_entry:
            w += 1.2
        if e.key_pass:
            w += 0.8
        if x >= 70:
            w += 0.25
        return w
    if e.type == EventType.CARRY:
        w = 0.2
        if e.progressive:
            w += 0.5
        if e.final_third_entry:
            w += 0.9
        if e.box_entry:
            w += 1.2
        return w
    if e.type in (EventType.RECOVERY, EventType.INTERCEPTION, EventType.TACKLE):
        # winning the ball high up the pitch is a pressure signal
        return 0.6 + (1.2 if (e.x or 0) >= 52.5 else 0.0) + (0.8 if (e.x or 0) >= 70 else 0.0)
    if e.type == EventType.CORNER:
        return 1.4
    if e.type == EventType.FOUL:
        return -0.2
    return 0.0


def compute_pulse(events: list[MatchEvent], home: str, away: str, until_t: int | None = None) -> list[PulsePoint]:
    end = FULL_T if until_t is None else min(until_t, FULL_T)
    n = end // BUCKET + 1
    raw = {home: [0.0] * n, away: [0.0] * n}
    counts = {home: [0] * n, away: [0] * n}
    for e in events:
        if e.team not in raw or e.t > end:
            continue
        w = event_weight(e)
        if w == 0.0:
            continue
        b = min(n - 1, e.t // BUCKET)
        raw[e.team][b] += w
        counts[e.team][b] += 1
    alpha = 1.0 - math.exp(-math.log(2) * BUCKET / HALF_LIFE)
    smooth = {home: [0.0] * n, away: [0.0] * n}
    for team in (home, away):
        acc = 0.0
        for i in range(n):
            # reset across half-time so first-half pressure does not bleed into the second half
            if i * BUCKET == 45 * 60:
                acc = 0.0
            acc = acc + alpha * (raw[team][i] - acc)
            smooth[team][i] = acc
    points: list[PulsePoint] = []
    for i in range(n):
        h = min(1.0, max(0.0, smooth[home][i] / SCALE))
        a = min(1.0, max(0.0, smooth[away][i] / SCALE))
        t = i * BUCKET
        points.append(PulsePoint(t=t, minute=round(t / 60, 2), value=round(max(-1.0, min(1.0, h - a)), 3),
                                 home=round(h, 3), away=round(a, 3), home_events=counts[home][i], away_events=counts[away][i]))
    return points
