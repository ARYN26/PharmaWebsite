"""Grounded bilingual answer generation (mid model) + canned refusal replies."""

from .kb import build_answer_system_prompt, get_contact
from .llm import LLMUsage
from .security import log_event


def refusal_reply(language: str) -> str:
    """Canned clinical refusal + pharmacist routing. No LLM call."""
    c = get_contact()
    if language == "ar":
        return (
            "عذراً، لا أستطيع تقديم نصائح طبية مثل الجرعات أو التفاعلات الدوائية "
            "أو مدى ملاءمة دواء معين لحالتك. صحتك تستحق رأي مختص — يرجى التواصل "
            f"مع الصيدلي المعتمد لدينا عبر واتساب {c['whatsapp']} "
            f"أو الاتصال على {c['phone']}."
        )
    return (
        "I'm sorry — I can't give medical advice such as dosing, drug "
        "interactions, or whether a medicine is right for you. Your health "
        "deserves a professional's attention: please message our DOH-certified "
        f"pharmacist on WhatsApp {c['whatsapp']} or call {c['phone']}."
    )


def safe_routing_reply(language: str) -> str:
    """Generic fallback when we can't (or shouldn't) answer. No LLM call."""
    c = get_contact()
    if language == "ar":
        return (
            "يمكنني المساعدة في أسئلة عن الصيدلية فقط (ساعات العمل، الموقع، "
            f"الخدمات). لأي شيء آخر يرجى مراسلتنا على واتساب {c['whatsapp']} "
            f"أو الاتصال على {c['phone']}."
        )
    return (
        "I can only help with questions about the pharmacy (hours, location, "
        f"services). For anything else, please message us on WhatsApp "
        f"{c['whatsapp']} or call {c['phone']}."
    )


def answer(message: str, language: str, llm) -> tuple[str, LLMUsage]:
    """Grounded answer from the knowledge base. Falls back to safe routing."""
    system = build_answer_system_prompt()
    try:
        reply, usage = llm.generate_answer(system, message)
        if not reply.strip():
            return safe_routing_reply(language), usage
        return reply, usage
    except Exception as err:  # noqa: BLE001 — API failure must never 500 the widget
        log_event("llm_error", stage="answer", error=f"{type(err).__name__}: {err}")
        return safe_routing_reply(language), LLMUsage(0, 0.0)
