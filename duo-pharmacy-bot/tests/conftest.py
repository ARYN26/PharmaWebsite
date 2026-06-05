"""Shared fixtures. The OpenAI SDK is NEVER called in tests."""

import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

os.environ.setdefault("OPENAI_API_KEY", "test-key-never-used")
os.environ.setdefault("DEV", "true")

from app.llm import LLMUsage  # noqa: E402
from app.models import Intent, IntakeRecord  # noqa: E402


class FakeLLM:
    """Same interface as app.llm.LLMClient, fully scripted.

    - .structured_results: list of objects (or Exceptions) popped per
      parse_structured call; schema-matched defaults otherwise.
    - .answer_text: returned by generate_answer.
    - .calls: log of (method, schema_or_none) for asserting routing.
    """

    def __init__(self):
        self.calls: list[tuple[str, object]] = []
        self.structured_results: list[object] = []
        self.answer_text = "FAKE GROUNDED ANSWER"
        self.usage = LLMUsage(tokens=100, cost_usd=0.0005)

    def generate_answer(self, system, user_message, max_tokens=500):
        self.calls.append(("generate_answer", None))
        return self.answer_text, self.usage

    def parse_structured(self, system, user_message, schema, max_tokens=300):
        self.calls.append(("parse_structured", schema))
        if self.structured_results:
            result = self.structured_results.pop(0)
            if isinstance(result, Exception):
                raise result
            return result, self.usage
        # Schema-matched defaults
        if schema is Intent:
            return Intent(category="faq", confidence=0.9, language="en"), self.usage
        if schema is IntakeRecord:
            return IntakeRecord(request_type="order", language="en"), self.usage
        raise AssertionError(f"unexpected schema {schema}")

    @property
    def answer_model_calls(self) -> int:
        return sum(1 for m, _ in self.calls if m == "generate_answer")


@pytest.fixture
def fake_llm():
    return FakeLLM()


@pytest.fixture
def client(fake_llm, monkeypatch):
    """FastAPI TestClient with the fake LLM injected and fresh counters."""
    from fastapi.testclient import TestClient

    from app import main

    monkeypatch.setattr(main, "_llm", fake_llm)
    # Fresh in-memory state per test
    monkeypatch.setattr(main, "sessions", main.SessionStore())
    monkeypatch.setattr(main, "ip_limiter", main.RateLimiter())
    monkeypatch.setattr(main, "session_limiter", main.RateLimiter())
    monkeypatch.setattr(main, "budget", main.BudgetTracker())
    return TestClient(main.app)


@pytest.fixture
def session_token(client):
    return client.get("/session").json()["session_token"]


def post_chat(client, token, message):
    return client.post("/chat", json={"message": message, "session_token": token})
