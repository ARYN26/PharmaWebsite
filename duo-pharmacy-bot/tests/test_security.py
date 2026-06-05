"""Security regressions: monthly spend cap and X-Forwarded-For spoofing."""

from app.security import BudgetTracker


def test_monthly_budget_trips_killswitch():
    """Monthly cap must trip even when the daily cap is nowhere near exceeded."""
    t = BudgetTracker(daily_budget_usd=100.0, monthly_budget_usd=0.05)
    t.add(0.04)
    assert not t.exceeded()
    t.add(0.02)  # 0.06 this month > 0.05 monthly cap (daily 100.0 untouched)
    assert t.exceeded()


def test_daily_budget_still_trips():
    t = BudgetTracker(daily_budget_usd=0.05, monthly_budget_usd=100.0)
    t.add(0.06)
    assert t.exceeded()


def test_spoofed_xff_cannot_evade_ip_limit(client, fake_llm, monkeypatch):
    """Caddy APPENDS the real client IP to X-Forwarded-For, so we must key the
    rate limit on the LAST entry — attacker-controlled prefixes must not matter."""
    from app import main

    monkeypatch.setattr(main, "ip_limiter", main.RateLimiter(per_minute=2, per_day=10))
    token = client.get("/session").json()["session_token"]

    def chat(fake_prefix):
        return client.post(
            "/chat",
            json={"message": "hours?", "session_token": token},
            headers={"X-Forwarded-For": f"{fake_prefix}, 9.9.9.9"},
        )

    assert chat("1.1.1.1").status_code == 200
    assert chat("2.2.2.2").status_code == 200
    # Third request from the same REAL IP (last entry) must 429 even though
    # the spoofed first entry differs every time.
    assert chat("3.3.3.3").status_code == 429
