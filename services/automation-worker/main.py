import asyncio
import json
import logging
import re
import uuid

import aio_pika
import httpx
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from pydantic_settings import BaseSettings


def _render(template: str, context: dict) -> str:
    """Substitute {{a.b.c}} from nested dict context."""
    if not template:
        return ""

    def repl(m):
        path = m.group(1).strip().split(".")
        v = context
        for p in path:
            if isinstance(v, dict):
                v = v.get(p)
            else:
                v = None
                break
        return str(v) if v is not None else ""

    return re.sub(r"\{\{\s*([^}]+?)\s*\}\}", repl, template)


def _get_field(payload: dict, dotted: str):
    """Walk dotted path through nested dict, return None if missing."""
    if not dotted:
        return None
    v = payload
    for p in dotted.split("."):
        if isinstance(v, dict):
            v = v.get(p)
        else:
            return None
    return v


class Settings(BaseSettings):
    database_url: str = (
        "postgresql+asyncpg://postgres:postgres@postgres:5432/taskscheduler"
    )
    rabbitmq_url: str = "amqp://guest:guest@rabbitmq:5672/"
    automation_events_queue: str = "automation.events"
    core_api_url: str = "http://core-api:8000"
    service_token: str = "dev-service-token"

    model_config = {"env_prefix": "AUTOMATION_", "extra": "ignore"}


settings = Settings()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

engine = create_async_engine(settings.database_url)
SessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False)


async def evaluate_condition(condition: dict, context: dict) -> bool:
    """Evaluate a single condition with AND/OR support."""
    c_type = condition.get("type")
    params = condition.get("params", {})

    event_type = context.get("event_type", "")

    if c_type == "field_value_equals":
        field = params.get("field")
        expected = params.get("value")
        payload = context.get("payload", {})
        task_id = payload.get("id") or payload.get("task_id")

        actual = _get_field(payload, field)
        if actual is None and "changes" in payload:
            actual = _get_field(payload["changes"], field)
        if actual is None and task_id and event_type.startswith(("task_", "column_")):
            async with SessionLocal() as db:
                from sqlalchemy import text

                # Note: field name is from config, usually title/urgency/etc.
                res = await db.execute(
                    text(f"SELECT {field} FROM tasks WHERE id = :tid"), {"tid": task_id}
                )
                actual = res.scalar()

        res_bool = str(actual) == str(expected)
        logger.info(
            "Evaluating field_value_equals: field=%s, actual=%s, expected=%s -> %s",
            field,
            actual,
            expected,
            res_bool,
        )
        return res_bool

    if c_type == "column_equals":
        expected = params.get("column_id")
        payload = context.get("payload", {})
        task_id = payload.get("id") or payload.get("task_id")

        # Check all possible payload locations
        if "new_column_id" in payload:
            actual = payload.get("new_column_id")
        elif "column_id" in payload:
            actual = payload.get("column_id")
        elif "changes" in payload and "column_id" in payload["changes"]:
            actual = payload["changes"].get("column_id")
        elif task_id and event_type.startswith(("task_", "column_")):
            async with SessionLocal() as db:
                from sqlalchemy import text

                res = await db.execute(
                    text("SELECT column_id FROM tasks WHERE id = :tid"),
                    {"tid": task_id},
                )
                actual = res.scalar()
        else:
            actual = None

        res_bool = str(actual) == str(expected)
        logger.info(
            "Evaluating column_equals: actual=%s, expected=%s -> %s",
            actual,
            expected,
            res_bool,
        )
        return res_bool

    if c_type == "numeric_compare":
        field = params.get("field")
        op = params.get("op", "eq")
        expected = params.get("value")
        payload = context.get("payload", {})
        actual = _get_field(payload, field)
        if actual is None:
            return False
        try:
            a = float(actual)
            e = float(expected)
        except (TypeError, ValueError):
            return False
        if op == "gte":
            return a >= e
        if op == "lte":
            return a <= e
        if op == "gt":
            return a > e
        if op == "lt":
            return a < e
        if op == "eq":
            return a == e
        return False

    if c_type == "contains":
        field = params.get("field")
        needle = str(params.get("value", "")).lower()
        payload = context.get("payload", {})
        haystack = str(_get_field(payload, field) or "").lower()
        return needle in haystack

    if c_type == "regex_match":
        field = params.get("field")
        pattern = params.get("pattern", "")
        payload = context.get("payload", {})
        target = str(_get_field(payload, field) or "")
        try:
            return bool(re.search(pattern, target))
        except re.error:
            return False

    if c_type == "and":
        subs = params.get("conditions", [])
        for sub in subs:
            if not await evaluate_condition(sub, context):
                return False
        return True

    if c_type == "or":
        subs = params.get("conditions", [])
        for sub in subs:
            if await evaluate_condition(sub, context):
                return True
        return False

    return True  # Default to True if unknown


