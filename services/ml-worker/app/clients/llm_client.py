import json
import logging

from app.config import settings
from app.schemas.webhook import ParsedTask

logger = logging.getLogger(__name__)

MOCK_RESPONSE = ParsedTask(
    title="Задача из входящего сообщения",
    description="Автоматически распознанная задача. Требуется ревью менеджера.",
    urgency="MEDIUM",
)


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

    import anthropic

    client = anthropic.AsyncAnthropic(api_key=settings.llm_api_key)
    message = await client.messages.create(
        model=settings.llm_model,
        max_tokens=512,
        messages=[
            {
                "role": "user",
                "content": (
                    "Parse the following text into a task. "
                    "Return JSON with fields: title (short, under 100 chars), "
                    "description (full text), urgency (LOW/MEDIUM/HIGH/URGENT). "
                    f"Text: {text}"
                ),
            }
        ],
    )
    raw = message.content[0].text
    try:
        data = json.loads(raw)
        return ParsedTask(**data)
    except (json.JSONDecodeError, TypeError, KeyError):
        logger.warning("LLM returned unparseable response, using fallback")
        return ParsedTask(title=text[:100], description=text, urgency="MEDIUM")
