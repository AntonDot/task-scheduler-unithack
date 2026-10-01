import asyncio
import json
import logging
from typing import Any

import aio_pika

from app.config import settings

logger = logging.getLogger(__name__)


class RabbitMQManager:
    # RabbitMQ is an attachable resource: if it is not up when core-api starts (e.g. the
    # `full` compose profile is started later), keep retrying in the background instead of
    # disabling automations until the next restart.
    retry_interval_seconds = 10.0

    def __init__(self):
        self.connection: aio_pika.abc.AbstractConnection | None = None
        self.channel: aio_pika.abc.AbstractChannel | None = None
        self._retry_task: asyncio.Task | None = None

    async def start(self):
        if self.connection:
            return
        if not settings.rabbitmq_url:
            logger.info("RabbitMQ URL is not set, automation events are disabled")
            return
        if not await self._connect():
            logger.warning("RabbitMQ is unavailable, retrying every %ss", self.retry_interval_seconds)
            self._retry_task = asyncio.get_running_loop().create_task(self._retry())

    async def _connect(self) -> bool:
        connection = None
        try:
            connection = await aio_pika.connect_robust(settings.rabbitmq_url)
            channel = await connection.channel()
            # Ensure the queue exists
            await channel.declare_queue(settings.automation_events_queue, durable=True)
        except Exception as e:
            logger.debug("RabbitMQ connect failed: %s", e)
            if connection is not None:
                await connection.close()
            return False
        self.connection, self.channel = connection, channel
        logger.info("RabbitMQ connection started")
        return True

    async def _retry(self):
        while not await self._connect():
            await asyncio.sleep(self.retry_interval_seconds)

    async def stop(self):
        if self._retry_task is not None:
            self._retry_task.cancel()
            self._retry_task = None
        if self.connection:
            await self.connection.close()
            self.connection = None
            self.channel = None
            logger.info("RabbitMQ Connection stopped")

    async def publish_event(self, event_type: str, payload: dict[str, Any]):
        if not self.channel:
            logger.warning("RabbitMQ Channel not available. Skipping event: %s", event_type)
            return

        event = {
            "type": event_type,
            "payload": payload,
        }
        try:
            await self.channel.default_exchange.publish(
                aio_pika.Message(
                    body=json.dumps(event).encode("utf-8"),
                    delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                ),
                routing_key=settings.automation_events_queue,
            )
        except Exception as e:
            logger.error("Failed to publish event %s to RabbitMQ: %s", event_type, e)


rabbitmq_manager = RabbitMQManager()
