import pytest

from app.config import settings


@pytest.fixture(autouse=True)
def _force_mock_llm():
    original = settings.use_mock_llm
    settings.use_mock_llm = True
    yield
    settings.use_mock_llm = original
