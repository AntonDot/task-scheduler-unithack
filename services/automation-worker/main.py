import asyncio
import json
import logging
import uuid
from typing import Any

import aio_pika
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://postgres:postgres@postgres:5432/taskscheduler"
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
    
    if c_type == "field_value_equals":
        field = params.get("field")
        expected = params.get("value")
        payload = context.get("payload", {})
        
        # Check all possible payload locations first
        if field in payload:
            actual = payload.get(field)
        elif "changes" in payload and field in payload["changes"]:
            actual = payload["changes"].get(field)
        else:
            # Not in payload, must fetch from DB for accurate evaluation
            task_id = payload.get("id") or payload.get("task_id")
            if task_id:
                async with SessionLocal() as db:
                    from sqlalchemy import text
                    # Note: field name is from config, usually title/urgency/etc.
                    res = await db.execute(text(f"SELECT {field} FROM tasks WHERE id = :tid"), {"tid": task_id})
                    actual = res.scalar()
            else:
                actual = None
        
        res_bool = str(actual) == str(expected)
        logger.info("Evaluating field_value_equals: field=%s, actual=%s, expected=%s -> %s", field, actual, expected, res_bool)
        return res_bool
    
    if c_type == "column_equals":
        expected = params.get("column_id")
        payload = context.get("payload", {})
        
        # Check all possible payload locations
        if "new_column_id" in payload:
            actual = payload.get("new_column_id")
        elif "column_id" in payload:
            actual = payload.get("column_id")
        elif "changes" in payload and "column_id" in payload["changes"]:
            actual = payload["changes"].get("column_id")
        else:
            # Not in payload, must fetch from DB
            task_id = payload.get("id") or payload.get("task_id")
            if task_id:
                async with SessionLocal() as db:
                    from sqlalchemy import text
                    res = await db.execute(text("SELECT column_id FROM tasks WHERE id = :tid"), {"tid": task_id})
                    actual = res.scalar()
            else:
                actual = None
        
        res_bool = str(actual) == str(expected)
        logger.info("Evaluating column_equals: actual=%s, expected=%s -> %s", actual, expected, res_bool)
        return res_bool

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

    return True # Default to True if unknown

async def execute_action(action: dict, context: dict):
    """Execute a single action (e.g., update task)."""
    a_type = action.get("type")
    params = action.get("params", {})
    task_id = context.get("payload", {}).get("id")
    
    if not task_id:
        return

    import httpx
    async with SessionLocal() as db:
        if a_type == "change_status" or a_type == "change_column":
            new_col = params.get("column_id")
            if new_col:
                from sqlalchemy import text
                await db.execute(text("UPDATE tasks SET column_id = :col WHERE id = :tid"), {"col": new_col, "tid": task_id})
                logger.info("Automation changed task %s column to %s", task_id, new_col)
                # Notify core-api about the update for real-time UI
                async with httpx.AsyncClient() as client:
                    await client.post(
                        f"{settings.core_api_url}/api/v1/tasks/internal/automation-event",
                        json={"task_id": task_id, "action": "column_changed", "message": f"Moved to column {new_col}"},
                        headers={"X-Service-Token": settings.service_token},
                        timeout=5.0
                    )
        
        elif a_type == "assign_user":
            user_id = params.get("user_id")
            from sqlalchemy import text
            await db.execute(text("UPDATE tasks SET assignee_id = :uid WHERE id = :tid"), {"uid": user_id, "tid": task_id})
            logger.info("Automation assigned task %s to user %s", task_id, user_id)
            # Notify core-api about the update for real-time UI
            async with httpx.AsyncClient() as client:
                await client.post(
                    f"{settings.core_api_url}/api/v1/tasks/internal/automation-event",
                    json={"task_id": task_id, "action": "task_updated", "message": f"Assigned to user {user_id}"},
                    headers={"X-Service-Token": settings.service_token},
                    timeout=5.0
                )
        
        elif a_type == "send_notification":
            message = params.get("message", "Automation trigger")
            user_id = params.get("user_id")
            if not user_id:
                from sqlalchemy import text
                res = await db.execute(text("SELECT assignee_id FROM tasks WHERE id = :tid"), {"tid": task_id})
                user_id = res.scalar()
            
            logger.info("Automation processing notification for task %s (targeted user: %s)", task_id, user_id)
            try:
                async with httpx.AsyncClient() as client:
                    # 1. Trigger Audit Log and WS for UI Bell - ALWAYS DO THIS
                    # This ensures co-assignees and the general task history are updated
                    await client.post(
                        f"{settings.core_api_url}/api/v1/tasks/internal/automation-event",
                        json={"task_id": task_id, "action": "notification", "message": message},
                        headers={"X-Service-Token": settings.service_token},
                        timeout=5.0
                    )

                    # 2. Trigger Push Notification only if we have a specific recipient
                    if user_id:
                        await client.post(
                            f"{settings.core_api_url}/api/v1/push/internal/notify",
                            json={
                                "user_id": user_id,
                                "title": "Automation",
                                "body": message,
                                "url": f"/task/{task_id}"
                            },
                            headers={"X-Service-Token": settings.service_token},
                            timeout=5.0
                        )
            except Exception as e:
                logger.error("Failed to send notification via core-api: %s", e)

        await db.commit()

async def process_event(event: dict):
    event_type = event.get("type")
    payload = event.get("payload", {})
    project_id = payload.get("project_id")
    
    if not project_id:
        return

    context = {"event_type": event_type, "payload": payload}

    async with SessionLocal() as db:
        from sqlalchemy import text
        # Fetch active automations for the project matching this trigger
        result = await db.execute(
            text("SELECT id, config FROM automations WHERE project_id = :pid AND is_active = true"),
            {"pid": project_id}
        )
        automations = result.fetchall()

        for auto_id, config in automations:
            # Simple trigger check
            trigger = config.get("trigger", {})
            if trigger.get("type") != event_type:
                continue
            
            # Evaluate conditions
            conditions = config.get("conditions", [])
            all_pass = True
            for cond in conditions:
                if not await evaluate_condition(cond, context):
                    all_pass = False
                    break
            
            if all_pass:
                logger.info("Triggering automation %s", auto_id)
                actions = config.get("actions", [])
                for action in actions:
                    await execute_action(action, context)
                
                # Log execution and update stats
                await db.execute(
                    text("INSERT INTO automation_logs (id, automation_id, status, details, ran_at) VALUES (:id, :aid, :status, :details, NOW())"),
                    {"id": uuid.uuid4(), "aid": auto_id, "status": "success", "details": json.dumps({"event": event_type})}
                )
                await db.execute(
                    text("UPDATE automations SET stats_runs = stats_runs + 1 WHERE id = :aid"),
                    {"aid": auto_id}
                )
                await db.commit()

async def consume():
    connection = await aio_pika.connect_robust(settings.rabbitmq_url)
    async with connection:
        channel = await connection.channel()
        await channel.set_qos(prefetch_count=10)
        
        queue = await channel.declare_queue(settings.automation_events_queue, durable=True)
        
        logger.info("Automation worker started, consuming from queue %s", settings.automation_events_queue)
        
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
