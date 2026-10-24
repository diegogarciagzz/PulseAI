import pytest

from app.analytics.stats import player_stats, team_stats
from app.services.match_store import MatchStore
from app.verification.claims import extract_claims, parse_window
from app.verification.verifier import check_claim, example_claims, verify_text

store = MatchStore()


@pytest.fixture(scope="module")
def match():
    return store.generate("comeback")


def test_window_parsing():
    w = parse_window("north city have dominated the last ten minutes", 67 * 60)
    assert (w.start_t, w.end_t) == (57 * 60, 67 * 60)
    w = parse_window("in the first half they were poor", 5400)
    assert (w.start_t, w.end_t) == (0, 2700)
    w = parse_window("since the 55th minute", 70 * 60)
    assert (w.start_t, w.end_t) == (55 * 60, 70 * 60)
    assert parse_window("no window here", 5400) is None


def test_extraction_shapes():
    claims = extract_claims("North City has dominated the last ten minutes with 85% possession.", 67 * 60)
    assert len(claims) == 1 and claims[0].kind == "metric" and claims[0].metric == "possession_pct" and claims[0].value == 85
    claims = extract_claims("In the last ten minutes North City have had 64% possession and 3 shots.", 5400)
    assert [c.metric for c in claims] == ["possession_pct", "shots"]
    claims = extract_claims("Kai Lindqvist scored twice. Jordan Blake assisted the opener.", 5400)
    assert claims[0].kind == "event" and claims[0].player_id == "NCF09" and claims[0].value == 2
    assert claims[1].kind == "event" and claims[1].player_id is None and claims[1].player_name == "Jordan Blake"
    claims = extract_claims("South United deserve to lose this.", 5400)
    assert claims[0].kind == "opinion"


def test_spec_example_is_corrected(match):
    r = verify_text(match.events, "North City has dominated the last ten minutes with 85% possession.", match.home, match.away, at_t=67 * 60)
    assert r.status == "corrected"
    c = r.claims[0]
    actual = team_stats(match.events, match.home, 57 * 60, 67 * 60).possession_pct
    assert abs(c.actual_value - actual) < 0.6 and abs(actual - 85) > 4
    assert r.corrected_text and "possession" in r.corrected_text
    assert all(e.event_id.startswith("E") for e in c.evidence) and c.evidence
    assert all(57 * 60 <= e.t <= 67 * 60 for e in c.evidence)


def test_true_numeric_claim_verified(match):
    ts = team_stats(match.events, match.home)
    r = verify_text(match.events, f"North City have had {ts.shots} shots, {ts.shots_on_target} on target.", match.home, match.away)
    assert r.status == "verified" and len(r.claims) == 2


def test_fabricated_goal_unsupported(match):
    ps = player_stats(match.events)
    non_scorer = next(p for p in ps.values() if p.goals == 0 and p.minutes > 0)
    r = verify_text(match.events, f"{non_scorer.name} scored twice.", match.home, match.away)
    assert r.status == "unsupported"
    assert r.claims[0].actual_value == 0


def test_unknown_player_unsupported(match):
    r = verify_text(match.events, "Jordan Blake assisted the opener.", match.home, match.away)
    assert r.status == "unsupported"
    assert "not in either" in r.claims[0].reasoning


def test_opinion_unverified_and_not_false(match):
    r = verify_text(match.events, "South United look nervous and deserve to lose.", match.home, match.away)
    assert r.status == "unverified"
    assert r.claims[0].claim.kind == "opinion"


def test_unknown_metric_is_unverified_not_verified(match):
    r = verify_text(match.events, "The referee has been very generous with the whistle tonight.", match.home, match.away)
    assert r.status == "unverified"


def test_future_events_not_used(match):
    # A goal that exists later in the match must not verify at an earlier replay time.
    goal = next(e for e in match.events if e.type.value == "goal")
    r_before = verify_text(match.events, f"{goal.player_name} scored.", match.home, match.away, at_t=goal.t - 60)
    r_after = verify_text(match.events, f"{goal.player_name} scored.", match.home, match.away, at_t=goal.t + 60)
    assert r_before.status == "unsupported" and r_after.status == "verified"


def test_comparison_claims(match):
    hs, as_ = team_stats(match.events, match.home), team_stats(match.events, match.away)
    more, fewer = (match.home, match.away) if hs.shots > as_.shots else (match.away, match.home)
    name = {"north-city": "North City", "south-united": "South United"}
    r = verify_text(match.events, f"{name[more]} have had more shots than {name[fewer]}.", match.home, match.away)
    assert r.status == "verified"
    r = verify_text(match.events, f"{name[fewer]} have had more shots than {name[more]}.", match.home, match.away)
    assert r.status == "unsupported" and r.corrected_text


def test_examples_match_expectations(match):
    for ex in example_claims(match.events, match.home, match.away):
        r = verify_text(match.events, ex["text"], match.home, match.away)
        assert r.status == ex["expected"], ex


def test_evidence_ids_are_real(match):
    ids = {e.id for e in match.events}
    for ex in example_claims(match.events, match.home, match.away):
        r = verify_text(match.events, ex["text"], match.home, match.away)
        for c in r.claims:
            assert all(e.event_id in ids for e in c.evidence)


def test_check_claim_tolerance(match):
    claims = extract_claims("North City had 51% possession.", 5400)
    actual = team_stats(match.events, match.home).possession_pct
    c = check_claim(match.events, claims[0], match.home, match.away, 5400)
    assert c.status == ("verified" if abs(actual - 51) <= 4 else "corrected")
