"""AI Pundit Roundtable: three personas debate Player of the Match.

Deterministic parts (always run, both modes):
  1. candidate statistics and three *lens scores* (analyst / fan / tactician)
  2. candidate shortlist
  3. moderator verdict from a composite score
  4. Narrative VAR check of every argument

Model-backed parts (Foundry mode): each pundit is a Microsoft Agent Framework `Agent`
bound to a `FoundryChatClient` with its own persona instructions. The three opening
arguments run concurrently, then one bounded rebuttal round, then the moderator
summary. In demo mode the same evidence pack feeds templated arguments, so every
statement is still a real number from the match.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from app.ai.provider import AIUnavailable, FoundryProvider, provider
from app.config import settings
from app.models.core import CandidateScore, DebateResult, EventType, PlayerStats, PunditArgument
from app.services.match_store import Match
from app.simulator.rosters import TEAMS
from app.verification.verifier import verify_text

log = logging.getLogger("pulse.agents")

PERSONAS: dict[str, dict[str, str]] = {
    "analyst": {
        "name": "Alex Mercer", "role": "The Analyst",
        "style": "precise, calm, numbers first",
        "instructions": (
            "You are Alex Mercer, The Analyst on the PULSE AI post-match roundtable. You argue from measurable contributions: "
            "completed passes, progressive passes, key passes, defensive actions, shots on target, xG. You are calm, exact and a little dry. "
            "You never exaggerate. Every number you say must come from the evidence pack, phrased like 'made 13 recoveries' or 'completed 41 passes'."),
    },
    "fan": {
        "name": "Mateo Reyes", "role": "The Fan",
        "style": "passionate, dramatic, loves the big moments",
        "instructions": (
            "You are Mateo Reyes, The Fan on the PULSE AI post-match roundtable. You argue from the moments that decide matches: goals, assists, "
            "the winner, the equaliser, the comeback. You are passionate and funny, you speak like a supporter in the stands, but you only cite "
            "numbers that appear in the evidence pack (for example 'scored 2 goals', 'had 4 shots on target')."),
    },
    "tactician": {
        "name": "Sofia Hart", "role": "The Tactician",
        "style": "strategic, observant, team-level",
        "instructions": (
            "You are Sofia Hart, The Tactician on the PULSE AI post-match roundtable. You argue from team-level and structural contributions: "
            "progressive actions, build-up involvement, pre-assists, final-third entries, ball recoveries and transitions, and how a player "
            "enables teammates. You are strategic and composed. Only cite numbers from the evidence pack; never claim spatial patterns that the pack does not contain."),
    },
}

LENS_METRICS = {
    "analyst": ["passes_completed", "progressive_passes", "key_passes", "defensive_actions", "shots_on_target", "pass_accuracy"],
    "fan": ["goals", "assists", "shots_on_target", "goals_involved", "key_passes"],
    "tactician": ["progressive_passes", "final_third_entries", "pre_assists", "recoveries", "interceptions", "tackles", "key_passes"],
}


def _goal_context(match: Match, player_id: str) -> dict[str, int]:
    """Dramatic context of a player's goals: equalisers, go-ahead goals, the winner."""
    out = {"equalisers": 0, "go_ahead": 0, "winner": 0}
    goals = [e for e in match.events if e.type == EventType.GOAL]
    final_h, final_a = match.meta.final_score.home, match.meta.final_score.away
    for g in goals:
        if g.player_id != player_id:
            continue
        prev_h, prev_a = (g.score_home - 1, g.score_away) if g.team == match.home else (g.score_home, g.score_away - 1)
        if g.score_home == g.score_away:
            out["equalisers"] += 1
        elif (g.team == match.home and prev_h <= prev_a) or (g.team == match.away and prev_a <= prev_h):
            out["go_ahead"] += 1
    if final_h != final_a:
        winner_team = match.home if final_h > final_a else match.away
        loser_goals = final_a if winner_team == match.home else final_h
        winner_goal = [g for g in goals if g.team == winner_team][loser_goals] if len([g for g in goals if g.team == winner_team]) > loser_goals else None
        if winner_goal and winner_goal.player_id == player_id:
            out["winner"] = 1
    return out


