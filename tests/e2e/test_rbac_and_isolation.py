import os

import httpx
import pytest

CORE_API_URL = os.getenv("E2E_CORE_API_URL", "http://localhost:8000")

# Emails from seed data
USER_A = "d.morozov@victorygroup.ru"  # Owner of onegin-park and zhk-bereg
USER_B = "a.kozlova@victorygroup.ru"  # Assignee of onegin-park
USER_C = "i.petrov@victorygroup.ru"   # Assignee of zhk-bereg

def _health_ok(client: httpx.Client, base_url: str) -> bool:
    try:
        resp = client.get(f"{base_url}/health", timeout=2)
        return resp.status_code == 200
    except httpx.HTTPError:
        return False

def _get_token(client, email):
    resp = client.post(f"{CORE_API_URL}/api/v1/auth/token", json={"email": email})
    resp.raise_for_status()
    return resp.json()["access_token"]

@pytest.mark.e2e
def test_project_isolation_and_rbac():
    with httpx.Client() as client:
        if not _health_ok(client, CORE_API_URL):
            pytest.skip("Core API is not running")

        token_a = _get_token(client, USER_A)
        token_b = _get_token(client, USER_B)
        token_c = _get_token(client, USER_C)

        headers_a = {"Authorization": f"Bearer {token_a}"}
        headers_b = {"Authorization": f"Bearer {token_b}"}
        headers_c = {"Authorization": f"Bearer {token_c}"}

        # 1. User A (Owner) sees all projects they own
        projects_a = client.get(f"{CORE_API_URL}/api/v1/projects", headers=headers_a).json()
        assert any(p["slug"] == "onegin-park" for p in projects_a)
        assert any(p["slug"] == "zhk-bereg" for p in projects_a)

        # 2. User B (Assignee in Onegin) sees only Onegin
        projects_b = client.get(f"{CORE_API_URL}/api/v1/projects", headers=headers_b).json()
        assert any(p["slug"] == "onegin-park" for p in projects_b)
        assert not any(p["slug"] == "zhk-bereg" for p in projects_b)

        # 3. User C (Assignee in Bereg) sees only Bereg
        projects_c = client.get(f"{CORE_API_URL}/api/v1/projects", headers=headers_c).json()
        assert not any(p["slug"] == "onegin-park" for p in projects_c)
        assert any(p["slug"] == "zhk-bereg" for p in projects_c)

        # 4. User B cannot access Bereg tasks
        bereg_project = next(p for p in projects_a if p["slug"] == "zhk-bereg")
        resp = client.get(f"{CORE_API_URL}/api/v1/projects/{bereg_project['id']}/tasks", headers=headers_b)
        assert resp.status_code == 403

        # 5. User B cannot create task in Bereg
        resp = client.post(
            f"{CORE_API_URL}/api/v1/projects/{bereg_project['id']}/tasks",
            json={"title": "Hacker task", "urgency": "URGENT"},
            headers=headers_b
        )
        assert resp.status_code == 403

        # 6. User B (Assignee) cannot approve drafts in Onegin
        onegin_project = next(p for p in projects_b if p["slug"] == "onegin-park")
        # Create a draft as owner
        draft_resp = client.post(
            f"{CORE_API_URL}/api/v1/projects/{onegin_project['id']}/tasks",
            json={"title": "Draft for B to try", "status": "AI_DRAFT", "urgency": "LOW"},
            headers=headers_a
        )
        draft_id = draft_resp.json()["id"]

        approve_resp = client.post(f"{CORE_API_URL}/api/v1/tasks/{draft_id}/approve", headers=headers_b)
        assert approve_resp.status_code == 403
