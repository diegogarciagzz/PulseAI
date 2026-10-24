"""Narrative VAR: deterministic verification of commentary claims against the event log.

Status rules (mirrors the brand kit's six states):
  VERIFIED     the claim matches the computed evidence within tolerance
  CORRECTED    a figure exists for the metric but the stated number is wrong; a fix is proposed
  UNSUPPORTED  evidence contradicts the claim (a goal that never happened, a player not in the match)
  CONFLICTED   two defensible readings of the same metric disagree about the claim
  UNVERIFIED   outside the data we hold (opinions, unknown metrics, empty windows)
  CHECKING     transient, only used by the UI while a request is in flight

Numbers are never judged by a language model. Every verdict comes with the event
references that were used, and an audit trail of what was computed.
"""
from __future__ import annotations

import uuid

from app.analytics.insights import evidence_ref
from app.analytics.stats import player_stats, team_stats
from app.models.core import ClaimCheck, ClaimWindow, EventType, EvidenceReference, MatchEvent, NarrativeClaim, VarStatus, VerificationResult
from app.simulator.rosters import TEAMS
from app.verification.claims import extract_claims

FULL_T = 90 * 60

COUNT_TOLERANCE = 0  # exact for integer counts
PCT_TOLERANCE = 4.0  # percentage points, covers rounding and "about"
XG_TOLERANCE = 0.25

METRIC_LABEL = {
    "possession_pct": "possession", "shots": "shots", "shots_on_target": "shots on target", "xg": "xG", "final_third_entries": "final-third entries",
    "box_entries": "box entries", "progressive_passes": "progressive passes", "key_passes": "key passes", "pass_accuracy": "pass accuracy",
    "passes_completed": "completed passes", "passes": "passes", "recoveries": "ball recoveries", "tackles": "tackles", "interceptions": "interceptions",
    "defensive_actions": "defensive actions", "corners": "corners", "fouls": "fouls", "assists": "assists", "goals": "goals", "touches": "touches",
    "cards": "cards", "substitution": "substitution", "high_ball_wins": "ball wins in the opposition half",
}

EVENT_FOR_METRIC: dict[str, tuple[set[EventType], callable]] = {}


def _events_for_metric(events: list[MatchEvent], metric: str, team: str | None, player_id: str | None, w: ClaimWindow) -> list[MatchEvent]:
    sel = [e for e in events if w.start_t <= e.t <= w.end_t and (team is None or e.team == team) and (player_id is None or e.player_id == player_id)]
    if metric == "goals":
        return [e for e in sel if e.type == EventType.GOAL]
    if metric == "assists":
        return [e for e in events if w.start_t <= e.t <= w.end_t and e.type == EventType.GOAL and (player_id is None or e.related_player_id == player_id) and (team is None or e.team == team)]
    if metric == "shots":
        return [e for e in sel if e.type == EventType.SHOT]
    if metric == "shots_on_target":
        return [e for e in sel if e.type == EventType.SHOT and e.outcome in ("on_target", "goal")]
    if metric == "xg":
        return [e for e in sel if e.type == EventType.SHOT]
    if metric in ("passes", "pass_accuracy", "possession_pct"):
        return [e for e in sel if e.type == EventType.PASS]
    if metric == "passes_completed":
        return [e for e in sel if e.type == EventType.PASS and e.outcome == "complete"]
    if metric == "progressive_passes":
        return [e for e in sel if e.type == EventType.PASS and e.outcome == "complete" and e.progressive]
    if metric == "key_passes":
        return [e for e in sel if e.type == EventType.PASS and e.key_pass]
    if metric == "final_third_entries":
        return [e for e in sel if e.final_third_entry and e.type in (EventType.PASS, EventType.CARRY) and e.outcome == "complete"]
    if metric == "box_entries":
        return [e for e in sel if e.box_entry and e.type in (EventType.PASS, EventType.CARRY) and e.outcome == "complete"]
    if metric == "recoveries":
        return [e for e in sel if e.type == EventType.RECOVERY]
    if metric == "tackles":
        return [e for e in sel if e.type == EventType.TACKLE]
    if metric == "interceptions":
        return [e for e in sel if e.type == EventType.INTERCEPTION]
    if metric == "defensive_actions":
        return [e for e in sel if e.type in (EventType.RECOVERY, EventType.TACKLE, EventType.INTERCEPTION)]
    if metric == "high_ball_wins":
        return [e for e in sel if e.type in (EventType.RECOVERY, EventType.TACKLE, EventType.INTERCEPTION) and (e.x or 0) >= 52.5]
    if metric == "corners":
        return [e for e in sel if e.type == EventType.CORNER]
    if metric == "fouls":
        return [e for e in sel if e.type == EventType.FOUL]
    if metric == "cards":
        return [e for e in sel if e.type == EventType.CARD]
    if metric == "substitution":
        return [e for e in events if w.start_t <= e.t <= w.end_t and e.type == EventType.SUBSTITUTION and (player_id is None or player_id in (e.player_id, e.related_player_id))]
    if metric == "touches":
        return [e for e in sel if e.type in (EventType.PASS, EventType.CARRY, EventType.SHOT, EventType.RECOVERY, EventType.TACKLE, EventType.INTERCEPTION)]
    return []