async def execute_action(action: dict, context: dict):
    """Execute a single action (e.g., update task)."""
    a_type = action.get("type")
    params = action.get("params", {})
    payload = context.get("payload", {})
    task_id = payload.get("id") or payload.get("task_id")

    if a_type == "create_task":
        project_id = payload.get("project_id")
        if not project_id:
            logger.warning("create_task requires project_id in payload")
            return
        title = _render(params.get("title", "New task"), payload)
        description = _render(params.get("description", ""), payload)
        urgency = params.get("urgency", "MEDIUM")
        column_id = params.get("column_id")  # may be None — backend will resolve
        assignee_id = params.get("assignee_id")

        body = {
            "project_id": project_id,
            "title": title,
            "description": description,
            "urgency": urgency,
        }
        if column_id is not None:
            body["column_id"] = column_id
        if assignee_id is not None:
            body["assignee_id"] = assignee_id

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    f"{settings.core_api_url}/api/v1/tasks/internal/from-automation",
                    json=body,
                    headers={"X-Service-Token": settings.service_token},
                )
                resp.raise_for_status()
                logger.info(
                    "Automation create_task succeeded: project=%s title=%r",
                    project_id,
                    title[:50],
                )
        except Exception as e:
            logger.error("Automation create_task failed: %s", e)
            raise
        return

    async with SessionLocal() as db:
        if a_type == "change_status" or a_type == "change_column":
            if not task_id:
                logger.warning("change_column requires task_id in payload")
                return
            new_col = params.get("column_id")
            if new_col:
                from sqlalchemy import text

                await db.execute(
                    text("UPDATE tasks SET column_id = :col WHERE id = :tid"),
                    {"col": new_col, "tid": task_id},
                )
                logger.info("Automation changed task %s column to %s", task_id, new_col)
                # Notify core-api about the update for real-time UI
                async with httpx.AsyncClient() as client:
                    await client.post(
                        f"{settings.core_api_url}/api/v1/tasks/internal/automation-event",
                        json={
                            "task_id": task_id,
                            "action": "column_changed",
                            "message": f"Moved to column {new_col}",
                        },
                        headers={"X-Service-Token": settings.service_token},
                        timeout=5.0,
                    )

        elif a_type == "assign_user":
            if not task_id:
                logger.warning("assign_user requires task_id in payload")
                return
            user_id = params.get("user_id")
            from sqlalchemy import text

            await db.execute(
                text("UPDATE tasks SET assignee_id = :uid WHERE id = :tid"),
                {"uid": user_id, "tid": task_id},
            )
            logger.info("Automation assigned task %s to user %s", task_id, user_id)
            # Notify core-api about the update for real-time UI
            async with httpx.AsyncClient() as client:
                await client.post(
                    f"{settings.core_api_url}/api/v1/tasks/internal/automation-event",
                    json={
                        "task_id": task_id,
                        "action": "task_updated",
                        "message": f"Assigned to user {user_id}",
                    },
                    headers={"X-Service-Token": settings.service_token},
                    timeout=5.0,
                )

        elif a_type == "send_notification":
            message = _render(params.get("message", "Automation trigger"), payload)
            user_id = params.get("user_id")
            project_id = payload.get("project_id")
            if not user_id and task_id:
                from sqlalchemy import text

                res = await db.execute(
                    text("SELECT assignee_id FROM tasks WHERE id = :tid"),
                    {"tid": task_id},
                )
                user_id = res.scalar()

            logger.info(
                "Automation send_notification task=%s project=%s user=%s",
                task_id,
                project_id,
                user_id,
            )
            try:
                async with httpx.AsyncClient() as client:
                    # 1. Audit Log + WS bell — works with or without task_id
                    event_body: dict = {"action": "notification", "message": message}
                    if task_id:
                        event_body["task_id"] = task_id
                    if project_id:
                        event_body["project_id"] = int(project_id)
                    await client.post(
                        f"{settings.core_api_url}/api/v1/tasks/internal/automation-event",
                        json=event_body,
                        headers={"X-Service-Token": settings.service_token},
                        timeout=5.0,
                    )

                    # 2. Push notification (only if VAPID is configured)
                    if user_id:
                        await client.post(
                            f"{settings.core_api_url}/api/v1/push/internal/notify",
                            json={
                                "user_id": user_id,
                                "title": "Automation",
                                "body": message,
                                "url": f"/task/{task_id}" if task_id else "/",
                            },
                            headers={"X-Service-Token": settings.service_token},
                            timeout=5.0,
                        )
            except Exception as e:
                logger.error("Failed to send notification via core-api: %s", e)

        await db.commit()


