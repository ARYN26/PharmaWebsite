"""Structured intake extraction → handoff. NOTHING is persisted (no PHI storage).

The extracted IntakeRecord is only used to build a prefilled WhatsApp message
so the customer lands in a human channel with context already typed for them.
"""

from urllib.parse import quote

from .kb import get_contact
from .llm import LLMUsage
from .models import IntakeRecord

# Frozen system prompt (cache-friendly — no dynamic content).
_EXTRACT_SYSTEM = """Extract an intake record from ONE message sent to a pharmacy
website chatbot. Output the structured object only. Rules:
- name / contact / item_or_category: only if explicitly present in the message,
  otherwise null. NEVER invent values.
- request_type: "order" (buy/reserve/availability of a medication),
  "transfer" (move a prescription to this pharmacy),
  "general_question" (wants a human to answer something), else "other".
- language: "ar" if the message is mainly Arabic, else "en".
- urgency: "urgent" only if the user clearly says it is urgent/today/asap,
  else "normal"."""

_REQUEST_LABEL = {
    "order": {"en": "Order request", "ar": "طلب شراء"},
    "transfer": {"en": "Prescription transfer", "ar": "نقل وصفة طبية"},
    "general_question": {"en": "Question", "ar": "استفسار"},
    "other": {"en": "Request", "ar": "طلب"},
}


def _prefilled_message(record: IntakeRecord) -> str:
    lang = record.language
    label = _REQUEST_LABEL[record.request_type][lang]
    parts = [f"{label} (Duo Prime Care website)"]
    if record.item_or_category:
        parts.append(f"Item: {record.item_or_category}" if lang == "en" else f"الصنف: {record.item_or_category}")
    if record.name:
        parts.append(f"Name: {record.name}" if lang == "en" else f"الاسم: {record.name}")
    if record.contact:
        parts.append(f"Contact: {record.contact}" if lang == "en" else f"للتواصل: {record.contact}")
    if record.urgency == "urgent":
        parts.append("URGENT" if lang == "en" else "عاجل")
    return " | ".join(parts)


def build_handoff(record: IntakeRecord) -> dict:
    c = get_contact()
    prefill = _prefilled_message(record)
    return {
        "channel": "whatsapp",
        "value": c["whatsapp"],
        "url": f"https://wa.me/{c['whatsapp'].lstrip('+')}?text={quote(prefill)}",
        "prefilled_message": prefill,
        "alt_email": c["email"],
        "record": record.model_dump(),  # returned to the widget only — never stored
    }


def _handoff_reply(record: IntakeRecord) -> str:
    c = get_contact()
    if record.language == "ar":
        return (
            "ممتاز! جهزت رسالة لفريقنا — اضغط زر واتساب أدناه لإرسالها مباشرة، "
            f"أو اتصل بنا على {c['phone']} وسنكمل طلبك فوراً."
        )
    return (
        "Great — I've prepared a message for our team. Tap the WhatsApp button "
        f"below to send it, or call us on {c['phone']} and we'll take it from there."
    )


def handle_intake(message: str, language: str, llm) -> tuple[str, dict, LLMUsage]:
    """Extract an IntakeRecord (retry once, then safe fallback) and build the handoff."""
    record = None
    usage = LLMUsage(0, 0.0)
    for _ in range(2):  # one retry on validation failure
        try:
            record, usage = llm.parse_structured(_EXTRACT_SYSTEM, message, IntakeRecord)
            break
        except Exception:  # noqa: BLE001
            record = None
    if record is None:
        # Safe fallback: still hand off, just without extracted fields.
        record = IntakeRecord(request_type="other", language=language)
    handoff = build_handoff(record)
    return _handoff_reply(record), handoff, usage
