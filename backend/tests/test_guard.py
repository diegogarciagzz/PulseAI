"""Public-demo guardrails: per-address hourly limit and daily model-call budget.

A fake Foundry provider stands in for Azure so the tests run offline. When a limit is hit the
request must still succeed, with deterministic (demo-labelled) output instead of a model call.
"""
import json

import pytest
from fastapi.testclient import TestClient

from app.ai import provider as prov_mod
from app.ai.guard import budget, limiter
from app.ai.provider import FoundryProvider, ProviderStatus
from app.config import settings
from app.main import app


class FakeFoundry(FoundryProvider):
    def __init__(self) -> None:  # no Azure client
        self.endpoint, self.model, self.credential, self.credential_source = "https://fake", "fake-model", None, "test"
        self.calls = 0

    def _call(self, system: str, user: str) -> str:
        self.calls += 1
        return json.dumps({"explanation": "A short grounded explanation.", "summary": "A short grounded summary."})


@pytest.fixture()
def fake_foundry(monkeypatch):
    fake = FakeFoundry()
    monkeypatch.setattr(prov_mod, "_status", ProviderStatus(fake, True, "test", [], "fake", "fake-model"))
    monkeypatch.setattr(settings, "pulse_ai_ip_limit_per_hour", 0)
    monkeypatch.setattr(settings, "pulse_ai_daily_call_budget", 0)
    limiter._hits.clear()
    budget.used, budget._day = 0, ""
    yield fake
    limiter._hits.clear()
    budget.used, budget._day = 0, ""


def _first_insight(client: TestClient) -> tuple[str, str]:
    match_id = client.get("/api/matches").json()[0]["id"]
    insight_id = client.get(f"/api/matches/{match_id}/insights").json()[0]["id"]
    return match_id, insight_id


def test_ip_limit_falls_back_to_demo(fake_foundry, monkeypatch):
    monkeypatch.setattr(settings, "pulse_ai_ip_limit_per_hour", 2)
    with TestClient(app) as client:
        mid, iid = _first_insight(client)
        sources = [client.post(f"/api/matches/{mid}/insights/{iid}/explain", headers={"x-forwarded-for": "203.0.113.7"}).json()["source"]
                   for _ in range(3)]
        other = client.post(f"/api/matches/{mid}/insights/{iid}/explain", headers={"x-forwarded-for": "198.51.100.9"}).json()["source"]
    assert sources == ["foundry", "foundry", "demo"]
    assert other == "foundry"  # limits are per address
    assert fake_foundry.calls == 3


def test_daily_budget_falls_back_to_demo(fake_foundry, monkeypatch):
    monkeypatch.setattr(settings, "pulse_ai_daily_call_budget", 1)
    with TestClient(app) as client:
        mid, iid = _first_insight(client)
        first = client.post(f"/api/matches/{mid}/insights/{iid}/explain").json()
        second = client.post(f"/api/matches/{mid}/insights/{iid}/explain").json()
    assert first["source"] == "foundry"
    assert second["source"] == "demo"
    assert "budget" in second["explanation"]
    assert fake_foundry.calls == 1


def test_limits_off_by_default(fake_foundry):
    with TestClient(app) as client:
        mid, iid = _first_insight(client)
        sources = {client.post(f"/api/matches/{mid}/insights/{iid}/explain").json()["source"] for _ in range(5)}
    assert sources == {"foundry"}
