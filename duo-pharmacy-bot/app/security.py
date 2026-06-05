"""THE CORE of George bot. The static site has no backend — this proxy layer is it.

Responsibilities:
- Session tokens for the widget (per-session rate limiting; per-IP alone is
  bypassable via proxy rotation, so we do BOTH).
- Sliding-window rate limits per IP and per session (env-configurable).
- Daily USD budget kill-switch: when exceeded, NO LLM calls are made and a
  friendly bilingual message is returned instead.
  TODO(production): all counters below are in-memory and reset on restart /
  don't share across replicas. Move to Redis or another persistent store.
- Input validation: max length, control-char stripping, lightweight
  prompt-injection detection (the grounded-only + refusal design already
  limits the injection surface — keep this lightweight).
- Structured JSON logging to stdout. NEVER log full user message contents
  (they may contain names/phone numbers).
"""

import json
import os
import re
import secrets
import sys
import time
import unicodedata
from collections import defaultdict, deque
from datetime import date, datetime, timezone


# --------------------------------------------------------------------------
# Structured logging
# --------------------------------------------------------------------------

def log_event(event: str, **fields) -> None:
    """One JSON object per line to stdout. No message contents allowed."""
    record = {"ts": datetime.now(timezone.utc).isoformat(), "event": event, **fields}
    print(json.dumps(record, ensure_ascii=False), file=sys.stdout, flush=True)


# --------------------------------------------------------------------------
# Session tokens
# --------------------------------------------------------------------------

SESSION_TTL_SECONDS = 24 * 3600


class SessionStore:
    """Issues and validates opaque session tokens for the widget.

    TODO(production): in-memory — move to Redis so restarts don't drop sessions.
    """

    def __init__(self):
        self._sessions: dict[str, float] = {}  # token -> created_at

    def issue(self) -> str:
        self._purge()
        token = secrets.token_urlsafe(24)
        self._sessions[token] = time.time()
        return token

    def is_valid(self, token: str) -> bool:
        created = self._sessions.get(token)
        return created is not None and (time.time() - created) < SESSION_TTL_SECONDS

    def _purge(self) -> None:
        now = time.time()
        expired = [t for t, c in self._sessions.items() if now - c >= SESSION_TTL_SECONDS]
        for t in expired:
            del self._sessions[t]


# --------------------------------------------------------------------------
# Rate limiting (sliding window, per arbitrary key — used for IPs AND sessions)
# --------------------------------------------------------------------------

class RateLimiter:
    """TODO(production): in-memory — move to Redis for multi-replica deploys."""

    def __init__(self, per_minute: int | None = None, per_day: int | None = None):
        self.per_minute = per_minute if per_minute is not None else int(os.getenv("RATE_LIMIT_PER_MINUTE", 20))
        self.per_day = per_day if per_day is not None else int(os.getenv("RATE_LIMIT_PER_DAY", 200))
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str) -> bool:
        """Record a hit for key and return False if a limit is exceeded."""
        now = time.time()
        window = self._hits[key]
        day_ago = now - 86400
        while window and window[0] < day_ago:
            window.popleft()
        in_last_minute = sum(1 for t in window if t > now - 60)
        if in_last_minute >= self.per_minute or len(window) >= self.per_day:
            return False
        window.append(now)
        return True


# --------------------------------------------------------------------------
# Daily budget kill-switch
# --------------------------------------------------------------------------