def lens_scores(match: Match, s: PlayerStats) -> tuple[float, float, float]:
    gc = _goal_context(match, s.player_id)
    analyst = (s.passes_completed * 0.08 + s.progressive_passes * 0.55 + s.key_passes * 0.9 + s.defensive_actions * 0.42
               + s.shots_on_target * 0.6 + s.pass_accuracy * 0.03 + s.goals * 1.6 + s.assists * 1.2)
    fan = (s.goals * 4.0 + s.assists * 2.4 + s.shots_on_target * 0.5 + gc["equalisers"] * 1.5 + gc["go_ahead"] * 2.0 + gc["winner"] * 3.0
           + s.key_passes * 0.25 + s.shots * 0.15)
    tactician = (s.progressive_passes * 0.65 + s.final_third_entries * 0.5 + s.pre_assists * 1.6 + s.recoveries * 0.5 + s.interceptions * 0.6
                 + s.tackles * 0.5 + s.key_passes * 0.5 + s.assists * 0.8 + min(s.minutes, 90) / 90 * 1.0)
    return round(analyst, 2), round(fan, 2), round(tactician, 2)


def candidate_scores(match: Match, limit: int = 5) -> list[CandidateScore]:
    ps = [s for s in match.final_player_stats().values() if s.minutes >= 20 and s.position != "GK"]
    raw = [(s, *lens_scores(match, s)) for s in ps]
    maxes = [max(r[i] for r in raw) or 1.0 for i in (1, 2, 3)]
    out = []
    for s, a, f, t in raw:
        composite = round((a / maxes[0] + f / maxes[1] + t / maxes[2]) / 3, 3)
        out.append(CandidateScore(player_id=s.player_id, name=s.name, team=s.team, number=s.number, role=s.role,
                                  analyst_score=a, fan_score=f, tactician_score=t, composite=composite, stats=s))
    out.sort(key=lambda c: -c.composite)
    return out[:limit]


def lens_picks(cands: list[CandidateScore]) -> dict[str, CandidateScore]:
    return {"analyst": max(cands, key=lambda c: c.analyst_score), "fan": max(cands, key=lambda c: c.fan_score),
            "tactician": max(cands, key=lambda c: c.tactician_score)}


def pick_verdict(cands: list[CandidateScore], picks: dict[str, CandidateScore]) -> CandidateScore:
    """Two or more pundit votes win; otherwise the composite score decides."""
    votes_for: dict[str, int] = {}
    for c in picks.values():
        votes_for[c.player_id] = votes_for.get(c.player_id, 0) + 1
    return max(cands, key=lambda c: (votes_for.get(c.player_id, 0) >= 2, c.composite))


def deterministic_verdict(match: Match) -> CandidateScore:
    cands = candidate_scores(match)
    return pick_verdict(cands, lens_picks(cands))


def evidence_table(match: Match, cands: list[CandidateScore]) -> str:
    lines = [f"Final score: {TEAMS[match.home].name} {match.meta.final_score.home}-{match.meta.final_score.away} {TEAMS[match.away].name}. Scenario: {match.meta.title}.",
             "Goals: " + "; ".join(f"{e.minute}' {e.player_name} ({TEAMS[e.team].short}{', assist ' + e.related_player_name if e.related_player_name else ''})" for e in match.events if e.type == EventType.GOAL),
             "Candidates (authoritative statistics, full match):"]
    for c in cands:
        s = c.stats
        lines.append(f"  - {c.player_id} {c.name} #{c.number} {TEAMS[c.team].short} {c.role}, {s.minutes} min: goals {s.goals}, assists {s.assists}, pre-assists {s.pre_assists}, "
                     f"shots {s.shots} (on target {s.shots_on_target}, xG {s.xg:.2f}), passes completed {s.passes_completed}/{s.passes} ({s.pass_accuracy:.0f}%), "
                     f"progressive passes {s.progressive_passes}, key passes {s.key_passes}, final-third entries {s.final_third_entries}, recoveries {s.recoveries}, "
                     f"tackles {s.tackles}, interceptions {s.interceptions}, defensive actions {s.defensive_actions}")
    return "\n".join(lines)


# ----------------------------------------------------------------------------- demo text

