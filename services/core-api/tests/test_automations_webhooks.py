"""Tests for automation webhook_token generation and rotation."""

import pytest


@pytest.mark.asyncio
async def test_create_internal_trigger_has_no_webhook_token(client, seed_data, get_token):
    token = get_token(seed_data["manager"].id)
    body = {
        "project_id": seed_data["project"].id,
        "name": "task notifier",
        "config": {
            "trigger": {"type": "task_created"},
            "conditions": [],
            "actions": [],
        },
    }
    resp = await client.post("/api/v1/automations", json=body, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 201, resp.text
    assert resp.json()["webhook_token"] is None


@pytest.mark.asyncio
async def test_create_external_trigger_generates_token(client, seed_data, get_token):
    token = get_token(seed_data["manager"].id)
    body = {
        "project_id": seed_data["project"].id,
        "name": "github notifier",
        "config": {
            "trigger": {"type": "github_event"},
            "conditions": [],
            "actions": [],
        },
    }
    resp = await client.post("/api/v1/automations", json=body, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 201
    wt = resp.json()["webhook_token"]
    assert wt is not None
    assert len(wt) >= 32


@pytest.mark.asyncio
async def test_rotate_token_changes_value(client, seed_data, get_token):
    token = get_token(seed_data["manager"].id)
    body = {
        "project_id": seed_data["project"].id,
        "name": "generic",
        "config": {"trigger": {"type": "webhook_generic"}, "conditions": [], "actions": []},
    }
    created = (await client.post("/api/v1/automations", json=body, headers={"Authorization": f"Bearer {token}"})).json()
    original_token = created["webhook_token"]

    rotated = await client.post(
        f"/api/v1/automations/{created['id']}/rotate-token",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert rotated.status_code == 200
    assert rotated.json()["webhook_token"] != original_token
    assert rotated.json()["webhook_token"] is not None


@pytest.mark.asyncio
async def test_rotate_token_rejects_internal_trigger(client, seed_data, get_token):
    token = get_token(seed_data["manager"].id)
    body = {
        "project_id": seed_data["project"].id,
        "name": "internal",
        "config": {"trigger": {"type": "task_created"}, "conditions": [], "actions": []},
    }
    created = (await client.post("/api/v1/automations", json=body, headers={"Authorization": f"Bearer {token}"})).json()

    resp = await client.post(
        f"/api/v1/automations/{created['id']}/rotate-token",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_catalog_has_external_templates(client, seed_data, get_token):
    token = get_token(seed_data["manager"].id)
    resp = await client.get("/api/v1/automations/catalog", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    categories = [c["category"] for c in resp.json()]
    assert "External: Reviews" in categories
    assert "External: GitHub" in categories
    assert "External: Generic" in categories
