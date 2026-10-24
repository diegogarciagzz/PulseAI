# Hackathon submission text

Copy-ready text for the "Inside the Game" submission form. Replace the video link once the video is uploaded.

## Project name

PULSE AI: Beyond the Scoreline

## One-line description

PULSE AI turns a raw football event stream into broadcast-ready, fact-checked stories: live momentum, AI explanations from Microsoft Foundry, a multi-agent pundit studio and an on-air fact-checker that corrects wrong commentary before viewers see it.

## Links

- Live demo (no login): https://pulse-ai.whitestone-5de70be6.eastus.azurecontainerapps.io
- Source code: https://github.com/diegogarciagzz/PulseAI
- Demo video: <YouTube link>

## Description

**The problem.** Match data is everywhere, but it rarely tells a fan what is actually driving a game, and AI commentary can sound confident while getting the numbers wrong. Broadcasters cannot put a model's sentence on air without knowing it is true.

**What PULSE AI does.** It takes a synthetic match event stream (three reproducible fictional matches of about 1,400 events each: passes, carries, shots with xG, recoveries, cards, substitutions, goals) and runs the whole insight pipeline on it:

1. **Ingest.** A seeded simulation engine generates possession-by-possession events; a replay clock reveals them at 1x to 300x and never shows anything from the future.
2. **Interpret.** Code computes every statistic (ball-time possession, shots, xG, progression, recoveries) for any time window, plus **Match Pulse**, a documented momentum index, and six deterministic detectors for momentum swings, pressure spells, shot surges, defensive stands, goal build-ups and substitution impact.
3. **Explain.** Microsoft Foundry (`gpt-5-mini`) writes short explanations from an evidence pack of real statistics and event ids. Before any sentence reaches the screen, **Narrative VAR** extracts its claims, retrieves the evidence and checks every number in code, returning VERIFIED, CORRECTED (with a rewrite), UNSUPPORTED, CONFLICTED or UNVERIFIED, plus an audit trail.
4. **Render.** A **Broadcast** view puts the graphics on air over a labelled stand-in feed: score bug, goal band, player card, momentum toast, AI insight lower-third, Narrative VAR banner, pundit nameplates, Player of the Match, half-time and full-time cards and a live Match Pulse chart. An auto director airs them as the match unfolds; a director desk cues any of them by hand and can fact-check a typed commentary line live on air.
5. **Personalize.** Recaps in Fan or Analyst mode, in English or Spanish, built from the same verified facts.

**Agentic design.** In the AI Studio, three original pundits (the Analyst, the Fan and the Tactician) are separate **Microsoft Agent Framework** agents on Microsoft Foundry. Each argues for a Player of the Match from its own evidence lens; they run concurrently, then one rebuttal round, and a moderator closes with an evidence-based verdict. The debate is bounded to two rounds, picks outside the computed shortlist are rejected, and every argument is checked by Narrative VAR, so a confident but wrong claim is flagged on screen. The agents argue; code decides what is true.

**Trust and responsible AI.** Models only ever see statistics computed by code. Model text never overwrites a statistic. If Foundry is slow, unavailable or over budget, the app falls back to deterministic text and says so, and an unavailable model can never produce a VERIFIED label. The header badge always shows whether output is live Foundry or demo mode. All clubs, players, pundits and data are fictional; no real league data, footage or marks are used.

**Real-world impact.** The same pipeline fits a broadcaster's graphics desk (verified lower-thirds and corrections before air), a club or league app (personalised recaps in several languages), and a commentary team's live fact-checker.

## Microsoft technology used

- **Microsoft Foundry**: project with a `gpt-5-mini` deployment, called through the `azure-ai-projects` SDK (`AIProjectClient.get_openai_client()`, Responses API) for insight explanations, the moderator summary and recaps.
- **Microsoft Agent Framework**: the three pundits are `Agent`s on `FoundryChatClient`, run concurrently in two bounded rounds.
- **Azure Container Apps**: the public demo runs as one container (FastAPI serving the React build) with external ingress.
- **Managed identity and Azure RBAC**: the container app's system-assigned identity holds the Foundry User role, so there are no keys in the app or the repository (`azure-identity`, Azure CLI locally).
- **GitHub Actions and GitHub Container Registry**: tests run and the image is built on every push.
- Optional: `azure-ai-evaluation` GroundednessEvaluator hook alongside a 69-case Narrative VAR evaluation set.

Public demo guardrails: a daily model-call budget and a per-address hourly limit; when either is reached the app keeps working with deterministic output, clearly labelled.

## How to test

1. Open the live demo. The header badge should read **Foundry live**.
2. **Broadcast** tab: press **Start replay** and choose **60x**. Goals, scorer cards and momentum swings go on air by themselves. Press **I** for a Foundry-written insight with its Narrative VAR status, or **Check on air** in the Narrative VAR desk to see a wrong possession claim corrected on screen. Press **F** for full screen.
3. **Narrative VAR** tab: try the example claims (a correct statistic, a wrong figure, a fabricated goal, an opinion).
4. **AI Studio** tab: press **Start debate** (about 30 seconds on Foundry), then read the fact-checked arguments and the verdict. Back in **Broadcast** at full-time, press **O** for Player of the Match and **N** for the pundits.
5. **Match Recap** tab: switch Fan and Analyst, English and Spanish.

To run it locally, follow the README (works without Azure in demo mode). Tests: 60 backend tests, 69 evaluation cases, 11 frontend unit tests and 6 Playwright end-to-end tests.
