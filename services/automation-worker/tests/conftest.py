import os

# Required settings are read from the environment at import time (12-factor III);
# tests provide their own values before the worker module is imported.
os.environ.setdefault("AUTOMATION_DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/test")
os.environ.setdefault("AUTOMATION_RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")
os.environ.setdefault("AUTOMATION_CORE_API_URL", "http://core-api.test")
os.environ.setdefault("AUTOMATION_SERVICE_TOKEN", "test-service-token")
