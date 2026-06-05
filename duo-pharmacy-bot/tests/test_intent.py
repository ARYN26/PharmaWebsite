"""Routing: the deterministic clinical gate fires before any LLM; faq vs intake route correctly."""

import pytest

from app.intent import classify, clinical_gate, detect_language
from app.models import Intent
from tests.conftest import FakeLLM, post_chat

CLINICAL_EN = [
    "What dose of metformin should I take?",
    "Can I take ibuprofen with my insulin?",
    "Is panadol safe during pregnancy?",
    "I have a fever and headache, what should I take?",
    "Does atorvastatin have side effects?",
    "How many tablets should I take per day?",
    "500 mg twice a day okay?",
]

CLINICAL_AR = [
    "ما هي الجرعة المناسبة من الميتفورمين؟",
    "هل يمكنني تناول البنادول مع المضاد الحيوي؟",
    "هل هذا الدواء آمن للحامل؟",
    "أعاني من أعراض حساسية، ماذا آخذ؟",
    "هل له آثار جانبية؟",
]


@pytest.mark.parametrize("message", CLINICAL_EN + CLINICAL_AR)
def test_clinical_gate_catches_without_llm(message):
    fake = FakeLLM()
    intent, usage = classify(message, fake)
    assert intent.category == "clinical_refuse"
    assert fake.calls == []          # deterministic gate — zero LLM calls
    assert usage.tokens == 0


@pytest.mark.parametrize(
    "message,expected",
    [("What are your opening hours?", "en"), ("ما هي ساعات العمل؟", "ar"), ("Where are you located", "en")],
)
def test_language_detection(message, expected):
    assert detect_language(message) == expected


def test_non_clinical_not_gated():
    assert not clinical_gate("What are your opening hours?")
    assert not clinical_gate("Do you deliver to Mussafah?")


def test_faq_routes_to_answer_model(client, fake_llm, session_token):
    fake_llm.structured_results = [Intent(category="faq", confidence=0.95, language="en")]
    r = post_chat(client, session_token, "What are your opening hours?")
    assert r.status_code == 200
    data = r.json()
    assert data["intent"]["category"] == "faq"
    assert data["reply"] == "FAKE GROUNDED ANSWER"
    assert fake_llm.answer_model_calls == 1


def test_intake_routes_to_extraction_not_answer_model(client, fake_llm, session_token):
    from app.models import IntakeRecord

    fake_llm.structured_results = [
        Intent(category="intake", confidence=0.9, language="en"),
        IntakeRecord(request_type="order", item_or_category="insulin", language="en"),
    ]
    r = post_chat(client, session_token, "I want to order insulin, my number is 0501234567")
    assert r.status_code == 200
    data = r.json()
    assert data["intent"]["category"] == "intake"
    assert data["handoff"]["channel"] == "whatsapp"
    assert fake_llm.answer_model_calls == 0   # intake never hits the answer model


def test_clinical_via_endpoint_never_reaches_any_model(client, fake_llm, session_token):
    r = post_chat(client, session_token, "Can I take aspirin with warfarin?")
    assert r.status_code == 200
    assert r.json()["intent"]["category"] == "clinical_refuse"
    assert fake_llm.calls == []      # neither classifier nor answer model called
