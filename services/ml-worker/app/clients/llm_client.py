import json
import logging
import re

from app.config import settings
from app.schemas.webhook import ParsedTask

logger = logging.getLogger(__name__)

MOCK_RESPONSE = ParsedTask(
    title="Задача из входящего сообщения",
    description="Автоматически распознанная задача. Требуется ревью менеджера.",
    urgency="MEDIUM",
)

SYSTEM_PROMPT = (
    "Parse the following text into a task. "
    "Return JSON with fields: title (short, under 100 chars), "
    "description (full text), urgency (LOW/MEDIUM/HIGH/URGENT), "
    "and deadline (ISO-8601 format, or null if missing)."
)


def try_repair_json(raw: str) -> str:
    """Attempt to extract and repair JSON from LLM output.

    Handles common issues:
    - Markdown code fences (```json ... ```)
    - Leading/trailing whitespace
    - Trailing commas before } or ]
    """
    text = raw.strip()

    # Strip markdown code fences
    fence_pattern = re.compile(r"^```(?:json)?\s*\n?(.*?)\n?\s*```$", re.DOTALL)
    match = fence_pattern.match(text)
    if match:
        text = match.group(1).strip()

    # Remove trailing commas before } or ]
    text = re.sub(r",\s*([}\]])", r"\1", text)

    return text


async def _call_openai_compatible(text: str) -> str:
    """Call an OpenAI-compatible API endpoint via httpx."""
    import httpx

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {settings.llm_api_key}",
    }
    payload = {
        "model": settings.llm_model,
        "max_tokens": 512,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": text},
        ],
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{settings.llm_base_url}/chat/completions",
            headers=headers,
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]


async def _call_anthropic(text: str) -> str:
    """Call the Anthropic API via the official SDK."""
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=settings.llm_api_key)
    message = await client.messages.create(
        model=settings.llm_model,
        max_tokens=512,
        messages=[
            {
                "role": "user",
                "content": f"{SYSTEM_PROMPT}\nText: {text}",
            }
        ],
    )
    return message.content[0].text


async def parse_task(text: str) -> ParsedTask:
    if settings.use_mock_llm:
        logger.info("Using mock LLM — returning stub ParsedTask")
        words = text.split()
        title = " ".join(words[:8]) if len(words) > 3 else "Новая задача из входящего текста"
        if len(title) > 100:
            title = title[:97] + "..."
        description = f"Задача создана на основе входящего обращения.\n\n{text}\n\nТребуется обработка и ответ."
        urgency = "HIGH" if any(w in text.lower() for w in ["срочно", "кошмар", "ужас", "не работает"]) else "MEDIUM"
        return ParsedTask(title=title, description=description, urgency=urgency)

    # Choose API backend based on llm_base_url
    if settings.llm_base_url:
        raw = await _call_openai_compatible(text)
    else:
        raw = await _call_anthropic(text)

    try:
        repaired = try_repair_json(raw)
        data = json.loads(repaired)
        return ParsedTask(**data)
    except (json.JSONDecodeError, TypeError, KeyError):
        logger.warning("LLM returned unparseable response, using fallback")
        return ParsedTask(title=text[:100], description=text, urgency="MEDIUM")
