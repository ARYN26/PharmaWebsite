# George Bot — Duo Prime Care Pharmacy Chatbot

Persistent context for Claude Code sessions. Read this before changing anything.

## What this is

**George bot**: a customer-facing chat widget for the static marketing site of
**Duo Prime Care Pharmacy LLC SPC** (retail pharmacy, M24 Musaffah Industrial Area,
Abu Dhabi, UAE — a **regulated healthcare business**). The live site is
`https://duoprimecarepharmacy.com`, a single-page static HTML site hosted on
**Hostinger** (the parent folder of this repo IS that site). Hostinger cannot run
Python, so:

- **Widget** (`widget/`) — vanilla JS/CSS, copied to the site root as
  `george-widget.js` / `george-widget.css` and loaded by one `<script>` tag in
  `../index.html`. Renders bottom-LEFT (the site's existing WhatsApp/social
  widget owns bottom-right; they coexist).
- **Backend** (`app/`) — FastAPI security proxy, deployed as a Docker container
  to AWS (EC2 free tier or Lightsail). Holds the OpenAI API key. **The
  security layer IS the backend** — treat `app/security.py` as the core.

## Hard constraints (do not violate)

1. **No medical advice, ever.** Clinical questions (dosing, interactions,
   "is X safe", symptoms, pregnancy/breastfeeding) are hard-refused by a
   deterministic keyword gate (EN + AR) BEFORE any LLM call, and routed to the
   pharmacist (WhatsApp +971502981072 / phone 02-667-4779).
2. **Grounded answers only.** The bot answers FAQ exclusively from
   `config/knowledge_base.yaml`. Fields whose value starts with `TODO` must
   never be guessed — the bot says it doesn't have that detail and routes to
   WhatsApp/phone.
3. **Bilingual.** Detect English vs Arabic and reply in the same language.
   Arabic renders RTL in the widget.
4. **No PHI storage.** Intake objects are validated and handed off (WhatsApp
   prefill / email pointer) — never persisted. No database of users.
5. **API key server-side only.** The widget only ever talks to our `/chat` and
   `/session` endpoints.
6. **No over-engineering.** No vector DB / RAG (the whole KB fits in the system
   prompt), no Temporal/queues, no OCR/document pipeline.

## Stack

- Python + FastAPI + Pydantic v2; OpenAI Python SDK (ported from Anthropic
  in v1.1 — the provider is isolated in `app/llm.py`; everything else talks
  to its 2-method interface).
- Model routing for cost (IDs come from env, never hardcoded in logic):
  - Intent classification + intake extraction: `MODEL_INTENT` (default `gpt-4.1-mini`)
  - Answer generation: `MODEL_ANSWER` (default `gpt-4.1`)
- Structured LLM outputs parse into Pydantic via
  `client.beta.chat.completions.parse(response_format=Schema)`;
  retry once on validation failure, then fall back to a safe routing message —
  never return an unvalidated blob.
- System prompt is **frozen per process** (built once from the YAML) so
  OpenAI's automatic prompt caching works; never interpolate timestamps/IDs
  into it.
- Widget: vanilla JS + CSS, no framework, no build step.
- Tests: pytest with the LLM fully mocked (see `tests/conftest.py`).

## Security model (`app/security.py`)

- CORS locked to `https://duoprimecarepharmacy.com`; localhost only when `DEV=true`.
- Rate limiting per-IP AND per-session (widget gets a session token from
  `GET /session`); env-configurable, defaults 20/min and 200/day each.
- Daily USD budget kill-switch (`DAILY_BUDGET_USD`, default 2.00): when the
  day's estimated spend exceeds it, LLM calls stop and a friendly bilingual
  "assistant is taking a break — WhatsApp us" reply is returned.
  **In-memory — resets on restart. TODO: Redis/persistent for production.**
- Input validation: max length (env, default 1000), control chars stripped,
  obvious prompt-injection payloads neutralized (routed, not executed).
- Structured JSON logs to stdout (intent, language, tokens, cost, latency,
  rate-limit hits). Never log full user message contents.

## Why AWS container, not Lambda

The rate-limit and budget counters are in-memory and need one long-lived
process. Lambda would reset the kill-switch per cold start and shard it across
concurrent instances. Moving counters to Redis/DynamoDB is the Phase 2 path
that would unlock serverless.

## Phase 2 / TODO (out of scope for v1 — do not build unless asked)

- GEPA/DSPy prompt optimization against `evals/golden_set.jsonl`.
- Langfuse (or similar) observability.
- Expanded KB: real insurance plan list, delivery terms, payment methods,
  current in-stock drug list (owner will provide).
- Arabic ground-truth validation in evals (native-speaker reviewed) +
  LLM-as-judge groundedness scoring in `evals/run_evals.py`.
- Redis/persistent storage for rate limits, sessions, and the budget counter.
- Conversation history (v1 is single-turn per request).
