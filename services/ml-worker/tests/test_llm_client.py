import pytest

from app.clients.llm_client import parse_task
from app.config import settings


@pytest.fixture(autouse=True)
def _enable_mock_llm():
    original = settings.use_mock_llm
    settings.use_mock_llm = True
    yield
    settings.use_mock_llm = original


class TestMockLLMClient:
    async def test_mock_short_text_uses_default_title(self):
        """Text with 3 or fewer words should use the default title."""
        result = await parse_task("Fix bug")
        assert result.title == "Новая задача из входящего текста"

    async def test_mock_long_text_uses_first_8_words(self):
        """Text with more than 3 words should use the first 8 words as title."""
        text = "We need to update the landing page design for autumn campaign"
        result = await parse_task(text)
        expected = " ".join(text.split()[:8])
        assert result.title == expected

    async def test_mock_detects_urgency_keyword_ne_rabotaet(self):
        """'не работает' in text should set urgency to HIGH."""
        result = await parse_task("Сайт не работает уже третий день")
        assert result.urgency == "HIGH"

    async def test_mock_detects_urgency_keyword_koshmar(self):
        """'кошмар' in text should set urgency to HIGH."""
        result = await parse_task("Это просто кошмар какой-то сервис")
        assert result.urgency == "HIGH"

    async def test_mock_detects_urgency_keyword_srochno(self):
        """'срочно' in text should set urgency to HIGH."""
        result = await parse_task("Срочно нужно поправить баг в продакшене")
        assert result.urgency == "HIGH"

    async def test_mock_detects_urgency_keyword_uzhas(self):
        """'ужас' in text should set urgency to HIGH."""
        result = await parse_task("Ужас полный, ничего не работает")
        assert result.urgency == "HIGH"

    async def test_mock_default_urgency_medium(self):
        """Regular text without urgency keywords should default to MEDIUM."""
        result = await parse_task("Please update the user documentation for the new feature")
        assert result.urgency == "MEDIUM"

    async def test_mock_description_includes_original_text(self):
        """Description should contain the original input text."""
        text = "We need to refactor the payment module for better performance"
        result = await parse_task(text)
        assert text in result.description
