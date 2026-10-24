import asyncio

import pytest

from app.agents.pundits import PERSONAS, candidate_scores, deterministic_verdict, lens_picks, run_debate
from app.agents.recap import build_recap
from app.ai import provider as prov_mod
from app.ai.provider import DemoProvider, _parse_json, resolve_provider
from app.services.match_store import MatchStore
from app.verification.verifier import verify_text

store = MatchStore()


@pytest.fixture(scope="module", params=["comeback", "momentum-paradox", "hidden-hero"])
def match(request):
    return store.generate(request.param)


def test_candidates_are_ranked_and_distinct_lenses(match):
    cands = candidate_scores(match)
    assert 3 <= len(cands) <= 5
    assert cands == sorted(cands, key=lambda c: -c.composite)
    picks = lens_picks(cands)
    assert set(picks) == set(PERSONAS)
    # the fan lens must favour goal involvement
    fan = picks["fan"]
    assert fan.stats.goals_involved >= max(c.stats.goals_involved for c in cands) - 1


def test_debate_is_bounded_and_grounded(match):
    d = asyncio.run(run_debate(match))
    assert d.rounds == 2
    assert len(d.arguments) == 6
    assert [a.round for a in d.arguments] == ["opening"] * 3 + ["rebuttal"] * 3
    assert {a.pundit for a in d.arguments} == set(PERSONAS)
    ids = {c.player_id for c in d.candidates}
    assert all(a.pick_player_id in ids for a in d.arguments)
    # every factual statement in a demo argument must survive Narrative VAR
    for a in d.arguments:
        assert a.verification is not None
        assert a.verification.status in ("verified", "unverified"), (a.pundit, a.round, a.verification.summary, a.text)
    assert d.verdict_player_id in ids
    assert len(d.votes) == 3
    assert d.unanimous == (len({v["pick"] for v in d.votes}) == 1)


def test_recap_matches_debate_verdict_and_facts(match):
    d = asyncio.run(run_debate(match))
    for mode in ("fan", "analyst"):
        r = asyncio.run(build_recap(match, mode, "en"))
        assert r.final_score == match.meta.final_score
        assert r.player_of_the_match["player_id"] == d.verdict_player_id == deterministic_verdict(match).player_id
        assert r.summary_status in ("verified", "unverified"), (mode, r.summary)
        assert len(r.key_events) >= len([e for e in match.events if e.type.value == "goal"])
        assert all(s.status in ("verified", "unverified") for s in r.verified_insights), [(s.title, s.status) for s in r.verified_insights]
        v = verify_text(match.events, r.summary, match.home, match.away)
        assert v.status != "unsupported"
    es = asyncio.run(build_recap(match, "fan", "es"))
    assert es.language == "es" and "posesión" in es.summary


def test_hidden_hero_wins_without_scoring():
    m = store.generate("hidden-hero")
    v = deterministic_verdict(m)
    assert v.player_id == "NCF06" and v.stats.goals == 0


def test_provider_resolution_defaults_to_demo(monkeypatch):
    monkeypatch.setattr(prov_mod.settings, "pulse_ai_mode", "auto")
    monkeypatch.setattr(prov_mod.settings, "foundry_project_endpoint", None)
    monkeypatch.setattr(prov_mod.settings, "foundry_model", None)
    st = resolve_provider(force=True)
    assert isinstance(st.provider, DemoProvider) and st.foundry_configured is False
    assert any("not configured" in n for n in st.notes)


def test_provider_forced_foundry_without_config_fails(monkeypatch):
    monkeypatch.setattr(prov_mod.settings, "pulse_ai_mode", "foundry")
    monkeypatch.setattr(prov_mod.settings, "foundry_project_endpoint", None)
    with pytest.raises(prov_mod.AIUnavailable):
        resolve_provider(force=True)
    monkeypatch.setattr(prov_mod.settings, "pulse_ai_mode", "auto")
    resolve_provider(force=True)


def test_json_parsing_is_tolerant():
    assert _parse_json('{"a": 1}') == {"a": 1}
    assert _parse_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert _parse_json('Here you go: {"explanation": "x"} thanks') == {"explanation": "x"}
    assert _parse_json("not json") is None
    assert _parse_json("[1,2]") is None
