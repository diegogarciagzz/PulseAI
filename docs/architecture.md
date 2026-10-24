# Architecture

PULSE AI is one React application talking to one FastAPI service. No message brokers, no WebSockets, no database: the server generates a whole match up front and the client decides how much of the timeline is visible.

```
React (Vite, TS strict)                      FastAPI (Python 3.11+)
┌──────────────────────────────┐             ┌────────────────────────────────────────┐
│ MatchContext                 │  /api/...   │ api/routes.py                          │
│  useReplay (client clock)    │◄───────────►│ services/match_store (in-memory)       │
│ features/                    │             │ simulator/  engine, scenarios, rosters │
│  live-match  match-pulse     │             │ analytics/  stats, pulse, insights     │
│  narrative-var  ai-studio    │             │ verification/ claims, verifier         │
│  match-recap  broadcast      │             │ ai/ provider (demo | foundry)          │
│ pulse/ (brand kit copy)      │             │ agents/ pundits, recap                 │
└──────────────────────────────┘             │ evaluation/ dataset, run_eval, ground. │
                                             └────────────────────────────────────────┘
```

## Data flow

1. `POST /api/matches/generate {scenario}` runs the simulator (or returns the cached match). Match Pulse points and insights are computed once and cached with the match.
2. The client downloads events, pulse points and insights in full, then drives a deterministic replay clock (`useReplay`). Everything rendered is filtered by `t <= clock`; insights are shown only once their evidence window has closed. Future events are never exposed in the UI.
3. Statistics shown during replay come from `GET /state?t=` (throttled), so the visual state is always derived from server computation on the same events.
4. Narrative VAR, insight explanations, the debate and the recap are server computations over the same event list, with the AI provider adding text that is re-verified before it is returned.

## Coordinate convention

The pitch is 105 x 68 metres (the brand kit `Pitch`). Each event carries two frames:

- `x, y`: the **acting team's attacking frame** (x = 0 own goal line, x = 105 the goal they attack, y = 0 top touchline). Analytics use this frame (final third = x >= 70, box = x >= 88.5 and 13.84 <= y <= 54.16).
- `pitch_x, pitch_y`: the **fixed display frame** where the home team attacks towards x = 105. Away events are mirrored (105 - x, 68 - y). The frontend draws this frame directly on the kit pitch.

## Synthetic match engine (`simulator/engine.py`)

A stateful simulation of *possession sequences*. One `random.Random(seed)` drives everything, so a scenario always yields byte-identical events (tested). Each sequence: a team carries and passes the ball forward (step size depends on the scenario's per-window attacking intensity and the carrier's progression tendency); passes can be intercepted, carries tackled, sequences end with shots, fouls, corners or a loose-ball recovery. Scheduled goals from the scenario force a build-up through the scripted assist provider to the scripted scorer at the scripted minute; all other shots are saved, blocked or off target, so the final score is the story and all surrounding statistics are emergent. Substitutions are applied at their minute and change the on-pitch set used for player selection.

Integrity guarantees (all under test): chronological `t`, stable sequential ids, players on the pitch when they act, 11 per side at all times, running score on every event, shots-with-goal-outcome equals goals, coordinates inside the pitch, substitutes' minutes consistent.

## Statistics (`analytics/stats.py`)

Possession is **ball time**: each possession sequence credits its owner with the seconds from its first event to the start of the next sequence. A second reading, share of completed passes, is kept so Narrative VAR can report CONFLICTED when the two methods disagree on a claim. Team and player statistics can be computed over any `[start_t, end_t]` window; everything the UI shows comes from these functions.

## Match Pulse (`analytics/pulse.py`)

1. Each event earns its team a threat weight: goal 14, shot 1.6 to 3.5 plus 2 x xG, completed pass 0.15 plus bonuses for progressive (+0.5), final-third entry (+0.9), box entry (+1.2), key pass (+0.8); carries similar; ball wins 0.6, +1.2 in the opposition half, +0.8 in the final third; corner 1.4; misplaced pass -0.3; foul -0.2.
2. Weights are accumulated in 30-second buckets per team.
3. Each team series is smoothed with an exponential moving average, half-life 150 s, reset at half-time.
4. Smoothed scores are divided by a fixed scale (9.0) and clipped to 0..1; the chart value is `home - away` in -1..1.

It is an activity and territory index, labelled as such in the UI; it is not a scoring probability.

## Insight detection (`analytics/insights.py`)

Deterministic detectors, each producing a `MomentumInsight` with window, team, importance, event ids, evidence references and a template explanation whose numbers are computed over a window snapped to whole minutes (so the text "between 50' and 56'" means exactly `[3000, 3360]` and Narrative VAR re-derives the same figures):

- **Momentum swing**: sign flip of the chart value beyond ±0.18, with a 4-minute cooldown.
- **Pressure surge**: a team's own index above 0.55 for at least 3 minutes.
- **Attacking surge**: three or more shots inside five minutes.
- **Defensive stand**: a ball win inside the own box after an opponent spell with at least one shot and three box actions in 90 seconds.
- **Goal build-up**: the possession sequence that produced each goal.
- **Substitution impact**: average index rises by at least 0.18 in the ten minutes after a change.

## Narrative VAR (`verification/`)