class BudgetTracker:
    """Cumulative estimated USD spend per calendar day AND calendar month (UTC).

    llm.LLMClient calls .add() after every API response; main.py checks
    .exceeded() BEFORE making any LLM call. The daily cap is burst protection;
    the monthly cap matches the owner's overall budget (~$12/mo).
    TODO(production): in-memory — resets on restart; move to Redis/DynamoDB.
    NOTE: because of that reset, the unbypassable backstop is the limit set on
    the OpenAI platform itself (disable auto-recharge / set a monthly limit).
    """

    def __init__(self, daily_budget_usd: float | None = None, monthly_budget_usd: float | None = None):
        self.daily_budget_usd = (
            daily_budget_usd if daily_budget_usd is not None else float(os.getenv("DAILY_BUDGET_USD", 2.00))
        )
        self.monthly_budget_usd = (
            monthly_budget_usd if monthly_budget_usd is not None else float(os.getenv("MONTHLY_BUDGET_USD", 12.00))
        )
        today = datetime.now(timezone.utc).date()
        self._day: date = today
        self._month: tuple[int, int] = (today.year, today.month)
        self._spent_usd: float = 0.0
        self._month_spent_usd: float = 0.0

    def _roll(self) -> None:
        today = datetime.now(timezone.utc).date()
        if today != self._day:
            self._day = today
            self._spent_usd = 0.0
        if (today.year, today.month) != self._month:
            self._month = (today.year, today.month)
            self._month_spent_usd = 0.0

    def add(self, cost_usd: float) -> None:
        self._roll()
        self._spent_usd += cost_usd
        self._month_spent_usd += cost_usd

    def exceeded(self) -> bool:
        self._roll()
        return self._spent_usd >= self.daily_budget_usd or self._month_spent_usd >= self.monthly_budget_usd

    @property
    def spent_usd(self) -> float:
        self._roll()
        return self._spent_usd

    @property
    def month_spent_usd(self) -> float:
        self._roll()
        return self._month_spent_usd


# Friendly kill-switch reply, returned WITHOUT any LLM call.
BUDGET_EXCEEDED_REPLY = {
    "en": (
        "Our assistant is taking a short break. Please message us on WhatsApp "
        "+971502981072 or call 02-667-4779 — a team member will help you right away."
    ),
    "ar": (
        "مساعدنا في استراحة قصيرة. يرجى مراسلتنا على واتساب ‎+971502981072 "
        "أو الاتصال على 02-667-4779 وسيساعدك أحد أعضاء فريقنا فوراً."
    ),
}


# --------------------------------------------------------------------------
# Input validation
# --------------------------------------------------------------------------

class MessageTooLong(ValueError):
    pass


class EmptyMessage(ValueError):
    pass


# Obvious "ignore previous instructions"-style payloads (EN + AR).
# Lightweight on purpose: grounded-only answers + the clinical refusal gate
# already bound what an injected prompt could achieve.
_INJECTION_PATTERNS = [
    re.compile(r"ignore\s+(all\s+|the\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?)", re.I),
    re.compile(r"disregard\s+(all\s+|the\s+)?(previous|prior|above|earlier|your)\s+(instructions?|prompts?|rules?)", re.I),
    re.compile(r"\b(system\s+prompt|developer\s+message)\b", re.I),
    re.compile(r"you\s+are\s+now\s+(a|an|in)\b.{0,40}(mode|model|assistant|ai)", re.I),
    re.compile(r"\bjailbreak\b|\bDAN\b", re.I),
    re.compile(r"تجاهل\s+(كل\s+)?(التعليمات|الأوامر)\s+(السابقة|أعلاه)"),
]


def sanitize_message(raw: str, max_chars: int | None = None) -> tuple[str, bool]:
    """Validate + clean one user message.

    Returns (clean_text, injection_flagged).
    Raises MessageTooLong / EmptyMessage.
    """
    limit = max_chars if max_chars is not None else int(os.getenv("MAX_MESSAGE_CHARS", 1000))
    if len(raw) > limit:
        raise MessageTooLong(f"message exceeds {limit} characters")
    # Strip control characters (keep \n and \t).
    clean = "".join(
        ch for ch in raw if ch in "\n\t" or unicodedata.category(ch)[0] != "C"
    ).strip()
    if not clean:
        raise EmptyMessage("empty message")
    flagged = any(p.search(clean) for p in _INJECTION_PATTERNS)
    return clean, flagged
