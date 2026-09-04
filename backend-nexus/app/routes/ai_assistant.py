from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.ai.assistant import AssistantContext, ask_assistant
from app.auth.auth_utils import get_current_user_optional

router = APIRouter(tags=["ai-assistant"])


class AssistantChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    page: str | None = Field(default=None, max_length=200)
    workflow: str | None = Field(default=None, max_length=200)
    recent_actions: list[str] | None = Field(default=None, max_length=10)
    navigation_links: list[str] | None = Field(default=None, max_length=20)


class AssistantChatResponse(BaseModel):
    answer: str
    fallback_used: bool


@router.post("/api/ai-assistant/chat", response_model=AssistantChatResponse)
async def chat_with_assistant(
    body: AssistantChatRequest,
    user: dict[str, Any] | None = Depends(get_current_user_optional),
) -> AssistantChatResponse:
    answer, fallback_used = await ask_assistant(
        body.message,
        AssistantContext(
            page=body.page,
            workflow=body.workflow,
            recent_actions=body.recent_actions,
            navigation_links=body.navigation_links,
            role=user.get("role") if user else None,
            tenant_id=user.get("tenant_id") if user else None,
        ),
    )
    return AssistantChatResponse(
        answer=answer,
        fallback_used=fallback_used,
    )