1. **Claim extraction** (`claims.py`): sentences are matched against football patterns. Event claims (scored, assisted, booked, substituted), numeric metric claims (all number plus metric pairs in a sentence, pronoun and window carry-over across sentences, per-number player attribution), comparisons (more/fewer than, dominated), opinions, unknown. Windows: "last N minutes", halves, "between A' and B'", "since the Nth minute".
2. **Evidence retrieval** (`verifier.py`): the events that define the metric for that subject in that window, returned as `EvidenceReference`s with real ids.
3. **Deterministic check**: counts exact; percentages ±4 points; xG ±0.25.
4. **Status**: VERIFIED, CORRECTED (figure exists but is wrong; rewrite proposed), UNSUPPORTED (contradicted: no such goal, player not in squad), CONFLICTED (ball-time and pass-share possession disagree about the claim), UNVERIFIED (opinion, untracked metric). Overall: unsupported > conflicted > corrected > verified (all factual claims verified) > unverified. Models never judge numbers; an unavailable model never yields VERIFIED.
5. **Audit trail**: every result lists claim, metric, subject, window, claimed, actual, status and evidence ids.

Verification is time-aware: `at_t` limits the evidence to events already played, so a claim about a goal that happens later is UNSUPPORTED at that time (tested).

## AI provider (`ai/provider.py`)

`DemoProvider` returns deterministic fallbacks. `FoundryProvider` uses `AIProjectClient(endpoint, credential).get_openai_client().responses.create(model=...)`, asks for JSON, parses tolerantly, times out (`AI_TIMEOUT_SECONDS`), and raises `AIUnavailable` on failure so callers degrade to demo text and label it. Resolution order for credentials: EnvironmentCredential, AzureCliCredential, ManagedIdentityCredential, DefaultAzureCredential (no interactive browser). `GET /api/system/capabilities` exposes mode, host, model, credential source and notes.

## Pundit roundtable (`agents/pundits.py`)

Deterministic: candidate statistics, three lens scores (analyst, fan, tactician) with a documented formula, composite ranking, shortlist of five, per-lens picks, verdict rule (two agreeing lenses win, else composite), rating from composite. Model-backed in Foundry mode: three Microsoft Agent Framework `Agent`s on `FoundryChatClient`, concurrent opening round, one rebuttal round, moderator via the provider. Picks outside the shortlist are rejected. Every argument is verified by Narrative VAR and displayed with its status. Rounds are fixed at two; there is no open-ended agent conversation.

## Recap (`agents/recap.py`)

Fan and Analyst summaries from the same facts (English, Spanish optional), key events, top shifts with re-verified explanations, candidate table and the same Player of the Match rule as the Studio. Model summaries that fail verification are replaced by the evidence-based rewrite and re-checked.

## Broadcast (`frontend/src/features/broadcast/`)

The Render stage. The kit's overlay components sit on a 1920 x 1080 stage (`BroadcastStage`, scaled to the container or to full screen) over a stand-in feed: the kit pitch under a perspective "camera" that pans with the ball, labelled STAND-IN FEED / SYNTHETIC MATCH DATA. A telestrator layer (`feed.tsx`) draws the last 24 match seconds from the event stream: passes as team-coloured arrows (misplaced passes dashed with a cross), carries dotted, shots in lime to the goal mouth with xG, ball wins circled, shirt numbers on the passer and receiver, and the ball. Points are projected in code with the same camera maths as the CSS 3D pitch, so the graphics stay sharp. A play-by-play caption under the score bug says who has the ball, which way they attack, the zone and the action being drawn (above 10x it follows notable actions only, so it stays readable).

- `director.ts` is a pure cue queue (unit-tested). `autoCues(prev, t, events, insights)` turns what the replay clock just revealed into cue groups: a goal plus the scorer's player card, moments with importance >= 0.9 (momentum swings, pressure spells and substitution impact as a momentum toast, the rest as an insight lower-third), the half-time card and a persistent full-time card. A long jump counts as a seek and only picks up the last 15 seconds, so scrubbing never floods the screen. `directorReducer` lets goals and title cards jump the queue and replace routine graphics, drops auto cues that are more than eight match minutes old, and drops queued scorer cards once a newer goal arrives.
- `cues.tsx` renders each cue from live data only: goal band (scorer, assist, passes in the move, xG), player card (`/players?until_t=` so nothing after the cue time leaks; bars relative to the match leader), momentum toast with a sparkline of the real Match Pulse, AI insight (`/insights/{id}/explain`: Microsoft Foundry text plus its Narrative VAR status), Narrative VAR banner (`/verify` at the current clock, showing CHECKING, then the verdict and the correction), pundit nameplates and Player of the Match from the roundtable, half-time card with first-half statistics, full-time card with every goal. Requests are shared per key, so re-airing a graphic does not call the model again.
- Manual control: a director desk with one button and one keyboard shortcut per graphic, Auto/Manual mode, a VAR desk for typed claims, a rundown of what aired, and full screen (F). Pundit and Player of the Match graphics unlock at full-time because the roundtable uses full-match statistics.

## Frontend notes

- `src/pulse/` is the brand kit's `src/` (theme, components, broadcast) copied verbatim except for two small prop extensions (see `asset-integration.md`).
- Tailwind v3 is configured with the kit preset; most styling uses the kit's CSS variables and classes directly (`src/styles/app.css`).
- Accessibility: status is always icon plus label, chart markers are focusable buttons, controls have labels, reduced motion is respected by the kit CSS.
