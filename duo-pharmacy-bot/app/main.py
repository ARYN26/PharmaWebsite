"""FastAPI app: CORS, /session, /chat, /health. Wires security + pipeline.

Run locally:  uvicorn app.main:app --reload
"""

import os
import time

from dotenv import load_dotenv

load_dotenv()  # before any module reads env

from fastapi import FastAPI, HTTPException, Request  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

from . import chat, intake, intent  # noqa: E402
from .models import ChatRequest, ChatResponse, Intent  # noqa: E402
from .security import (  # noqa: E402
    BUDGET_EXCEEDED_REPLY,
    BudgetTracker,
    EmptyMessage,
    MessageTooLong,
    RateLimiter,
    SessionStore,
    log_event,
    sanitize_message,
)

app = FastAPI(title="George Bot — Duo Prime Care Pharmacy", docs_url=None, redoc_url=None)

# ---------------------------------------------------------------------------
# CORS — locked to the pharmacy domain; localhost only when DEV=true.
# ---------------------------------------------------------------------------

_origins = [os.getenv("ALLOWED_ORIGIN", "https://duoprimecarepharmacy.com")]
if os.getenv("DEV", "").lower() == "true":
    _origins += ["http://localhost:8000", "http://localhost:5500", "http://127.0.0.1:8000",
                 "http://127.0.0.1:5500", "http://localhost:3000", "null"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

# ---------------------------------------------------------------------------
# Singletons (in-memory for v1 — see TODOs in security.py)
# ---------------------------------------------------------------------------

sessions = SessionStore()
ip_limiter = RateLimiter()
session_limiter = RateLimiter()
budget = BudgetTracker()
_llm = None  # lazy so tests can inject a fake before first use


def get_llm():
    global _llm
    if _llm is None:
        from .llm import LLMClient

        _llm = LLMClient(budget_tracker=budget)
    return _llm


def _client_ip(request: Request) -> str:
    # Behind Caddy the real client IP is the LAST X-Forwarded-For entry — the
    # proxy APPENDS it. Earlier entries are client-supplied and spoofable, so
    # trusting the first one would let attackers rotate fake IPs past the limiter.
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/session")
def new_session(request: Request):
    """Issue a session token to the widget (also rate limited per IP)."""
    ip = _client_ip(request)
    if not ip_limiter.allow(f"sess:{ip}"):
        log_event("rate_limited", scope="session_issue", ip=ip)
        raise HTTPException(status_code=429, detail="Too many requests")
    return {"session_token": sessions.issue()}


@app.post("/chat", response_model=ChatResponse)
def chat_endpoint(body: ChatRequest, request: Request):
    started = time.time()
    ip = _client_ip(request)

    # 1. Session token must be valid (per-session limiting depends on it).
    if not sessions.is_valid(body.session_token):
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    # 2. Rate limits — per IP AND per session.
    if not ip_limiter.allow(f"ip:{ip}") or not session_limiter.allow(f"tok:{body.session_token}"):
        log_event("rate_limited", scope="chat", ip=ip)
        raise HTTPException(status_code=429, detail="Too many requests — please slow down")

    # 3. Input validation (length, control chars, injection flag).
    try:
        message, injection_flagged = sanitize_message(body.message)
    except MessageTooLong:
        raise HTTPException(status_code=400, detail="Message too long")
    except EmptyMessage:
        raise HTTPException(status_code=400, detail="Empty message")

    language = intent.detect_language(message)

    # 4. Daily budget kill-switch — checked BEFORE any LLM call.
    if budget.exceeded():
        log_event(
            "budget_exceeded",
            day_spend_usd=round(budget.spent_usd, 4),
            month_spend_usd=round(budget.month_spent_usd, 4),
            ip=ip,
        )
        return ChatResponse(
            reply=BUDGET_EXCEEDED_REPLY[language],
            intent=Intent(category="out_of_scope", confidence=1.0, language=language),
            handoff=None,
        )

    # 5. Neutralize obvious injection payloads: don't execute, just route.
    if injection_flagged:
        log_event("injection_flagged", ip=ip, language=language)
        return ChatResponse(
            reply=chat.safe_routing_reply(language),
            intent=Intent(category="out_of_scope", confidence=1.0, language=language),
            handoff=None,
        )

    # 6. Intent: deterministic clinical gate first, then small-model classify.
    classified, intent_usage = intent.classify(message, get_llm())
    tokens = intent_usage.tokens
    cost = intent_usage.cost_usd
    handoff = None

    # 7. Branch.
    if classified.category == "clinical_refuse":
        reply = chat.refusal_reply(classified.language)  # canned — no answer-model call
    elif classified.category == "intake":
        reply, handoff, usage = intake.handle_intake(message, classified.language, get_llm())
        tokens += usage.tokens
        cost += usage.cost_usd
    else:  # faq / out_of_scope → grounded answer model handles both
        reply, usage = chat.answer(message, classified.language, get_llm())
        tokens += usage.tokens
        cost += usage.cost_usd

    log_event(
        "chat",
        intent=classified.category,
        language=classified.language,
        confidence=classified.confidence,
        tokens=tokens,
        cost_usd=round(cost, 6),
        latency_ms=int((time.time() - started) * 1000),
        day_spend_usd=round(budget.spent_usd, 4),
        # NOTE: deliberately no message contents — may contain contact details.
    )

    return ChatResponse(
        reply=reply,
        intent=classified,
        handoff=handoff,
        tokens_used=tokens,
        cost_usd=round(cost, 6),
    )