def _demo_opening(pundit: str, c: CandidateScore, match: Match) -> str:
    s = c.stats
    team = TEAMS[c.team].name
    if pundit == "analyst":
        return (f"The numbers point to {c.name}. He completed {s.passes_completed} passes at {s.pass_accuracy:.0f}% accuracy, "
                f"made {s.progressive_passes} progressive passes and {s.defensive_actions} defensive actions, "
                f"and had {s.shots_on_target} shots on target. That is the most complete statistical profile on the pitch for {team}.")
    if pundit == "fan":
        gc = _goal_context(match, c.player_id)
        moment = "scored the winner" if gc["winner"] else "scored the equaliser" if gc["equalisers"] else "scored" if s.goals else "set up a goal" if s.assists else "had the big chances"
        return (f"Come on, it has to be {c.name}! He {moment}: {s.goals} goals, {s.assists} assists, {s.shots_on_target} shots on target. "
                f"Matches are won in the box and he was the one who delivered when it mattered for {team}.")
    return (f"For me it is {c.name}. Look at how {team} moved the ball: he made {s.progressive_passes} progressive passes and {s.final_third_entries} final-third entries, "
            f"won the ball back with {s.recoveries} recoveries and {s.interceptions} interceptions, and had {s.pre_assists} pre-assists. "
            f"He is the player who makes the structure work for everyone else.")


def _demo_rebuttal(pundit: str, mine: CandidateScore, others: list[tuple[str, CandidateScore]]) -> str:
    rival_name, rival = next(((PERSONAS[p]["name"], c) for p, c in others if c.player_id != mine.player_id), (None, None))
    if rival is None:
        return f"We agree, and the evidence agrees with us: {mine.name} was the Player of the Match."
    s, r = mine.stats, rival.stats
    if pundit == "analyst":
        return (f"{rival_name}, {rival.name} had a fine match, but compare the volume: {mine.name} completed {s.passes_completed} passes to {r.passes_completed}, "
                f"and made {s.defensive_actions} defensive actions to {r.defensive_actions}. Consistency across ninety minutes beats a single highlight.")
    if pundit == "fan":
        return (f"{rival_name}, nobody goes home talking about progressive passes! {mine.name} had {s.goals} goals and {s.assists} assists; "
                f"{rival.name} had {r.goals} goals. The scoreboard remembers the finisher.")
    return (f"{rival_name}, the goals only happen because of the platform. {mine.name} made {s.recoveries} recoveries and {s.progressive_passes} progressive passes; "
            f"{rival.name} made {r.progressive_passes}. Remove {mine.name} and the whole shape collapses.")


def _demo_moderator(picks: dict[str, CandidateScore], verdict: CandidateScore, unanimous: bool) -> str:
    if unanimous:
        return f"All three pundits land on {verdict.name}. The composite score, which blends the three lenses equally, agrees."
    names = ", ".join(f"{PERSONAS[p]['name']} backs {c.name}" for p, c in picks.items())
    return (f"The panel is split: {names}. Weighing the three lenses equally, the evidence-based verdict is {verdict.name} "
            f"with a composite of {verdict.composite:.2f}. The disagreement is real: it comes down to whether you value decisive moments or sustained influence.")


# ----------------------------------------------------------------------------- Foundry / Agent Framework

async def _foundry_round(prov: FoundryProvider, cands: list[CandidateScore], table: str, round_name: str, context: dict[str, str]) -> dict[str, dict[str, Any]]:
    """Run the three personas concurrently with Microsoft Agent Framework. Returns {pundit: {pick_player_id, argument}}."""
    from agent_framework import Agent
    from agent_framework.foundry import FoundryChatClient

    from app.ai.guard import check_model_call

    check_model_call(len(PERSONAS))
    ids = ", ".join(c.player_id for c in cands)
    client = FoundryChatClient(project_endpoint=prov.endpoint, model=prov.model, credential=prov.credential)

    async def run_one(pid: str) -> tuple[str, dict[str, Any]]:
        persona = PERSONAS[pid]
        agent = Agent(client=client, name=persona["name"].replace(" ", ""), instructions=persona["instructions"] + (
            f"\nRespond ONLY with JSON: {{\"pick_player_id\": one of [{ids}], \"argument\": \"<max 70 words>\"}}."))
        prompt = f"Evidence pack:\n{table}\n\n" + (f"Round: opening argument. Who is your Player of the Match and why?" if round_name == "opening" else
                                                  f"Round: rebuttal. The other pundits argued:\n{context.get(pid, '')}\nRespond in one short paragraph, keep or change your pick.")
        res = await asyncio.wait_for(agent.run(prompt), timeout=settings.ai_timeout_seconds)
        text = getattr(res, "text", None) or str(res)
        from app.ai.provider import _parse_json
        obj = _parse_json(text) or {"argument": text}
        return pid, obj

    results = await asyncio.gather(*(run_one(p) for p in PERSONAS))
    return dict(results)


# ----------------------------------------------------------------------------- orchestration

