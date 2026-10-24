# PULSE AI implementation progress

Resume instructions: read this file, then `README.md` and `docs/architecture.md`. Start servers with
`cd backend && source ../.venv/bin/activate && uvicorn app.main:app --reload --port 8000` and `cd frontend && npm run dev`.

## Status (October 24, 2026)
- [x] Phase 0: brand kit audited; 257 asset files and the kit's React sources copied into `frontend/` (see docs/asset-integration.md)
- [x] Phase 1: FastAPI backend, stateful synthetic engine (3 scenarios, reproducible), time-based possession, player stats, Match Pulse, insight detection, live dashboard with replay (1x to 300x, scrubber, jump chips), kit chart, event feed, server-side stats, pitch map
- [x] Phase 2: Narrative VAR (claim extraction, evidence retrieval, deterministic verification, six statuses, corrections, audit trail, interactive examples, time-aware checks)
- [x] Phase 3: AI provider abstraction (demo / Foundry via azure-ai-projects 2.x Responses API), capabilities endpoint, mode badge, grounded insight explanations verified by VAR, evaluation dataset (69 cases) and runner, optional azure-ai-evaluation groundedness hook
- [x] Phase 4: pundit roundtable (3 personas, lens scores, bounded 2-round debate, Agent Framework agents in Foundry mode, VAR-checked arguments, moderator verdict), studio UI with kit portraits
- [x] Phase 5: recap (fan/analyst, en/es), docs, README, demo script, .env.example, tests (backend 54, eval 69/69, vitest 5, Playwright 5, tsc, vite build)

## Not done / honest gaps
- Live Foundry inference and the Agent Framework debate path have not been executed (no Azure credentials in the dev environment). Code uses current SDKs and degrades to demo mode with a visible label. First thing to do with credentials: `cp .env.example .env`, fill endpoint + model, `az login`, restart backend, check `/api/system/capabilities`, run the Studio debate, then `python -m app.evaluation.run_eval --foundry`.
- Broadcast overlay components from the kit are available (`src/pulse/broadcast`) but not surfaced in the UI.
- Optional audio synthesis for the debate: not started.
- Repository is not yet a git repo and not public (user action: `git init`, review, publish).

## Next priorities
1. Run with real Foundry credentials; fix any API drift in `ai/provider.py` and `agents/pundits.py::_foundry_round` (FoundryChatClient credential plumbing).
2. Record the demo video following `docs/demo-script.md`.
3. Optional: broadcast overlay preview tab using `BroadcastStage` + `GoalAnnouncement` + `VarBanner`.
