import json
import logging
import re

import anthropic
import httpx

from app.config import settings
from app.schemas.webhook import ParsedTask

logger = logging.getLogger(__name__)

MOCK_DESCRIPTION_TEMPLATE = """\
## Описание

Задача автоматически создана на основе входящего обращения.

## Что нужно сделать

- [ ] Изучить суть проблемы
- [ ] Связаться с автором обращения
- [ ] Предложить решение

## Контекст

> Требуется ревью менеджера перед исполнением.

## Шаги

1. Прочитать исходное сообщение
2. Определить приоритет и ответственного
3. Взять в работу
"""

MOCK_RESPONSE = ParsedTask(
    title="Задача из входящего сообщения",
    description=MOCK_DESCRIPTION_TEMPLATE,
    urgency="MEDIUM",
)

SYSTEM_PROMPT = """\
Ты — ассистент по управлению задачами компании Victory Group. \
Преобразуй входящий текст в структурированную задачу.

Отвечай СТРОГО в формате JSON (без markdown-оборачивания), поля:
- "title": краткий заголовок на русском языке, до 80 символов
- "description": подробное описание на русском языке в формате Markdown. \
Обязательно используй структуру: заголовки (## Раздел), \
bullet-списки (- пункт), нумерованные списки (1. пункт), \
todo-чекбоксы (- [ ] задача), цитаты (> важное). Минимум 3 раздела.
- "urgency": одно из LOW / MEDIUM / HIGH / URGENT
- "deadline": дата ISO-8601 или null

Пример ответа:
{"title":"Исправить ошибку оплаты","description":"## Проблема\\n\\n> Пользователь не может оплатить заказ.",
"urgency":"HIGH","deadline":null}

Отвечай только JSON без каких-либо пояснений.\
"""


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
        logger.info("Using mock LLM — returning structured stub ParsedTask")
        words = text.split()
        title = " ".join(words[:8]) if len(words) > 3 else "Новая задача"
        if len(title) > 80:
            title = title[:77] + "..."
        urgency = (
            "URGENT"
            if any(w in text.lower() for w in ["срочно", "критично", "кошмар", "ужас", "не работает"])
            else "HIGH"
            if any(w in text.lower() for w in ["важно", "проблема", "баг", "ошибка"])
            else "MEDIUM"
        )
        description = (
            f"## Описание\n\n> {text[:200]}{'...' if len(text) > 200 else ''}\n\n"
            "## Что нужно сделать\n\n"
            "- [ ] Изучить суть обращения\n"
            "- [ ] Определить ответственного\n"
            "- [ ] Связаться с автором\n\n"
            "## Критерии выполнения\n\n"
            "1. Проблема устранена\n"
            "2. Автор уведомлён о результате\n"
            "3. Задача закрыта\n"
        )
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