def _actual(events: list[MatchEvent], metric: str, team: str | None, player_id: str | None, w: ClaimWindow) -> tuple[float | None, dict[str, float]]:
    """Return (value, alternative readings)."""
    if metric == "high_ball_wins":
        return float(len(_events_for_metric(events, metric, team, player_id, w))), {}
    if player_id:
        ps = player_stats(events, w.start_t, w.end_t).get(player_id)
        if ps is None:
            return None, {}
        if metric == "substitution":
            return float(len(_events_for_metric(events, metric, None, player_id, w))), {}
        return float(getattr(ps, metric, 0.0)), {}
    if team:
        ts = team_stats(events, team, w.start_t, w.end_t)
        if metric == "possession_pct":
            return ts.possession_pct, {"ball time": ts.possession_pct, "completed passes share": ts.possession_pct_by_passes}
        if metric == "defensive_actions":
            return float(ts.recoveries + ts.tackles + ts.interceptions), {}
        if metric in ("assists", "key_passes", "touches"):
            ps = player_stats(events, w.start_t, w.end_t)
            return float(sum(getattr(p, metric) for p in ps.values() if p.team == team)), {}
        if not hasattr(ts, metric):
            return None, {}
        return float(getattr(ts, metric)), {}
    return None, {}


def _strength(n_events: int) -> int:
    return 0 if n_events == 0 else min(5, 1 + n_events // 2)


def _fmt(metric: str, v: float) -> str:
    if metric in ("possession_pct", "pass_accuracy"):
        return f"{v:.0f}%"
    if metric == "xg":
        return f"{v:.2f} xG"
    return f"{int(round(v))}"


def check_claim(events: list[MatchEvent], claim: NarrativeClaim, home: str, away: str, at_t: int) -> ClaimCheck:
    w = claim.window or ClaimWindow(start_t=0, end_t=at_t, label=f"whole match so far (0' to {at_t // 60}')")
    if claim.kind == "opinion":
        return ClaimCheck(claim=claim, status="unverified", reasoning="This is an opinion, not a factual statement. Narrative VAR does not judge opinions.", evidence_strength=0)
    if claim.kind == "unknown":
        return ClaimCheck(claim=claim, status="unverified", reasoning="No checkable statistic or event was recognised in this sentence, so it is outside the data we hold.", evidence_strength=0)

    # Fabricated player: a name that is not in either squad.
    if claim.player_name and claim.player_id is None:
        return ClaimCheck(claim=claim, status="unsupported", reasoning=f"'{claim.player_name}' is not in either match-day squad. The event log has no actions by this player.", evidence_strength=0)

    metric = claim.metric or ""
    team = claim.team
    if claim.player_id and not team:
        team = next((t.id for t in TEAMS.values() if any(p.id == claim.player_id for p in t.players)), None)
    if claim.kind == "comparison":
        if not team:
            return ClaimCheck(claim=claim, status="unverified", reasoning="The comparison does not name a team.", evidence_strength=0)
        other = away if team == home else home
        mine, alt_mine = _actual(events, metric, team, None, w)
        theirs, alt_theirs = _actual(events, metric, other, None, w)
        evs = _events_for_metric(events, metric, team, None, w)
        refs = [evidence_ref(e) for e in evs[:12]]
        if mine is None or theirs is None:
            return ClaimCheck(claim=claim, status="unverified", reasoning="No data for that comparison.", evidence=refs)
        want_more = claim.comparator == "more"
        holds = mine > theirs if want_more else mine < theirs
        label = METRIC_LABEL.get(metric, metric)
        # CONFLICTED: alternative readings disagree about direction
        if alt_mine and alt_theirs:
            holds_alt = (alt_mine["completed passes share"] > alt_theirs["completed passes share"]) if want_more else (alt_mine["completed passes share"] < alt_theirs["completed passes share"])
            if holds != holds_alt:
                return ClaimCheck(claim=claim, status="conflicted", actual_value=mine, actual_label=f"{_fmt(metric, mine)} vs {_fmt(metric, theirs)}",
                                  reasoning=(f"Two defensible readings disagree. By ball time {TEAMS[team].short} had {_fmt(metric, mine)} against {_fmt(metric, theirs)}, "
                                             f"but by share of completed passes it is {alt_mine['completed passes share']:.0f}% against {alt_theirs['completed passes share']:.0f}%. Both readings are shown."),
                                  evidence=refs, evidence_strength=_strength(len(evs)), alternative_readings={**{f"{TEAMS[team].short} {k}": v for k, v in alt_mine.items()}, **{f"{TEAMS[other].short} {k}": v for k, v in alt_theirs.items()}})
        if metric == "possession_pct" and holds and abs(mine - theirs) < 8:
            return ClaimCheck(claim=claim, status="corrected", actual_value=mine, actual_label=f"{_fmt(metric, mine)} vs {_fmt(metric, theirs)}", tolerance=8,
                              reasoning=f"{TEAMS[team].short} did have more of the ball ({_fmt(metric, mine)} to {_fmt(metric, theirs)}) in the {w.label}, but a {abs(mine - theirs):.0f}-point edge is a narrow advantage, not dominance.",
                              evidence=refs, evidence_strength=_strength(len(evs)),
                              corrected_text=f"{TEAMS[team].name} held a narrow possession advantage ({_fmt(metric, mine)} to {_fmt(metric, theirs)}) in the {w.label}, but neither team established overwhelming control.",
                              alternative_readings={**alt_mine} if alt_mine else {})
        if holds:
            return ClaimCheck(claim=claim, status="verified", actual_value=mine, actual_label=f"{_fmt(metric, mine)} vs {_fmt(metric, theirs)}",
                              reasoning=f"{TEAMS[team].short} recorded {_fmt(metric, mine)} {label} against {TEAMS[other].short}'s {_fmt(metric, theirs)} in the {w.label}.",
                              evidence=refs, evidence_strength=_strength(len(evs)))
        return ClaimCheck(claim=claim, status="unsupported", actual_value=mine, actual_label=f"{_fmt(metric, mine)} vs {_fmt(metric, theirs)}",
                          reasoning=f"The evidence contradicts this: {TEAMS[team].short} had {_fmt(metric, mine)} {label} against {TEAMS[other].short}'s {_fmt(metric, theirs)} in the {w.label}.",
                          evidence=refs, evidence_strength=_strength(len(evs)),
                          corrected_text=f"{TEAMS[other].name} had the edge in {label} ({_fmt(metric, theirs)} to {_fmt(metric, mine)}) in the {w.label}.")

    # metric / event claims
    actual, alts = _actual(events, metric, team, claim.player_id, w)
    evs = _events_for_metric(events, metric, team, claim.player_id, w)
    refs = [evidence_ref(e) for e in evs[:12]]
    if actual is None:
        return ClaimCheck(claim=claim, status="unverified", reasoning="The claim names a metric that is not tracked for that subject.", evidence_strength=0)
    subject = claim.player_name or (TEAMS[team].name if team else "the match")
    label = METRIC_LABEL.get(metric, metric)
    value = claim.value if claim.value is not None else 1.0
    tol = PCT_TOLERANCE if claim.unit == "%" else XG_TOLERANCE if metric == "xg" else COUNT_TOLERANCE
    cmp = claim.comparator or "approx"
    if cmp == "gte":
        ok = actual >= value - (tol if claim.unit == "%" else 0)
    elif cmp == "lte":
        ok = actual <= value + (tol if claim.unit == "%" else 0)
    else:
        ok = abs(actual - value) <= tol
    strength = _strength(len(evs)) if len(evs) else (3 if actual == 0 else 0)

    if claim.kind == "event":
        if ok:
            return ClaimCheck(claim=claim, status="verified", actual_value=actual, actual_label=_fmt(metric, actual), tolerance=tol,
                              reasoning=f"The event log confirms it: {subject} has {_fmt(metric, actual)} {label} in the {w.label}.", evidence=refs, evidence_strength=max(strength, 3))
        if actual == 0:
            return ClaimCheck(claim=claim, status="unsupported", actual_value=0, actual_label="0", tolerance=tol,
                              reasoning=f"No {label[:-1] if label.endswith('s') else label} by {subject} appears in the event log for the {w.label}. The evidence contradicts the claim.",
                              evidence=[evidence_ref(e) for e in events if e.type == EventType.GOAL and w.start_t <= e.t <= w.end_t][:6], evidence_strength=3)
        return ClaimCheck(claim=claim, status="corrected", actual_value=actual, actual_label=_fmt(metric, actual), tolerance=tol,
                          reasoning=f"{subject} has {_fmt(metric, actual)} {label} in the {w.label}, not {_fmt(metric, value)}.", evidence=refs, evidence_strength=strength,
                          corrected_text=f"{subject} has {_fmt(metric, actual)} {label} in the {w.label}.")

    # numeric metric claim
    if ok:
        return ClaimCheck(claim=claim, status="verified", actual_value=actual, actual_label=_fmt(metric, actual), tolerance=tol,
                          reasoning=f"Computed {label} for {subject} in the {w.label}: {_fmt(metric, actual)} (claimed {_fmt(metric, value)}, tolerance ±{tol:g}).",
                          evidence=refs, evidence_strength=strength, alternative_readings=alts)
    if metric == "possession_pct" and alts:
        alt = alts.get("completed passes share")
        if alt is not None and abs(alt - value) <= tol:
            return ClaimCheck(claim=claim, status="conflicted", actual_value=actual, actual_label=_fmt(metric, actual), tolerance=tol,
                              reasoning=f"By ball time {subject} had {_fmt(metric, actual)} possession in the {w.label}, but by completed-pass share the figure is {alt:.0f}%, which matches the claim. Both readings are shown.",
                              evidence=refs, evidence_strength=strength, alternative_readings=alts)
    return ClaimCheck(claim=claim, status="corrected", actual_value=actual, actual_label=_fmt(metric, actual), tolerance=tol,
                      reasoning=f"The figure is wrong. Computed {label} for {subject} in the {w.label}: {_fmt(metric, actual)}, not {_fmt(metric, value)} (tolerance ±{tol:g}).",
                      evidence=refs, evidence_strength=strength, alternative_readings=alts,
                      corrected_text=_rewrite(claim, actual, subject, label, w))


def _rewrite(claim: NarrativeClaim, actual: float, subject: str, label: str, w: ClaimWindow) -> str:
    metric = claim.metric or ""
    if metric == "possession_pct":
        if actual >= 60:
            return f"{subject} dominated the ball with {actual:.0f}% possession in the {w.label}."
        if actual >= 53:
            return f"{subject} held a narrow possession advantage ({actual:.0f}%) in the {w.label}, but neither team established overwhelming control."
        if actual >= 47:
            return f"Possession was evenly shared in the {w.label}, with {subject} on {actual:.0f}%."
        return f"{subject} saw less of the ball in the {w.label}, with {actual:.0f}% possession."
    return f"{subject} recorded {_fmt(metric, actual)} {label} in the {w.label}."


OVERALL_PRIORITY: list[VarStatus] = ["unsupported", "conflicted", "corrected", "unverified", "verified"]


def verify_text(events: list[MatchEvent], text: str, home: str, away: str, at_t: int = FULL_T, match_id: str = "", ai_mode: str = "demo",
                claims: list[NarrativeClaim] | None = None) -> VerificationResult:
    at_t = min(at_t, FULL_T)
    visible = [e for e in events if e.t <= at_t]
    claims = claims if claims is not None else extract_claims(text, at_t)
    checks = [check_claim(visible, c, home, away, at_t) for c in claims]
    statuses = {c.status for c in checks}
    factual = [c for c in checks if c.claim.kind not in ("opinion", "unknown")]
    if "unsupported" in statuses:
        overall: VarStatus = "unsupported"
    elif "conflicted" in statuses:
        overall = "conflicted"
    elif "corrected" in statuses:
        overall = "corrected"
    elif factual and all(c.status == "verified" for c in factual):
        overall = "verified"
    else:
        overall = "unverified"
    corrected_parts: list[str] = []
    seen_sentences: list[str] = []
    for c in checks:
        if c.claim.text not in seen_sentences:
            seen_sentences.append(c.claim.text)
    for sentence in seen_sentences:
        group = [c for c in checks if c.claim.text == sentence]
        fixes = [c.corrected_text for c in group if c.status in ("corrected", "unsupported") and c.corrected_text]
        if fixes:
            corrected_parts.extend(dict.fromkeys(fixes))
        elif any(c.status == "unsupported" for c in group):
            continue  # drop a sentence that is contradicted and has no rewrite
        else:
            corrected_parts.append(sentence)
    corrected_text = " ".join(corrected_parts) if any(c.status in ("corrected", "unsupported") for c in checks) else None
    n_ok = sum(1 for c in checks if c.status == "verified")
    summary = {
        "verified": f"All {len(factual)} factual claim{'s' if len(factual) != 1 else ''} match the event data.",
        "corrected": f"{n_ok} of {len(factual)} claims verified. A figure was wrong and has been corrected.",
        "unsupported": f"{n_ok} of {len(factual)} claims verified. At least one claim is contradicted by the event log.",
        "conflicted": f"{n_ok} of {len(factual)} claims verified. One claim depends on which reading of the metric you use.",
        "unverified": "Nothing in this text could be checked against the match data." if not factual else f"{n_ok} of {len(factual)} claims verified; the rest are outside the data we hold.",
        "checking": "",
    }[overall]
    windows = [c.claim.window for c in checks if c.claim.window]
    audit = [{"claim": c.claim.fragment or c.claim.text, "metric": c.claim.metric, "subject": c.claim.player_name or c.claim.team, "window": (c.claim.window or ClaimWindow(start_t=0, end_t=at_t, label="whole match so far")).label,
              "claimed": c.claim.value, "actual": c.actual_value, "status": c.status, "evidence_ids": [e.event_id for e in c.evidence]} for c in checks]
    return VerificationResult(id=f"V-{uuid.uuid4().hex[:8]}", match_id=match_id, original_text=text, status=overall, claims=checks, corrected_text=corrected_text,
                              summary=summary, window=windows[0] if windows else None, checked_at_t=at_t,
                              evidence_strength=max([c.evidence_strength for c in checks], default=0), ai_mode=ai_mode, audit=audit)


def example_claims(events: list[MatchEvent], home: str, away: str) -> list[dict]:
    """Claims the user can try, generated from the actual match so the right and wrong ones are real."""
    goals = [e for e in events if e.type == EventType.GOAL]
    hs, as_ = team_stats(events, home), team_stats(events, away)
    last10_home = team_stats(events, home, 80 * 60, 90 * 60)
    ps = player_stats(events)
    scorer = goals[0] if goals else None
    non_scorer = next((p for p in sorted(ps.values(), key=lambda s: -s.touches) if p.goals == 0 and p.team == home and p.position in ("MF", "DF")), None)
    top_recov = max((p for p in ps.values() if p.team == home), key=lambda p: p.recoveries)
    out = [
        {"label": "Correct statistic", "category": "supported",
         "text": f"{TEAMS[home].name} have had {hs.shots} shots in this match, {hs.shots_on_target} of them on target.", "expected": "verified"},
        {"label": "Wrong possession figure", "category": "false-numeric",
         "text": f"{TEAMS[home].name} has dominated the last ten minutes with 85% possession.", "expected": "corrected"},
        {"label": "Inflated recoveries", "category": "false-numeric",
         "text": f"{top_recov.name} has made {top_recov.recoveries + 9} ball recoveries, the most on the pitch.", "expected": "corrected"},
    ]
    if scorer:
        out.append({"label": "Real goal", "category": "supported", "text": f"{scorer.player_name} scored for {TEAMS[scorer.team].name} in the {scorer.minute}th minute.", "expected": "verified"})
    if non_scorer:
        out.append({"label": "Fabricated goal", "category": "fabricated-event", "text": f"{non_scorer.name} scored twice to seal it for {TEAMS[home].name}.", "expected": "unsupported"})
    out.append({"label": "Unknown player", "category": "fabricated-player", "text": "Jordan Blake assisted the opener with a wonderful cross.", "expected": "unsupported"})
    out.append({"label": "Unsupported tactical statement", "category": "opinion",
                "text": f"{TEAMS[away].name} look nervous at the back and deserve to lose this.", "expected": "unverified"})
    out.append({"label": "Possession reading disagreement", "category": "conflicted",
                "text": f"{TEAMS[home].name} have had {hs.possession_pct_by_passes:.0f}% of the ball today.", "expected": "conflicted" if abs(hs.possession_pct_by_passes - hs.possession_pct) > PCT_TOLERANCE else "verified"})
    out.append({"label": "Last ten minutes, real figure", "category": "supported",
                "text": f"In the last ten minutes {TEAMS[home].name} have had {last10_home.possession_pct:.0f}% possession and {last10_home.shots} shots.", "expected": "verified"})
    out.append({"label": "Team comparison", "category": "comparison",
                "text": f"{TEAMS[away].name} have had more shots than {TEAMS[home].name} this evening.", "expected": "verified" if as_.shots > hs.shots else "unsupported"})
    return out
