import sys
import os
import pytest
from unittest.mock import patch, AsyncMock, MagicMock

# Ensure the worker package root is importable when running `pytest tests/`
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from main import _render, _get_field, evaluate_condition, execute_action


def test_render_basic():
    assert _render("Hello {{name}}", {"name": "World"}) == "Hello World"


def test_render_nested():
    assert _render("{{user.name}} - {{user.role}}", {"user": {"name": "Alice", "role": "admin"}}) == "Alice - admin"


def test_render_missing():
    assert _render("Hello {{missing}}", {}) == "Hello "


def test_render_with_spaces():
    assert _render("{{ user.name }}", {"user": {"name": "Bob"}}) == "Bob"


def test_get_field_nested():
    assert _get_field({"a": {"b": {"c": 42}}}, "a.b.c") == 42
    assert _get_field({"a": {}}, "a.b.c") is None


@pytest.mark.asyncio
async def test_numeric_compare_lte():
    ctx = {"event_type": "review_received", "payload": {"review": {"rating": 2}}}
    cond = {"type": "numeric_compare", "params": {"field": "review.rating", "op": "lte", "value": 2}}
    assert await evaluate_condition(cond, ctx) is True

    cond2 = {"type": "numeric_compare", "params": {"field": "review.rating", "op": "lt", "value": 2}}
    assert await evaluate_condition(cond2, ctx) is False


@pytest.mark.asyncio
async def test_numeric_compare_gte_gt_eq():
    ctx = {"event_type": "x", "payload": {"score": 10}}
    assert await evaluate_condition({"type": "numeric_compare", "params": {"field": "score", "op": "gte", "value": 10}}, ctx) is True
    assert await evaluate_condition({"type": "numeric_compare", "params": {"field": "score", "op": "gt", "value": 10}}, ctx) is False
    assert await evaluate_condition({"type": "numeric_compare", "params": {"field": "score", "op": "eq", "value": 10}}, ctx) is True


@pytest.mark.asyncio
async def test_contains_case_insensitive():
    ctx = {"event_type": "x", "payload": {"text": "Hello World"}}
    assert await evaluate_condition({"type": "contains", "params": {"field": "text", "value": "hello"}}, ctx) is True
    assert await evaluate_condition({"type": "contains", "params": {"field": "text", "value": "missing"}}, ctx) is False


@pytest.mark.asyncio
async def test_regex_match():
    ctx = {"event_type": "x", "payload": {"branch": "release/v1.2.3"}}
    assert await evaluate_condition({"type": "regex_match", "params": {"field": "branch", "pattern": "^release/"}}, ctx) is True


@pytest.mark.asyncio
async def test_field_equals_no_db_fallback_for_external_event():
    """field_value_equals must NOT try to SELECT from tasks when event is external."""
    ctx = {"event_type": "github_pr_merged", "payload": {}}
    cond = {"type": "field_value_equals", "params": {"field": "title", "value": "x"}}
    # Should return False (no actual value), NOT crash with DB error
    result = await evaluate_condition(cond, ctx)
    assert result is False


@pytest.mark.asyncio
async def test_create_task_action():
    """create_task action calls the internal endpoint with templated body."""
    ctx = {"event_type": "review_received", "payload": {
        "project_id": 42,
        "review": {"rating": 1, "author": "Bob", "text": "Bad service"},
    }}
    action = {"type": "create_task", "params": {
        "column_id": 5,
        "title": "Complaint from {{review.author}}",
        "description": "{{review.text}}",
        "urgency": "URGENT",
    }}

    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with patch("main.httpx.AsyncClient", return_value=mock_client):
        await execute_action(action, ctx)

    mock_client.post.assert_called_once()
    call = mock_client.post.call_args
    assert "/api/v1/tasks/internal/from-automation" in call[0][0]
    body = call.kwargs["json"]
    assert body["title"] == "Complaint from Bob"
    assert body["description"] == "Bad service"
    assert body["urgency"] == "URGENT"
    assert body["column_id"] == 5
    assert body["project_id"] == 42
