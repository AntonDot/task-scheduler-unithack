import json
import logging
from typing import Any

import aio_pika

from app.config import settings

logger = logging.getLogger(__name__)

class RabbitMQManager:
    def __init__(self):
        self.connection: aio_pika.abc.AbstractConnection | None = None
        self.channel: aio_pika.abc.AbstractChannel | None = None

    async def start(self):
        if self.connection:
            return
        
        try:
            self.connection = await aio_pika.connect_robust(settings.rabbitmq_url)
            self.channel = await self.connection.channel()
            # Ensure the queue exists
            await self.channel.declare_queue(settings.automation_events_queue, durable=True)
            logger.info("RabbitMQ Connection started at %s", settings.rabbitmq_url)
        except Exception as e:
            logger.error("Failed to start RabbitMQ Connection: %s", e)
            self.connection = None

    async def stop(self):
        if self.connection:
            await self.connection.close()
            self.connection = None
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
