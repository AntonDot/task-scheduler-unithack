import logging

from app.clients import core_api, llm_client
from app.schemas.webhook import DraftTextPayload, IncidentPayload, ParsedTask

logger = logging.getLogger(__name__)

_processed_events: set[str] = set()


def is_duplicate(event_id: str) -> bool:
    return event_id in _processed_events


def mark_processed(event_id: str) -> None:
    _processed_events.add(event_id)


async def handle_incident(payload: IncidentPayload) -> dict:
    if is_duplicate(payload.event_id):
        return {"status": "duplicate", "message": f"Event {payload.event_id} already processed"}

    is_critical = payload.external_rating is not None and payload.external_rating <= 2

    parsed = await llm_client.parse_task(payload.text)

    if is_critical:
        task_data = {
            "title": parsed.title,
            "description": parsed.description,
            "status": "TODO",
            "urgency": "URGENT",
            "deadline": parsed.deadline,
        }
    else:
        task_data = {
            "title": parsed.title,
            "description": parsed.description,
            "status": "AI_DRAFT",
            "urgency": parsed.urgency,
            "deadline": parsed.deadline,
        }

    try:
        result = await core_api.create_task(payload.project_slug, task_data)
        mark_processed(payload.event_id)
        return {"status": "created", "task_id": result.get("id"), "message": f"Task created as {task_data['status']}"}
    except Exception:
        logger.exception("Failed to create task in Core API")
        return {"status": "error", "message": "Failed to create task in Core API"}


async def handle_draft_text(payload: DraftTextPayload) -> dict:
    parsed: ParsedTask = await llm_client.parse_task(payload.text)

    task_data = {
        "title": parsed.title,
        "description": parsed.description,
        "status": "AI_DRAFT",
        "urgency": parsed.urgency,
        "deadline": parsed.deadline,
    }

    try:
        result = await core_api.create_task(payload.project_slug, task_data)
        return {"status": "created", "task_id": result.get("id"), "message": "AI Draft created"}
    except Exception:
        logger.exception("Failed to create draft task in Core API")
        return {"status": "error", "message": "Failed to create draft task"}
