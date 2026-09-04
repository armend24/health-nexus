from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Iterable

import httpx
from fastapi import HTTPException

from app.config import get_deepseek_api_key, get_deepseek_model

FALLBACK_MESSAGE = (
    "I'm here to help with Health Nexus workflows only. "
    "If you're stuck, contact support or review the relevant product documentation."
)

_KNOWLEDGE_DIR = Path(__file__).resolve().parent / "knowledge"
_KNOWLEDGE_FILES = (
    "platform.md",
    "pages.md",
    "roles.md",
    "workflows.md",
    "features.md",
    "rules.md",
)


@dataclass(slots=True)
class AssistantContext:
    page: str | None = None
    role: str | None = None
    tenant_id: int | None = None
    workflow: str | None = None
    recent_actions: list[str] | None = None
    navigation_links: list[str] | None = None


@lru_cache(maxsize=1)
def load_knowledge_bundle() -> str:
    sections: list[str] = []
    for filename in _KNOWLEDGE_FILES:
        path = _KNOWLEDGE_DIR / filename
        sections.append(path.read_text(encoding="utf-8").strip())
    return "\n\n".join(sections)


def _format_recent_actions(actions: Iterable[str] | None) -> str:
    if not actions:
        return "None"
    cleaned = [action.strip() for action in actions if action.strip()]
    return ", ".join(cleaned) if cleaned else "None"


def _format_navigation_links(links: Iterable[str] | None) -> str:
    if not links:
        return "None"
    cleaned = [link.strip() for link in links if link.strip()]
    return ", ".join(cleaned) if cleaned else "None"


def build_system_prompt(context: AssistantContext) -> str:
    knowledge = load_knowledge_bundle()
    return f"""
You are the Health Nexus guided support assistant.

Use only the product knowledge below. Never invent features, pages, roles, workflows, APIs, or permissions that are not described.

{knowledge}

Current user context:
- Role: {context.role or "Unknown"}
- Tenant ID: {context.tenant_id if context.tenant_id is not None else "Unknown"}
- Current page: {context.page or "Unknown"}
- Current workflow: {context.workflow or "Unknown"}
- Recent actions: {_format_recent_actions(context.recent_actions)}
- Navigation links: {_format_navigation_links(context.navigation_links)}

Response rules:
- Only answer questions about Health Nexus.
- Keep answers concise and practical.
- Prefer numbered steps for workflows.
- Respect role boundaries; do not suggest actions the role should not perform.
- When navigation is relevant, include the most useful internal route paths in backticks, for example `/login` or `/appointments/book`.
- Only use routes that exist in the product knowledge or provided navigation links.
- Never invent placeholder routes or bracket notation such as `/tenants/[tenant-id]`.
- If a tenant-specific page is needed and the slug is unknown, direct the user to `/tenants` first.
- If the request is outside Health Nexus or the answer is uncertain, reply exactly with:
  {FALLBACK_MESSAGE}
""".strip()


async def ask_assistant(message: str, context: AssistantContext) -> tuple[str, bool]:
    api_key = get_deepseek_api_key()
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="DEEPSEEK_API_KEY is not configured.",
        )

    payload = {
        "model": get_deepseek_model(),
        "messages": [
            {
                "role": "system",
                "content": build_system_prompt(context),
            },
            {
                "role": "user",
                "content": message.strip(),
            },
        ],
        "temperature": 0.2,
        "max_tokens": 350,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                "https://api.deepseek.com/v1/chat/completions",
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail="DeepSeek request failed.",
        ) from exc

    data = response.json()
    answer = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
    if not answer:
        return FALLBACK_MESSAGE, True

    fallback_used = answer == FALLBACK_MESSAGE
    return answer, fallback_used