async def process_event(event: dict):
    event_type = event.get("type")
    payload = event.get("payload", {})
    project_id = payload.get("project_id")

    logger.info("Processing event: type=%r project_id=%s", event_type, project_id)

    if not project_id:
        logger.warning("Event has no project_id, skipping: %r", event)
        return

    context = {"event_type": event_type, "payload": payload}

    async with SessionLocal() as db:
        from sqlalchemy import text

        # Fetch active automations for the project matching this trigger
        result = await db.execute(
            text(
                "SELECT id, config FROM automations WHERE project_id = :pid AND is_active = true"
            ),
            {"pid": project_id},
        )
        automations = result.fetchall()
        logger.info(
            "Found %d active automations for project %s", len(automations), project_id
        )

        for auto_id, config in automations:
            # Simple trigger check
            trigger = config.get("trigger", {})
            trigger_type = trigger.get("type")
            if trigger_type != event_type:
                logger.debug(
                    "Automation %s skipped: trigger=%r != event=%r",
                    auto_id,
                    trigger_type,
                    event_type,
                )
                continue

            logger.info(
                "Automation %s matches event %r, evaluating conditions...",
                auto_id,
                event_type,
            )

            # Evaluate conditions
            conditions = config.get("conditions", [])
            all_pass = True
            for i, cond in enumerate(conditions):
                result_cond = await evaluate_condition(cond, context)
                logger.info("  Condition[%d] %r → %s", i, cond.get("type"), result_cond)
                if not result_cond:
                    all_pass = False
                    break

            if all_pass:
                logger.info(
                    "Triggering automation %s (all %d conditions passed)",
                    auto_id,
                    len(conditions),
                )
                actions = config.get("actions", [])
                for action in actions:
                    await execute_action(action, context)

                # Log execution and update stats
                await db.execute(
                    text(
                        "INSERT INTO automation_logs (id, automation_id, status, details, ran_at) VALUES (:id, :aid, :status, :details, NOW())"
                    ),
                    {
                        "id": uuid.uuid4(),
                        "aid": auto_id,
                        "status": "success",
                        "details": json.dumps({"event": event_type}),
                    },
                )
                await db.execute(
                    text(
                        "UPDATE automations SET stats_runs = stats_runs + 1 WHERE id = :aid"
                    ),
                    {"aid": auto_id},
                )
                await db.commit()


async def consume():
    connection = await aio_pika.connect_robust(settings.rabbitmq_url)
    async with connection:
        channel = await connection.channel()
        await channel.set_qos(prefetch_count=10)

        queue = await channel.declare_queue(
            settings.automation_events_queue, durable=True
        )

        logger.info(
            "Automation worker started, consuming from queue %s",
            settings.automation_events_queue,
        )

        async with queue.iterator() as queue_iter:
            async for message in queue_iter:
                async with message.process():
                    try:
                        event = json.loads(message.body.decode("utf-8"))
                        await process_event(event)
                    except Exception as e:
                        logger.error("Error processing event: %s", e)


if __name__ == "__main__":
    asyncio.run(consume())
