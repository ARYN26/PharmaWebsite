"""Thin OpenAI wrapper: model routing, token/cost accounting, structured parsing.

- Small model (MODEL_INTENT) for intent classification + intake extraction.
- Mid model (MODEL_ANSWER) for grounded answer generation.
- Model IDs and prices come from env — never hardcoded in logic.
- Every call reports (tokens, cost_usd) so security.BudgetTracker can enforce
  the daily kill-switch.

Note on prompt caching: OpenAI caches prompt prefixes >1024 tokens
automatically — no opt-in needed. The system prompt is frozen per process
(kb.py lru_cache), which is exactly what makes that work.
"""

import os
from typing import NamedTuple, Type, TypeVar

from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)


class LLMUsage(NamedTuple):
    tokens: int
    cost_usd: float


def _price(env_key: str, default: float) -> float:
    return float(os.getenv(env_key, default))


class LLMClient:
    """Wraps the OpenAI SDK. Tests replace this with a fake (same interface)."""

    def __init__(self, budget_tracker=None):
        from openai import OpenAI  # imported lazily so tests never need a real key

        self.client = OpenAI()  # reads OPENAI_API_KEY from env
        self.model_intent = os.getenv("MODEL_INTENT", "gpt-4.1-mini")
        self.model_answer = os.getenv("MODEL_ANSWER", "gpt-4.1")
        # USD per 1M tokens
        self.prices = {
            self.model_intent: (_price("PRICE_INTENT_INPUT", 0.40), _price("PRICE_INTENT_OUTPUT", 1.60)),
            self.model_answer: (_price("PRICE_ANSWER_INPUT", 2.00), _price("PRICE_ANSWER_OUTPUT", 8.00)),
        }
        self.budget_tracker = budget_tracker

    # ---- internals -------------------------------------------------------

    def _record(self, model: str, usage) -> LLMUsage:
        """Read usage off the API response and tally cost."""
        prompt_tokens = getattr(usage, "prompt_tokens", 0) or 0
        completion_tokens = getattr(usage, "completion_tokens", 0) or 0
        details = getattr(usage, "prompt_tokens_details", None)
        cached = (getattr(details, "cached_tokens", 0) or 0) if details else 0
        in_price, out_price = self.prices.get(model, (2.00, 8.00))
        # cached tokens are a SUBSET of prompt_tokens; bill them at 0.5x
        # (conservative — OpenAI's cache discount is 50-75% depending on model).
        cost = (
            (prompt_tokens - cached) * in_price
            + cached * in_price * 0.5
            + completion_tokens * out_price
        ) / 1_000_000
        total = prompt_tokens + completion_tokens
        if self.budget_tracker is not None:
            self.budget_tracker.add(cost)
        return LLMUsage(tokens=total, cost_usd=cost)

    # ---- public API ------------------------------------------------------

    def generate_answer(self, system: str, user_message: str, max_tokens: int = 500) -> tuple[str, LLMUsage]:
        """Grounded answer via the mid model."""
        completion = self.client.chat.completions.create(
            model=self.model_answer,
            max_completion_tokens=max_tokens,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_message},
            ],
        )
        usage = self._record(self.model_answer, completion.usage)
        text = completion.choices[0].message.content or ""
        return text, usage

    def parse_structured(
        self, system: str, user_message: str, schema: Type[T], max_tokens: int = 300
    ) -> tuple[T, LLMUsage]:
        """Small-model call constrained to a Pydantic schema.

        Raises on validation failure — callers retry once then fall back to a
        safe routing message (never an unvalidated blob).
        """
        completion = self.client.beta.chat.completions.parse(
            model=self.model_intent,
            max_completion_tokens=max_tokens,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_message},
            ],
            response_format=schema,
        )
        usage = self._record(self.model_intent, completion.usage)
        parsed = completion.choices[0].message.parsed
        if parsed is None:
            raise ValueError("structured output failed to parse")
        return parsed, usage
