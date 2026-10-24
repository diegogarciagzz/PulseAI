"""Evidence-grounded match recap in Fan and Analyst modes (English, optional Spanish)."""
from __future__ import annotations

from app.agents.pundits import candidate_scores, deterministic_verdict
from app.ai.provider import AIUnavailable, provider
from app.analytics.insights import evidence_ref
from app.models.core import EventType, MatchRecap, RecapSection
from app.services.match_store import Match
from app.simulator.rosters import TEAMS
from app.verification.verifier import verify_text


def _facts(match: Match) -> dict:
    ts = match.final_team_stats()
    goals = [e for e in match.events if e.type == EventType.GOAL]
    shifts = sorted([i for i in match.insights if i.kind.value in ("momentum-swing", "pressure-surge", "substitution-impact")], key=lambda i: -i.importance)[:4]
    cands = candidate_scores(match, limit=3)
    return {"home": TEAMS[match.home].name, "away": TEAMS[match.away].name, "score": f"{match.meta.final_score.home}-{match.meta.final_score.away}",
            "goals": [f"{g.minute}' {g.player_name} ({TEAMS[g.team].short})" for g in goals], "home_stats": ts[match.home].model_dump(), "away_stats": ts[match.away].model_dump(),
            "shifts": [f"{i.minute}' {i.headline}: {i.explanation}" for i in shifts], "top": [f"{c.name} ({TEAMS[c.team].short}): {c.stats.goals} goals, {c.stats.assists} assists, {c.stats.progressive_passes} progressive passes, {c.stats.recoveries} recoveries" for c in cands]}


def _ordinal(n: int) -> str:
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


_KIND_ES = {"momentum-swing": "cambio de dinámica", "pressure-surge": "fase de presión", "substitution-impact": "impacto de un cambio"}


def _shifts_es(match: Match) -> str:
    shifts = sorted([i for i in match.insights if i.kind.value in _KIND_ES], key=lambda i: -i.importance)[:2]
    return "; ".join(f"{_KIND_ES[i.kind.value]} de {TEAMS[i.team].name} en el minuto {i.minute}" for i in sorted(shifts, key=lambda i: i.t)) or "sin cambios destacados"


def _demo_summary(match: Match, mode: str, lang: str) -> str:
    f = _facts(match)
    hs, as_ = f["home_stats"], f["away_stats"]
    h, a = match.meta.final_score.home, match.meta.final_score.away
    winner = f["home"] if h > a else f["away"] if a > h else None
    goals_txt = ", ".join(f"{g.player_name} for {TEAMS[g.team].short} in the {_ordinal(g.minute)} minute" for g in match.events if g.type == EventType.GOAL)
    if lang == "es":
        goals_es = ", ".join(f"{g.player_name} ({TEAMS[g.team].short}, minuto {g.minute})" for g in match.events if g.type == EventType.GOAL) or "ninguno"
        if mode == "fan":
            lead = f"{winner} se lleva el partido {h}-{a}." if winner else f"Empate {h}-{a}."
            return (f"{lead} Goles: {goals_es}. {f['home']} tuvo el {hs['possession_pct']:.0f}% de la posesión y {hs['shots']} remates; "
                    f"{f['away']} respondió con {as_['shots']} remates y {as_['recoveries']} recuperaciones. Datos sintéticos de clubes ficticios.")
        return (f"Resultado final {h}-{a}. Posesión {hs['possession_pct']:.0f}% a {as_['possession_pct']:.0f}%, remates {hs['shots']} a {as_['shots']}, "
                f"xG {hs['xg']:.2f} a {as_['xg']:.2f}, entradas al último tercio {hs['final_third_entries']} a {as_['final_third_entries']}. "
                f"Momentos clave: {_shifts_es(match)}.")
    if mode == "fan":
        lead = f"{winner} take it {h}-{a}!" if winner else f"Honours even at {h}-{a}."
        return (f"{lead} The goals came from {goals_txt}. {f['home']} had {hs['possession_pct']:.0f}% possession and {hs['shots']} shots, "
                f"while {f['away']} answered with {as_['shots']} shots and {as_['recoveries']} recoveries. "
                f"{'The turning point: ' + f['shifts'][0].split(': ', 1)[-1] if f['shifts'] else ''}")
    return (f"Final score {h}-{a}. {f['home']} had {hs['possession_pct']:.0f}% possession, {hs['shots']} shots, {hs['xg']:.2f} xG, "
            f"{hs['final_third_entries']} final-third entries and {hs['progressive_passes']} progressive passes. "
            f"{f['away']} had {as_['possession_pct']:.0f}% possession, {as_['shots']} shots, {as_['xg']:.2f} xG, "
            f"{as_['final_third_entries']} final-third entries and {as_['progressive_passes']} progressive passes. "
            f"{' '.join(f['shifts'][:2])}")


