"""Intake extraction: valid IntakeRecord, retry-then-fallback, handoff shape."""

from pydantic import ValidationError

from app.intake import build_handoff, handle_intake
from app.models import IntakeRecord
from tests.conftest import FakeLLM


def test_valid_extraction_builds_whatsapp_handoff():
    fake = FakeLLM()
    fake.structured_results = [
        IntakeRecord(
            name="Ahmed",
            contact="0501234567",
            request_type="order",
            item_or_category="insulin",
            language="en",
            urgency="urgent",
        )
    ]
    reply, handoff, usage = handle_intake("I urgently need insulin. Ahmed, 0501234567", "en", fake)
    assert handoff["channel"] == "whatsapp"
    assert handoff["value"] == "+971502981072"
    assert handoff["url"].startswith("https://wa.me/971502981072?text=")
    assert "insulin" in handoff["prefilled_message"]
    assert "Ahmed" in handoff["prefilled_message"]
    assert "URGENT" in handoff["prefilled_message"]
    assert handoff["record"]["request_type"] == "order"
    assert "WhatsApp" in reply


def test_validation_failure_retries_once_then_succeeds():
    fake = FakeLLM()
    fake.structured_results = [
        ValueError("structured output failed to parse"),       # first attempt fails
        IntakeRecord(request_type="transfer", language="en"),  # retry succeeds
    ]
    reply, handoff, _ = handle_intake("transfer my prescription please", "en", fake)
    assert handoff["record"]["request_type"] == "transfer"
    assert len([c for c in fake.calls if c[0] == "parse_structured"]) == 2


def test_double_failure_falls_back_to_safe_handoff():
    fake = FakeLLM()
    fake.structured_results = [ValueError("bad"), ValueError("bad again")]
    reply, handoff, usage = handle_intake("order something", "ar", fake)
    # Never an unvalidated blob: fallback record still validates and hands off.
    record = IntakeRecord(**handoff["record"])
    assert record.request_type == "other"
    assert record.language == "ar"
    assert handoff["channel"] == "whatsapp"
    assert "واتساب" in reply or "wa.me" in handoff["url"]


def test_arabic_prefill_uses_arabic_labels():
    record = IntakeRecord(request_type="order", item_or_category="انسولين", language="ar")
    handoff = build_handoff(record)
    assert "طلب شراء" in handoff["prefilled_message"]
    assert "انسولين" in handoff["prefilled_message"]


def test_nothing_is_persisted(tmp_path, monkeypatch):
    """Intake handling must not write any file (no PHI storage)."""
    import os

    fake = FakeLLM()
    monkeypatch.chdir(tmp_path)
    handle_intake("order insulin, im Sara 050111222", "en", fake)
    assert os.listdir(tmp_path) == []
