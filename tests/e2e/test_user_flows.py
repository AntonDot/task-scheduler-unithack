import os
import pytest
import httpx

CORE_API_URL = os.getenv("E2E_CORE_API_URL", "http://localhost:8000")
DEMO_EMAIL = os.getenv("E2E_EMAIL", "d.morozov@victorygroup.ru")

def _health_ok(client: httpx.Client, base_url: str) -> bool:
    try:
        resp = client.get(f"{base_url}/health", timeout=2)
        return resp.status_code == 200
    except httpx.HTTPError:
        return False

@pytest.mark.e2e
def test_full_user_flow_manual_task_lifecycle():
    with httpx.Client() as client:
        if not _health_ok(client, CORE_API_URL):
            pytest.skip("Core API is not running")

        # 1. Login
        token_resp = client.post(f"{CORE_API_URL}/api/v1/auth/token", json={"email": DEMO_EMAIL})
        token_resp.raise_for_status()
        token = token_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Get projects
        projects_resp = client.get(f"{CORE_API_URL}/api/v1/projects", headers=headers)
        projects_resp.raise_for_status()
        projects = projects_resp.json()
        assert len(projects) > 0
        project_id = projects[0]["id"]

        # 3. Create manual task
        new_task_resp = client.post(
            f"{CORE_API_URL}/api/v1/projects/{project_id}/tasks",
            json={"title": "Manual Test Task", "description": "Created during E2E flow", "urgency": "MEDIUM"},
            headers=headers
        )
        assert new_task_resp.status_code == 201
        task_id = new_task_resp.json()["id"]

        # 4. Move to IN_PROGRESS
        move_resp = client.patch(
            f"{CORE_API_URL}/api/v1/tasks/{task_id}/status",
            json={"status": "IN_PROGRESS"},
            headers=headers
        )
        assert move_resp.status_code == 200
        assert move_resp.json()["status"] == "IN_PROGRESS"

        # 5. Move to REVIEW
        move_resp = client.patch(
            f"{CORE_API_URL}/api/v1/tasks/{task_id}/status",
            json={"status": "REVIEW"},
            headers=headers
        )
        assert move_resp.status_code == 200
        assert move_resp.json()["status"] == "REVIEW"

        # 6. Move to DONE (Owner can do this)
        move_resp = client.patch(
            f"{CORE_API_URL}/api/v1/tasks/{task_id}/status",
            json={"status": "DONE"},
            headers=headers
        )
        assert move_resp.status_code == 200
        assert move_resp.json()["status"] == "DONE"

@pytest.mark.e2e
def test_owner_approves_ai_draft():
    with httpx.Client() as client:
        if not _health_ok(client, CORE_API_URL):
            pytest.skip("Core API is not running")

        token_resp = client.post(f"{CORE_API_URL}/api/v1/auth/token", json={"email": DEMO_EMAIL})
        token = token_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        projects_resp = client.get(f"{CORE_API_URL}/api/v1/projects", headers=headers)
        project_id = projects_resp.json()[0]["id"]

        # Create AI_DRAFT task
        draft_resp = client.post(
            f"{CORE_API_URL}/api/v1/projects/{project_id}/tasks",
            json={"title": "Draft Task", "status": "AI_DRAFT", "urgency": "LOW"},
            headers=headers
        )
        task_id = draft_resp.json()["id"]

        # Approve it
        approve_resp = client.post(f"{CORE_API_URL}/api/v1/tasks/{task_id}/approve", headers=headers)
        assert approve_resp.status_code == 200
        assert approve_resp.json()["status"] == "TODO"
