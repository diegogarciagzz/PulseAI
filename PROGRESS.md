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
- [x] Phase 6 (Oct 24): Broadcast tab (kit overlays on a 1080p stage, auto director, director desk, VAR desk, rundown, full screen), model text normalisation (unicode spaces, team ids in evidence packs), Spanish demo recap fix, responsive grid fixes. Tests: backend 60, vitest 11, Playwright 6.

## Not done / honest gaps
- [x] Live Foundry verified (Oct 24): project `pulseai-diego`, deployment `gpt-5-mini`. Fixes: Responses API call now uses `instructions` + text `input` (role-only items were rejected with 400), reasoning effort low for gpt-5 models, FoundryChatClient receives the provider credential directly. Smoke test: `python scripts/foundry_smoke.py` -> LIVE FOUNDRY OK.
- Optional audio synthesis for the debate: not started.
- [x] Public repository: https://github.com/diegogarciagzz/PulseAI

## Next priorities
1. [x] Deployed (Oct 24): https://pulse-ai.whitestone-5de70be6.eastus.azurecontainerapps.io (Container Apps, managed identity -> Foundry, credential_source=managed identity). Redeploy after a new image: `bash deploy/azure-containerapps.sh`. Keep it running until Nov 10.
2. Record the demo video following `docs/demo-script.md`.
3. Submit with the text in `docs/submission.md` (deadline Oct 27, 11:59 pm PT).