async def build_recap(match: Match, mode: str = "fan", lang: str = "en") -> MatchRecap:
    prov = provider()
    facts = _facts(match)
    fallback = _demo_summary(match, mode, lang)
    system = ("You write the PULSE AI match recap. Write 3 to 4 sentences in " + ("Spanish" if lang == "es" else "English") + ". "
              + ("Fan mode: vivid, accessible, emotional, but every number must come from the facts." if mode == "fan" else
                 "Analyst mode: statistical, tactical, measured; cite at least four numbers from the facts.")
              + " Never invent players, minutes or statistics. Return JSON {\"summary\": \"...\"}.")
    try:
        obj, source = await prov.complete_json(system, str(facts), fallback={"summary": fallback})
        summary = str(obj.get("summary") or fallback)
    except AIUnavailable:
        summary, source = fallback, "demo"
    summary_status = None
    if lang == "en":
        v = verify_text(match.events, summary, match.home, match.away, match_id=match.meta.id, ai_mode=prov.mode)
        summary_status = v.status
        if source == "foundry" and v.status in ("corrected", "unsupported") and v.corrected_text:
            # model output is rewritten from the evidence; deterministic text is left as generated
            summary = v.corrected_text
            summary_status = verify_text(match.events, summary, match.home, match.away, match_id=match.meta.id, ai_mode=prov.mode).status
    goals = [e for e in match.events if e.type in (EventType.GOAL, EventType.CARD, EventType.SUBSTITUTION)]
    shifts = sorted([i for i in match.insights if i.kind.value in ("momentum-swing", "pressure-surge", "substitution-impact", "attacking-surge")], key=lambda i: -i.importance)[:5]
    sections = []
    for i in sorted(shifts, key=lambda i: i.t):
        v = verify_text(match.events, i.explanation, match.home, match.away, at_t=i.window_end_t, match_id=match.meta.id, ai_mode=prov.mode)
        sections.append(RecapSection(title=f"{i.minute}' {i.headline}", body=i.explanation, status=v.status))
    cands = candidate_scores(match, limit=5)
    top = [c.stats for c in cands]
    potm = deterministic_verdict(match)
    h, a = match.meta.final_score.home, match.meta.final_score.away
    headline = (f"{TEAMS[match.home].name.replace(' FC', '')} {h}-{a} {TEAMS[match.away].name.replace(' FC', '')}" if lang == "en" else
                f"{TEAMS[match.home].name.replace(' FC', '')} {h}-{a} {TEAMS[match.away].name.replace(' FC', '')}")
    return MatchRecap(match_id=match.meta.id, mode=mode, language=lang, headline=headline, summary=summary, summary_source=source, summary_status=summary_status,
                      final_score=match.meta.final_score, key_events=[evidence_ref(e) for e in goals], momentum_shifts=sorted(shifts, key=lambda i: i.t),
                      top_players=top, verified_insights=sections,
                      player_of_the_match={"player_id": potm.player_id, "name": potm.name, "team": potm.team, "number": potm.number, "role": potm.role,
                                           "composite": potm.composite, "note": "Same evidence-based verdict rule as the AI Studio: two pundit lenses agreeing win, otherwise the composite score decides."},
                      team_stats=match.final_team_stats(), ai_mode=prov.mode)
