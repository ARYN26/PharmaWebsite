"""Pydantic schemas. Every structured LLM output must parse into one of these."""

from typing import Literal, Optional

from pydantic import BaseModel, Field


class Intent(BaseModel):
    """Classification of one user message."""

    category: Literal["faq", "intake", "clinical_refuse", "out_of_scope"]
    confidence: float = Field(ge=0.0, le=1.0)
    language: Literal["en", "ar"]


class IntakeRecord(BaseModel):
    """Structured intake captured for handoff. NEVER persisted."""

    name: Optional[str] = None
    contact: Optional[str] = None
    request_type: Literal["order", "transfer", "general_question", "other"] = "other"
    item_or_category: Optional[str] = None
    language: Literal["en", "ar"] = "en"
    urgency: Literal["normal", "urgent"] = "normal"


class ChatRequest(BaseModel):
    """Body of POST /chat from the widget."""

    message: str
    session_token: str


class ChatResponse(BaseModel):
    """Body returned to the widget."""

    reply: str
    intent: Intent
    handoff: Optional[dict] = None
    tokens_used: int = 0
    cost_usd: float = 0.0