async def run_debate(match: Match) -> DebateResult:
    prov = provider()
    cands = candidate_scores(match)
    by_id = {c.player_id: c for c in cands}
    table = evidence_table(match, cands)
    lens_pick = lens_picks(cands)
    picks: dict[str, CandidateScore] = dict(lens_pick)
    arguments: list[PunditArgument] = []
    source = "demo"

    opening: dict[str, dict[str, Any]] = {}
    rebuttal: dict[str, dict[str, Any]] = {}
    if isinstance(prov, FoundryProvider):
        try:
            opening = await _foundry_round(prov, cands, table, "opening", {})
            for p, obj in opening.items():
                if obj.get("pick_player_id") in by_id:
                    picks[p] = by_id[obj["pick_player_id"]]
            ctx = {p: "\n".join(f"- {PERSONAS[o]['name']}: {opening[o].get('argument', '')}" for o in PERSONAS if o != p) for p in PERSONAS}
            rebuttal = await _foundry_round(prov, cands, table, "rebuttal", ctx)
            for p, obj in rebuttal.items():
                if obj.get("pick_player_id") in by_id:
                    picks[p] = by_id[obj["pick_player_id"]]
            source = "agent-framework"
        except (AIUnavailable, Exception) as e:  # noqa: BLE001
            log.warning("Agent Framework debate failed, using deterministic arguments: %s", e)
            opening, rebuttal, source = {}, {}, "demo"
            picks = dict(lens_pick)

    for p in PERSONAS:
        text = str(opening.get(p, {}).get("argument") or _demo_opening(p, picks[p], match))
        v = verify_text(match.events, text, match.home, match.away, match_id=match.meta.id, ai_mode=prov.mode)
        arguments.append(PunditArgument(pundit=p, pundit_name=PERSONAS[p]["name"], round="opening", pick_player_id=picks[p].player_id, pick_name=picks[p].name,
                                        text=text, source=source if opening.get(p) else "demo", verification=v))
    for p in PERSONAS:
        others = [(o, picks[o]) for o in PERSONAS if o != p]
        text = str(rebuttal.get(p, {}).get("argument") or _demo_rebuttal(p, picks[p], others))
        v = verify_text(match.events, text, match.home, match.away, match_id=match.meta.id, ai_mode=prov.mode)
        arguments.append(PunditArgument(pundit=p, pundit_name=PERSONAS[p]["name"], round="rebuttal", pick_player_id=picks[p].player_id, pick_name=picks[p].name,
                                        text=text, source=source if rebuttal.get(p) else "demo", verification=v))

    # verdict: pundit votes break ties on the composite ranking
    verdict = pick_verdict(cands, picks)
    unanimous = len(set(c.player_id for c in picks.values())) == 1
    moderator_fallback = _demo_moderator(picks, verdict, unanimous)
    try:
        obj, msrc = await prov.complete_json(
            "You are the PULSE AI studio moderator. Summarise the disagreement between three pundits in 2 sentences and state the evidence-based verdict given to you. "
            "Use only names and numbers provided. Return JSON {\"summary\": \"...\"}.",
            f"Picks: {json.dumps({PERSONAS[p]['name']: c.name for p, c in picks.items()})}. Verdict: {verdict.name} (composite {verdict.composite}). Unanimous: {unanimous}. Evidence:\n{table}",
            fallback={"summary": moderator_fallback})
        moderator = str(obj.get("summary") or moderator_fallback)
    except AIUnavailable:
        moderator, msrc = moderator_fallback, "demo"
    s = verdict.stats
    rating = f"{min(9.9, 6.2 + verdict.composite * 3.6):.1f}"
    return DebateResult(
        match_id=match.meta.id, candidates=cands, arguments=arguments, moderator_summary=moderator,
        verdict_player_id=verdict.player_id, verdict_name=verdict.name, verdict_team=verdict.team, verdict_number=verdict.number, verdict_rating=rating,
        verdict_stats=[{"label": "Goals", "value": str(s.goals)}, {"label": "Assists", "value": str(s.assists)}, {"label": "Prog. passes", "value": str(s.progressive_passes)},
                       {"label": "Recoveries", "value": str(s.recoveries)}, {"label": "Key passes", "value": str(s.key_passes)}, {"label": "Pass acc.", "value": f"{s.pass_accuracy:.0f}%"}],
        votes=[{"pundit": p, "pick": c.name, "agrees": c.player_id == verdict.player_id} for p, c in picks.items()],
        unanimous=unanimous, ai_mode=prov.mode if msrc != "demo" or source != "demo" else "demo", rounds=2)
