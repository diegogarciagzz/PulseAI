"""Deterministic claim extraction.

Commentary is split into sentences and each sentence is matched against a set of
football claim patterns. The result is a list of *atomic* `NarrativeClaim`s with a
metric key, subject (team or player), comparator, value and time window. Sentences
that express an opinion are kept as `opinion` claims (they are not judged); sentences
nothing matches become `unknown` (reported as UNVERIFIED, never as verified).

A Foundry-backed extractor can propose claims too, but it must produce the same
structure and it can never invent event ids: evidence is always retrieved by code.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from app.models.core import ClaimWindow, NarrativeClaim
from app.simulator.rosters import TEAMS, find_player_by_name

FULL_T = 90 * 60

TEAM_ALIASES: dict[str, str] = {
    "north city": "north-city", "north city fc": "north-city", "ncf": "north-city", "the needles": "north-city", "city": "north-city",
    "south united": "south-united", "south united fc": "south-united", "suf": "south-united", "the arches": "south-united", "united": "south-united",
}

METRIC_PATTERNS: list[tuple[str, str, str]] = [
    # (regex fragment, metric key, unit)
    (r"possession", "possession_pct", "%"),
    (r"of the ball", "possession_pct", "%"),
    (r"shots? on target", "shots_on_target", "count"),
    (r"on target", "shots_on_target", "count"),
    (r"shots?", "shots", "count"),
    (r"attempts?", "shots", "count"),
    (r"efforts?", "shots", "count"),
    (r"expected goals|xg", "xg", "xg"),
    (r"final[- ]third entries", "final_third_entries", "count"),
    (r"entries into the final third", "final_third_entries", "count"),
    (r"box entries|entries into the box", "box_entries", "count"),
    (r"progressive pass(?:es)?", "progressive_passes", "count"),
    (r"key pass(?:es)?", "key_passes", "count"),
    (r"pass(?:ing)? accuracy|pass completion", "pass_accuracy", "%"),
    (r"pass(?:es)? completed|completed pass(?:es)?", "passes_completed", "count"),
    (r"pass(?:es)?", "passes", "count"),
    (r"times in the opposition half|ball wins? in the opposition half|high ball wins?|opposition-half ball wins?", "high_ball_wins", "count"),
    (r"ball wins?|times won the ball|won the ball", "defensive_actions", "count"),
    (r"recover(?:y|ies)|ball recover(?:y|ies)|won the ball back|regains?", "recoveries", "count"),
    (r"tackles?", "tackles", "count"),
    (r"interceptions?", "interceptions", "count"),
    (r"defensive actions", "defensive_actions", "count"),
    (r"corners?", "corners", "count"),
    (r"fouls?", "fouls", "count"),
    (r"assists?", "assists", "count"),
    (r"goals?", "goals", "count"),
    (r"touch(?:es)?", "touches", "count"),
]
METRIC_ALTERNATION = "|".join(f"(?:{frag})" for frag, _, _ in METRIC_PATTERNS)

NUMBER_WORDS = {"no": 0, "zero": 0, "one": 1, "a": 1, "an": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8,
                "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "twice": 2, "a brace": 2, "a hat-trick": 3, "a hat trick": 3, "a hattrick": 3}

OPINION_WORDS = ["deserve", "deserves", "brilliant", "magnificent", "best", "worst", "lucky", "unlucky", "should have", "looks", "feels",
                 "class", "masterclass", "superb", "poor", "terrible", "outstanding", "world-class", "clinical", "wasteful", "nervous", "composed"]


@dataclass
class Sentence:
    text: str
    lower: str


def _sentences(text: str) -> list[Sentence]:
    parts = re.split(r"(?<=[.!?])\s+|;\s+|\s+(?:and|but|while)\s+(?=[A-Z])", text.strip())
    return [Sentence(p.strip(), p.strip().lower()) for p in parts if p.strip()]


def _parse_number(tok: str) -> float | None:
    tok = tok.strip().lower().replace(",", "")
    if tok in NUMBER_WORDS:
        return float(NUMBER_WORDS[tok])
    try:
        return float(tok)
    except ValueError:
        return None


NUM = r"(?P<num>\d+(?:\.\d+)?|zero|no|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)"


def parse_window(lower: str, at_t: int) -> ClaimWindow | None:
    """Recognise 'last ten minutes', 'in the first half', 'between 55 and 67', 'since the 55th minute', 'so far'."""
    m = re.search(r"(?:last|past|previous)\s+(?P<n>\d+|ten|five|fifteen|twenty|thirty)\s+minutes", lower)
    if m:
        n = {"ten": 10, "five": 5, "fifteen": 15, "twenty": 20, "thirty": 30}.get(m.group("n")) or int(m.group("n"))
        return ClaimWindow(start_t=max(0, at_t - n * 60), end_t=at_t, label=f"last {n} minutes ({max(0, at_t - n * 60) // 60}' to {at_t // 60}')")
    if re.search(r"first[- ]half|opening 45|before (?:the )?break|before half[- ]time", lower):
        return ClaimWindow(start_t=0, end_t=min(at_t, 45 * 60), label="first half (0' to 45')")
    if re.search(r"second[- ]half|after (?:the )?break|after half[- ]time|since (?:the )?restart", lower):
        return ClaimWindow(start_t=45 * 60, end_t=max(45 * 60, at_t), label=f"second half (45' to {at_t // 60}')")
    m = re.search(r"(?P<a>\d+)'\s*(?:to|-|and|until)\s*(?P<b>\d+)'", lower) or re.search(r"between (?:the )?(?P<a>\d+)(?:st|nd|rd|th)?(?: minute)? and (?:the )?(?P<b>\d+)(?:st|nd|rd|th)?(?: minute)?", lower)
    if m:
        a, b = int(m.group("a")), int(m.group("b"))
        return ClaimWindow(start_t=a * 60, end_t=min(at_t, b * 60), label=f"{a}' to {min(at_t // 60, b)}'")
    m = re.search(r"(?:since|from) the (?P<a>\d+)(?:st|nd|rd|th) minute", lower)
    if m:
        a = int(m.group("a"))
        return ClaimWindow(start_t=a * 60, end_t=at_t, label=f"{a}' to {at_t // 60}'")
    m = re.search(r"in the first (?P<n>\d+) minutes", lower)
    if m:
        n = int(m.group("n"))
        return ClaimWindow(start_t=0, end_t=min(at_t, n * 60), label=f"0' to {min(at_t // 60, n)}'")
    return None


def _find_team(lower: str) -> str | None:
    """The team mentioned earliest in the sentence (longest alias wins at the same position)."""
    best: tuple[int, int, str] | None = None
    for alias in TEAM_ALIASES:
        m = re.search(rf"\b{re.escape(alias)}\b", lower)
        if m and (best is None or m.start() < best[0] or (m.start() == best[0] and len(alias) > best[1])):
            best = (m.start(), len(alias), TEAM_ALIASES[alias])
    return best[2] if best else None


def _find_player(text: str) -> tuple[str | None, str | None]:
    """Return (player_id, name_as_written). Unknown names are returned with id None."""
    for team in TEAMS.values():
        for p in team.players:
            first, last = p.name.split(" ", 1)
            if re.search(rf"\b{re.escape(p.name)}\b", text) or re.search(rf"\b{re.escape(last)}\b", text):
                return p.id, p.name
            if re.search(rf"\b{re.escape(first)}\b", text) and len(first) > 3:
                return p.id, p.name
    # a capitalised two-word name that is not a club or pundit: treat as an unknown player mention
    m = re.search(r"\b([A-Z][a-zé]+ [A-Z][a-zé]+)\b", text)
    if m and _find_team(m.group(1).lower()) is None and m.group(1) not in ("North City", "South United", "Match Pulse", "Narrative VAR", "Pulse Cyan"):
        return None, m.group(1)
    return None, None


def extract_claims(text: str, at_t: int = FULL_T) -> list[NarrativeClaim]:
    claims: list[NarrativeClaim] = []
    n = 0
    last_pid: str | None = None
    last_pname: str | None = None
    last_team: str | None = None
    last_window: ClaimWindow | None = None
    for s in _sentences(text):
        n += 1
        cid = f"C{n}"
        window = parse_window(s.lower, at_t)
        team = _find_team(s.lower)
        pid, pname = _find_player(s.text)
        lower = s.lower
        if pid is None and pname is None and last_pid and re.search(r"\b(he|she|his|her|him)\b", lower):
            pid, pname = last_pid, last_pname
        if team is None and last_team and re.search(r"\b(they|their|them|in that window|in that spell|in that period)\b", lower):
            team = last_team
        if window is None and last_window and re.search(r"\b(in that window|in that spell|in that period|during that spell|in the same window|over that spell)\b", lower):
            window = last_window
        if pid:
            last_pid, last_pname = pid, pname
        if team:
            last_team = team
        if window:
            last_window = window

        # --- scoring / assisting events ------------------------------------------------
        m = re.search(rf"(?:scored|scores|netted|bagged|has scored|got)\s*(?:{NUM}|a brace|a hat-trick|a hat trick|twice)?", lower)
        if m and (pid or pname) and "goals" not in lower.split(m.group(0))[0][-12:]:
            raw = (m.group("num") if m.groupdict().get("num") else None) or ("a brace" if "brace" in m.group(0) else "a hat-trick" if "hat" in m.group(0) else "twice" if "twice" in m.group(0) else None)
            value = _parse_number(raw) if raw else None
            claims.append(NarrativeClaim(id=cid, text=s.text, kind="event", metric="goals", team=team, player_id=pid, player_name=pname,
                                         comparator="eq" if value is not None else "gte", value=value if value is not None else 1, unit="count",
                                         window=window, event_type="goal"))
            extra = [c for c in _numeric_claims(s, cid + "n", lower, team, pid, pname, window) if not (c.metric == "goals" and value is not None)]
            claims.extend(extra)
            continue
        if re.search(r"\b(assisted|set up|assist for|provided the assist|laid on)\b", lower) and (pid or pname):
            claims.append(NarrativeClaim(id=cid, text=s.text, kind="event", metric="assists", team=team, player_id=pid, player_name=pname,
                                         comparator="gte", value=1, unit="count", window=window, event_type="goal"))
            continue
        if re.search(r"\b(was|has been|got) (booked|cautioned)|yellow card", lower) and (pid or pname):
            claims.append(NarrativeClaim(id=cid, text=s.text, kind="event", metric="cards", team=team, player_id=pid, player_name=pname,
                                         comparator="gte", value=1, unit="count", window=window, event_type="card"))
            continue
        if re.search(r"\b(came on|was substituted|replaced|brought on|subbed)\b", lower) and (pid or pname):
            claims.append(NarrativeClaim(id=cid, text=s.text, kind="event", metric="substitution", team=team, player_id=pid, player_name=pname,
                                         comparator="gte", value=1, unit="count", window=window, event_type="substitution"))
            continue

        # --- numeric metric claims (all of them in the sentence) -------------------------
        numeric_claims = _numeric_claims(s, cid, lower, team, pid, pname, window)
        if numeric_claims:
            claims.extend(numeric_claims)
            continue

        # --- comparisons ("more shots than", "out-shot", "dominated possession") ------------
        comp = re.search(r"\b(more|fewer|less)\s+(?P<what>[a-z -]+?)\s+than\b", lower)
        if comp and team:
            metric = _metric_for(comp.group("what"))
            if metric:
                claims.append(NarrativeClaim(id=cid, text=s.text, kind="comparison", metric=metric, team=team, comparator="more" if comp.group(1) == "more" else "less",
                                             unit="count", window=window))
                continue
        if re.search(r"\b(dominat\w+|controll\w+|bossed|on top|in charge)\b", lower) and team and re.search(r"possession|the ball|territory|the game|the match|the half|this period|proceedings|minutes", lower):
            claims.append(NarrativeClaim(id=cid, text=s.text, kind="comparison", metric="possession_pct", team=team, comparator="more", unit="%", window=window))
            continue
        if re.search(r"\b(out-?shot|outshot|more dangerous|created more)\b", lower) and team:
            claims.append(NarrativeClaim(id=cid, text=s.text, kind="comparison", metric="shots", team=team, comparator="more", unit="count", window=window))
            continue

        # --- player action without a number ("Marsh has not completed a pass") ---------------
        if pid and re.search(r"\b(hasn't|has not|haven't|didn't|did not|never|no)\b", lower):
            metric = _metric_for(lower) or "touches"
            claims.append(NarrativeClaim(id=cid, text=s.text, kind="metric", metric=metric, team=TEAMS_BY_PID.get(pid), player_id=pid, player_name=pname,
                                         comparator="eq", value=0, unit="count", window=window))
            continue

        # --- opinion ---------------------------------------------------------------------
        if any(w in lower for w in OPINION_WORDS):
            claims.append(NarrativeClaim(id=cid, text=s.text, kind="opinion", team=team, player_id=pid, player_name=pname, window=window))
            continue
        claims.append(NarrativeClaim(id=cid, text=s.text, kind="unknown", team=team, player_id=pid, player_name=pname, window=window))
    return claims


def _metric_for(fragment: str) -> str | None:
    for frag, key, _ in METRIC_PATTERNS:
        if re.search(frag, fragment):
            return key
    return None


TEAMS_BY_PID: dict[str, str] = {p.id: t.id for t in TEAMS.values() for p in t.players}
_ = find_player_by_name  # re-exported for callers that only import this module


def _numeric_claims(s: Sentence, cid: str, lower: str, team: str | None, pid: str | None, pname: str | None, window: ClaimWindow | None) -> list[NarrativeClaim]:
    """Find every (number, metric) pair in the sentence and return one atomic claim per pair."""
    found: list[tuple[int, int, str, str, float]] = []  # (start, end, metric, unit, value)
    pat_before = re.compile(rf"{NUM}(?!\s*')\s*(?:%|percent|per cent)?\s*(?:of\s+)?(?:the\s+)?(?:their\s+)?(?P<metric>{METRIC_ALTERNATION})\b")
    pat_after = re.compile(rf"\b(?P<metric>{METRIC_ALTERNATION})\s*(?:is|was|of|at|stands at|sits at|now at|:)?\s*{NUM}(?!\s*')\s*(?:%|percent|per cent)?")
    for pat in (pat_before, pat_after):
        for m in pat.finditer(lower):
            value = _parse_number(m.group("num"))
            if value is None:
                continue
            metric = _metric_for(m.group("metric"))
            if not metric:
                continue
            unit = next(u for frag, key, u in METRIC_PATTERNS if key == metric)
            if any(a <= m.start() < b or a < m.end() <= b for a, b, *_ in found):
                continue
            found.append((m.start(), m.end(), metric, unit, value))
    found.sort()
    mentions = _player_mentions(s.text)
    out: list[NarrativeClaim] = []
    for i, (a, b, metric, unit, value) in enumerate(found):
        frag = lower[a:b]
        comparator = "approx"
        before = lower[max(0, a - 24):a]
        if metric == "passes" and re.search(r"complet\w*\s*$", before):
            metric = "passes_completed"
        if mentions:
            prior = [m for m in mentions if m[0] <= a]
            if prior:
                pid, pname = prior[-1][1], prior[-1][2]
            elif team is None:
                pid, pname = mentions[0][1], mentions[0][2]
            else:
                pid, pname = None, None
        if re.search(r"\b(at least|more than|over|above|upwards of)\b", before + frag):
            comparator = "gte"
        elif re.search(r"\b(at most|fewer than|less than|under|below|no more than)\b", before + frag):
            comparator = "lte"
        elif unit == "count":
            comparator = "eq"
        subject_player = pid if (pid and metric not in ("possession_pct", "corners")) else None
        out.append(NarrativeClaim(id=f"{cid}" if len(found) == 1 else f"{cid}.{i + 1}", text=s.text, fragment=frag.strip() if len(found) > 1 else None,
                                  kind="metric", metric=metric, team=TEAMS_BY_PID.get(subject_player, team) if subject_player else team,
                                  player_id=subject_player, player_name=pname if subject_player else None, comparator=comparator, value=value, unit=unit, window=window))
    return out


def _player_mentions(text: str) -> list[tuple[int, str, str]]:
    """All squad players mentioned in the sentence, with the position of the mention."""
    out: list[tuple[int, str, str]] = []
    for team in TEAMS.values():
        for p in team.players:
            first, last = p.name.split(" ", 1)
            m = re.search(rf"\b{re.escape(p.name)}\b", text) or re.search(rf"\b{re.escape(last)}\b", text)
            if m is None and len(first) > 3:
                m = re.search(rf"\b{re.escape(first)}\b", text)
            if m:
                out.append((m.start(), p.id, p.name))
    out.sort()
    return out
