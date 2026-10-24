# Deployment: Azure Container Apps + Microsoft Foundry

PULSE AI ships as **one container**: FastAPI serves the API under `/api` and the built React app everywhere else. The public demo runs on **Azure Container Apps** and calls **Microsoft Foundry** with the app's **system-assigned managed identity** (no keys or secrets anywhere).

```
GitHub (main) --Actions--> ghcr.io/diegogarciagzz/pulseai:latest --> Azure Container Apps (1 replica)
                                                                      |  managed identity (Foundry User role)
                                                                      v
                                                     Microsoft Foundry project (gpt-5-mini) + Agent Framework agents
```

## 1. Image

`.github/workflows/container.yml` runs the backend tests and builds the multi-stage `Dockerfile` on every push to `main`, publishing `ghcr.io/<owner>/pulseai:latest` and `:<sha>`. After the first run, make the package public once: GitHub profile -> Packages -> `pulseai` -> Package settings -> Change visibility -> Public.

Run it locally (demo mode, no Azure needed):

```bash
docker build -t pulseai .
docker run -p 8000:8000 pulseai          # http://localhost:8000
```

## 2. Deploy

```bash
az login
bash deploy/azure-containerapps.sh
```

The script reads `FOUNDRY_PROJECT_ENDPOINT` and `FOUNDRY_MODEL` from `.env`, creates the Container Apps environment and app (external ingress, port 8000, 1 replica because state is in memory), enables a system-assigned identity, grants it the **Foundry User** role on the Foundry resource, restarts the app and prints the public URL. Re-running it updates the app to the latest image.

Verify: `python scripts/foundry_smoke.py https://<app-url>` should end with `LIVE FOUNDRY OK`.

## 3. Public-demo guardrails

Anyone with the link can trigger model calls, so the deployed app sets:

| Setting | Demo value | Effect |
| --- | --- | --- |
| `PULSE_AI_DAILY_CALL_BUDGET` | 400 | Max Foundry calls per UTC day across all visitors |
| `PULSE_AI_IP_LIMIT_PER_HOUR` | 30 | Model-backed requests (explain, debate, recap) per address per hour |

When a limit is reached nothing breaks: that request gets the deterministic output, labelled `demo`, exactly like running without Azure. Debates are cached per match, so most visitors never trigger new model calls. Both settings default to 0 (off) for local development. Covered by `backend/tests/test_guard.py`.

## 4. Cost

- Foundry: pay per token. A full two-round debate is a few US cents with `gpt-5-mini`; the daily budget caps the worst case.
- Container Apps (consumption): first 180,000 vCPU-seconds, 360,000 GiB-seconds and 2 million requests per month are free; one always-on 0.5 vCPU replica costs a few dollars a month beyond that.
