"""Guardrails for a public deployment: a daily model-call budget and a per-address limit.

Both are off by default (local development). On the public demo they are enabled with
`PULSE_AI_DAILY_CALL_BUDGET` and `PULSE_AI_IP_LIMIT_PER_HOUR`. When a limit is hit nothing
breaks: the model call raises `AIUnavailable`, and every caller already degrades to the
deterministic (demo) output with a visible label.
"""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from contextvars import ContextVar
from datetime import datetime, timezone

from app.config import settings

# Set by the HTTP middleware when the caller's address is over its hourly limit.
force_demo_reason: ContextVar[str | None] = ContextVar("pulse_force_demo_reason", default=None)


class DailyBudget:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._day = ""
        self.used = 0

    def take(self, n: int = 1) -> bool:
        limit = settings.pulse_ai_daily_call_budget
        if limit <= 0:
            return True
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        with self._lock:
            if today != self._day:
                self._day, self.used = today, 0
            if self.used + n > limit:
                return False
            self.used += n
            return True


class HourlyLimiter:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str) -> bool:
        limit = settings.pulse_ai_ip_limit_per_hour
        if limit <= 0:
            return True
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and now - q[0] > 3600:
                q.popleft()
            if len(q) >= limit:
                return False
            q.append(now)
            return True


budget = DailyBudget()
limiter = HourlyLimiter()


def check_model_call(n: int = 1) -> None:
    """Raise AIUnavailable when this request may not spend model calls. Called before every Foundry call."""
    from app.ai.provider import AIUnavailable

    reason = force_demo_reason.get()
    if reason:
        raise AIUnavailable(reason)
    if not budget.take(n):
        raise AIUnavailable("daily AI budget for the public demo is used up; deterministic output shown")
