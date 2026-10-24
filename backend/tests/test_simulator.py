from collections import Counter

import pytest

from app.analytics.pulse import compute_pulse
from app.analytics.stats import player_stats, possession_seconds, score_at, team_stats
from app.models.core import EventType
from app.simulator.engine import simulate
from app.simulator.rosters import TEAMS, player_index
from app.simulator.scenarios import SCENARIOS

PLAYERS = player_index()


@pytest.fixture(scope="module", params=list(SCENARIOS))
def match(request):
    sc = SCENARIOS[request.param]
    return sc, simulate(sc)


def test_reproducible(match):
    sc, events = match
    again = simulate(sc)
    assert [e.model_dump() for e in events] == [e.model_dump() for e in again]
    other = simulate(sc, seed=sc.seed + 1)
    assert [e.model_dump() for e in events] != [e.model_dump() for e in other]


def test_event_ordering_and_ids(match):
    _, events = match
    ts = [e.t for e in events]
    assert ts == sorted(ts)
    assert [e.seq for e in events] == list(range(1, len(events) + 1))
    assert len({e.id for e in events}) == len(events)
    assert events[0].type == EventType.KICKOFF and events[-1].type == EventType.FULLTIME
    assert all(e.minute == e.t // 60 and 0 <= e.minute <= 90 for e in events)
    ht = [e for e in events if e.type == EventType.HALFTIME]
    assert len(ht) == 1 and ht[0].t == 2700
    periods = [e.period for e in events]
    assert periods == sorted(periods)
    assert all(e.period == 1 for e in events if e.t < 2700) and all(e.period == 2 for e in events if e.t > 2700)


def test_scores_match_scenario(match):
    sc, events = match
    goals = [e for e in events if e.type == EventType.GOAL]
    assert len(goals) == len(sc.goals)
    for g, planned in zip(goals, sc.goals):
        assert g.team == planned.team
        assert g.player_id == planned.scorer
        assert abs(g.minute - planned.minute) <= 1
    # running score on every event matches the goals seen so far
    h = a = 0
    for e in events:
        if e.type == EventType.GOAL:
            if e.team == sc.home:
                h += 1
            else:
                a += 1
        assert (e.score_home, e.score_away) == (h, a)
    assert score_at(events, 5400) == (h, a)
    # shots with outcome goal == goals
    assert sum(1 for e in events if e.type == EventType.SHOT and e.outcome == "goal") == len(goals)


def test_player_and_team_references(match):
    sc, events = match
    on = {t: {p.id for p in TEAMS[t].players if p.starter} for t in (sc.home, sc.away)}
    for e in events:
        if e.team is not None:
            assert e.team in (sc.home, sc.away)
        if e.player_id is not None:
            assert e.player_id in PLAYERS
            assert PLAYERS[e.player_id].team == e.team
            if e.type not in (EventType.SUBSTITUTION,):
                assert e.player_id in on[e.team], f"{e.id} {e.player_name} not on pitch"
        if e.type == EventType.SUBSTITUTION:
            assert e.related_player_id in on[e.team]
            on[e.team].remove(e.related_player_id)
            on[e.team].add(e.player_id)
        assert len(on[sc.home]) == 11 and len(on[sc.away]) == 11


def test_coordinates_and_frames(match):
    sc, events = match
    for e in events:
        if e.x is not None:
            assert -2 <= e.x <= 107 and -1 <= e.y <= 69
            assert e.pitch_x is not None
            if e.team == sc.home:
                assert e.pitch_x == e.x and e.pitch_y == e.y
            else:
                assert abs(e.pitch_x - (105 - e.x)) < 0.11 and abs(e.pitch_y - (68 - e.y)) < 0.11


def test_possession_is_time_based(match):
    sc, events = match
    poss = possession_seconds(events)
    assert set(poss) == {sc.home, sc.away}
    total = sum(poss.values())
    assert 3000 <= total <= 5400
    hs, as_ = team_stats(events, sc.home), team_stats(events, sc.away)
    assert abs(hs.possession_pct + as_.possession_pct - 100) < 0.2
    assert 30 <= hs.possession_pct <= 70
    assert hs.goals + as_.goals == len(sc.goals)
    assert hs.shots_on_target <= hs.shots and hs.goals <= hs.shots_on_target


def test_player_stats_consistency(match):
    sc, events = match
    ps = player_stats(events)
    goals = [e for e in events if e.type == EventType.GOAL]
    assert sum(s.goals for s in ps.values()) == len(goals)
    assert sum(s.assists for s in ps.values()) == sum(1 for g in goals if g.related_player_id)
    for s in ps.values():
        assert s.passes_completed <= s.passes
        assert s.shots_on_target <= s.shots
        assert 0 <= s.minutes <= 90
        if s.minutes == 0:
            assert s.touches == 0
    # starters play until substituted
    subs = [e for e in events if e.type == EventType.SUBSTITUTION]
    for sub in subs:
        assert ps[sub.related_player_id].minutes == sub.t // 60
        assert abs(ps[sub.player_id].minutes - (90 - sub.t // 60)) <= 1


def test_pulse_bounds_and_response(match):
    sc, events = match
    pulse = compute_pulse(events, sc.home, sc.away)
    assert len(pulse) == 181
    assert all(-1 <= p.value <= 1 and 0 <= p.home <= 1 and 0 <= p.away <= 1 for p in pulse)
    # momentum reacts to goals: the scoring team's smoothed score is clearly positive around each goal
    for g in [e for e in events if e.type == EventType.GOAL]:
        key = "home" if g.team == sc.home else "away"
        around = [p for p in pulse if g.t - 60 <= p.t <= g.t + 60]
        assert max(getattr(p, key) for p in around) >= 0.25
    # and the signal is not flat
    assert max(p.value for p in pulse) - min(p.value for p in pulse) > 0.5


def test_scenario_stories():
    cb = simulate(SCENARIOS["comeback"])
    assert score_at(cb, 2700) == (0, 2) and score_at(cb, 5400) == (3, 2)
    mp = simulate(SCENARIOS["momentum-paradox"])
    hs, as_ = team_stats(mp, "north-city"), team_stats(mp, "south-united")
    assert as_.shots > hs.shots * 2 and as_.xg > hs.xg
    assert score_at(mp, 5400) == (2, 1)
    hh = simulate(SCENARIOS["hidden-hero"])
    ps = player_stats(hh)
    hero = ps["NCF06"]
    assert hero.goals == 0
    others = [s for pid, s in ps.items() if s.team == "north-city" and pid != "NCF06"]
    assert hero.progressive_passes >= max(s.progressive_passes for s in others)
    assert hero.defensive_actions >= max(s.defensive_actions for s in others)


def test_event_mix_is_plausible(match):
    _, events = match
    c = Counter(e.type for e in events)
    assert 400 <= c[EventType.PASS] <= 1200
    assert 10 <= c[EventType.SHOT] <= 60
    assert c[EventType.KICKOFF] == 2
