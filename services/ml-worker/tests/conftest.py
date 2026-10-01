import os

# Required settings are read from the environment at import time (12-factor III);
# tests provide their own values before the app is imported.
os.environ.setdefault("ML_CORE_API_URL", "http://core-api.test")
os.environ.setdefault("ML_CORE_API_TOKEN", "test-service-token")
os.environ.setdefault("ML_WEBHOOK_API_KEY", "dev-webhook-key")

import pytest

from app.config import settings


@pytest.fixture(autouse=True)
def _force_mock_llm():
    original = settings.use_mock_llm
    settings.use_mock_llm = True
    yield
    settings.use_mock_llm = original
