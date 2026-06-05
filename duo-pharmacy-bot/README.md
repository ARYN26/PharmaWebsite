# George Bot — Duo Prime Care Pharmacy Chatbot (v1)

A bilingual (English/Arabic) chat widget for [duoprimecarepharmacy.com](https://duoprimecarepharmacy.com)
backed by a FastAPI security proxy that holds the OpenAI API key.

```
Hostinger (static site)                    AWS EC2 (Docker container)
┌────────────────────────┐    HTTPS      ┌──────────────────────────┐
│ index.html             │  ───────────▶ │ FastAPI proxy            │   OpenAI API
│  + george-widget.js    │   /session    │  CORS · rate limits      │ ───────────────▶
│  + george-widget.css   │   /chat       │  budget kill-switch      │  gpt-4.1-mini (intent)
│ (existing WA widget    │               │  clinical refusal gate   │  gpt-4.1 (answers)
│  stays bottom-right;   │               │  grounded KB prompt      │
│  George is bottom-left)│               │  (API key lives HERE)    │
└────────────────────────┘               └──────────────────────────┘
```

Why split? Hostinger static hosting can't run Python. The widget is plain
JS/CSS served from your existing site; the backend runs anywhere Docker runs.

## What it does

- **Grounded FAQ** (hours, location, contact, stocked categories, services)
  answered ONLY from `config/knowledge_base.yaml`. Unconfirmed fields (`TODO:`
  values) are never guessed — the bot routes to WhatsApp/phone instead.
- **Hard-refuses clinical questions** (dosing, interactions, "is X safe",
  symptoms…) via a deterministic EN+AR keyword gate *before* any LLM call,
  always routing to the pharmacist.
- **Bilingual**: detects English/Arabic, replies in kind; Arabic renders RTL.
- **Structured intake**: order / prescription-transfer requests are extracted
  into a validated record and turned into a prefilled WhatsApp handoff.
  Nothing is persisted (no PHI storage).
- **Security layer** (`app/security.py`): per-IP **and** per-session rate
  limits, daily USD budget kill-switch, input validation + injection
  neutralization, JSON logs that never contain message contents.

## Run locally

```bash
cd duo-pharmacy-bot
python -m venv .venv && .venv\Scripts\activate     # Windows (use source .venv/bin/activate on mac/linux)
pip install -r requirements.txt
copy .env.example .env                              # then put your real OPENAI_API_KEY in .env
uvicorn app.main:app --reload
```

Smoke test:

```bash
curl http://localhost:8000/health
# Get a session token, then chat:
curl http://localhost:8000/session
curl -X POST http://localhost:8000/chat -H "Content-Type: application/json" ^
     -d "{\"message\": \"What are your hours?\", \"session_token\": \"PASTE_TOKEN\"}"
```

Try the widget against the local backend: with `DEV=true` in `.env`, serve the
site folder (`python -m http.server 5500` in the repo root) and open
`http://localhost:5500` — the embed tag in `index.html` points at the backend
via its `data-api` attribute.

## Tests & evals

```bash
pytest                          # LLM fully mocked — no key, no cost
python evals/run_evals.py       # full run needs OPENAI_API_KEY; offline it
                                # still verifies the clinical gate + injections
```

## Embed on the live site (Hostinger)

One line before `</body>` in `index.html` (already added in this repo):

```html
<script src="george-widget.js?v=1.0" data-api="https://YOUR-BACKEND-DOMAIN" defer></script>
```

Upload `george-widget.js` and `george-widget.css` to `public_html/` alongside
`index.html`. When you change the widget, **bump the `?v=` number** — the site
uses version-param cache busting and `sw.js` caches aggressively.

Set `data-api` to your deployed backend URL (must be HTTPS in production).

## Deploy the backend to AWS

The counters (rate limit, daily budget) are in-memory, so the backend needs
**one long-running container** — not Lambda (a cold start would reset the
budget kill-switch; Redis is the Phase 2 path that unlocks serverless).

### EC2 free tier (t3.micro) — the live deployment

Production runs on EC2 instance `george-bot` (us-east-2), Elastic IP
`3.136.9.60`, DNS `bot.duoprimecarepharmacy.com` → that IP (A record in
Hostinger's DNS Zone). Connect via the console: instance → **Connect →
EC2 Instance Connect** (browser terminal), then:

```bash
# 1. One-time setup (Amazon Linux 2023):
sudo dnf install -y docker git
sudo systemctl enable --now docker
git clone https://github.com/ARYN26/PharmaWebsite.git
cd PharmaWebsite/duo-pharmacy-bot

# 2. Build + run (paste your real key — it lives only on the instance):
sudo docker build -t george-bot .
sudo docker run -d --name george --restart unless-stopped -p 127.0.0.1:8000:8000 \
  -e OPENAI_API_KEY=sk-... \
  -e ALLOWED_ORIGIN=https://duoprimecarepharmacy.com \
  -e DEV=false \
  -e DAILY_BUDGET_USD=2.00 \
  george-bot
curl http://localhost:8000/health    # -> {"status":"ok"}

# 3. HTTPS via Caddy (auto Let's Encrypt cert once DNS resolves):
sudo dnf install -y caddy
echo 'bot.duoprimecarepharmacy.com {
    reverse_proxy 127.0.0.1:8000
}' | sudo tee /etc/caddy/Caddyfile
sudo systemctl enable --now caddy
```

To deploy an update later:

```bash
cd ~/PharmaWebsite && git pull
cd duo-pharmacy-bot
sudo docker build -t george-bot .
sudo docker rm -f george
# re-run the `docker run` command from step 2
```

The embed tag uses `data-api="https://bot.duoprimecarepharmacy.com"`.

### Production env checklist

| Var | Production value |
|---|---|
| `OPENAI_API_KEY` | real key — server-side only, never in the widget |
| `ALLOWED_ORIGIN` | `https://duoprimecarepharmacy.com` |
| `DEV` | `false` (disables localhost CORS) |
| `DAILY_BUDGET_USD` | `2.00` (raise once traffic is understood) |
| `RATE_LIMIT_PER_MINUTE` / `RATE_LIMIT_PER_DAY` | `20` / `200` |

## Updating pharmacy facts

Edit `config/knowledge_base.yaml` and restart the container — no code changes.
Replace `TODO:` values as the owner confirms them (insurance plans, delivery
terms, payment methods); until then the bot routes those questions to WhatsApp.

## Project map

See `CLAUDE.md` for constraints, architecture rationale, and the Phase 2 TODO
list (GEPA/DSPy prompt optimization, Langfuse, Redis counters, expanded KB,
Arabic eval ground truth).
