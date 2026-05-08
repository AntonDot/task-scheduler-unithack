import pytest

from tests.e2e.conftest import CORE_API_URL


@pytest.mark.e2e
class TestProjectIsolation:
    def test_owner_sees_all_their_projects(self, client, owner_headers, owner_projects):
        slugs = {p["slug"] for p in owner_projects}
        assert "onegin-park" in slugs
        assert "zhk-bereg" in slugs

    def test_assignee_only_sees_their_project(self, client, assignee_onegin_headers):
        resp = client.get(f"{CORE_API_URL}/api/v1/projects", headers=assignee_onegin_headers)
        projects = resp.json()
        slugs = {p["slug"] for p in projects}
        assert "onegin-park" in slugs
        assert "zhk-bereg" not in slugs

    def test_assignee_cannot_access_other_project_tasks(self, client, assignee_onegin_headers, bereg_project):
        pid = bereg_project["id"]
        resp = client.get(f"{CORE_API_URL}/api/v1/projects/{pid}/tasks", headers=assignee_onegin_headers)
        assert resp.status_code == 403

    def test_assignee_cannot_create_task_in_other_project(self, client, assignee_onegin_headers, bereg_project):
        pid = bereg_project["id"]
        resp = client.post(
            f"{CORE_API_URL}/api/v1/projects/{pid}/tasks",
            json={"title": "Unauthorized task", "urgency": "LOW"},
            headers=assignee_onegin_headers,
        )
        assert resp.status_code == 403

    def test_assignee_cannot_list_other_project_members(self, client, assignee_onegin_headers, bereg_project):
        pid = bereg_project["id"]
        resp = client.get(f"{CORE_API_URL}/api/v1/projects/{pid}/members", headers=assignee_onegin_headers)
        assert resp.status_code == 403


@pytest.mark.e2e
class TestRBACPermissions:
    def test_assignee_cannot_approve_draft(self, client, owner_headers, assignee_onegin_headers, onegin_project):
        pid = onegin_project["id"]
        resp = client.post(
            f"{CORE_API_URL}/api/v1/projects/{pid}/tasks",
            json={"title": "Draft for RBAC test", "status": "AI_DRAFT", "urgency": "LOW"},
            headers=owner_headers,
        )
        task_id = resp.json()["id"]

        resp = client.post(f"{CORE_API_URL}/api/v1/tasks/{task_id}/approve", headers=assignee_onegin_headers)
        assert resp.status_code == 403

    def test_assignee_cannot_discard_draft(self, client, owner_headers, assignee_onegin_headers, onegin_project):
        pid = onegin_project["id"]
        resp = client.post(
            f"{CORE_API_URL}/api/v1/projects/{pid}/tasks",
            json={"title": "Draft for discard RBAC", "status": "AI_DRAFT", "urgency": "LOW"},
            headers=owner_headers,
        )
        task_id = resp.json()["id"]

        resp = client.delete(f"{CORE_API_URL}/api/v1/tasks/{task_id}", headers=assignee_onegin_headers)
        assert resp.status_code == 403

    def test_assignee_cannot_move_to_done(self, client, owner_headers, assignee_onegin_headers, onegin_project):
        pid = onegin_project["id"]
        members = client.get(f"{CORE_API_URL}/api/v1/projects/{pid}/members", headers=owner_headers).json()
        assignee = next(m for m in members if m["role"] == "ASSIGNEE")

        resp = client.post(
            f"{CORE_API_URL}/api/v1/projects/{pid}/tasks",
            json={"title": "RBAC done test", "urgency": "LOW", "assignee_id": assignee["id"]},
            headers=owner_headers,
        )
        task_id = resp.json()["id"]

        client.patch(
            f"{CORE_API_URL}/api/v1/tasks/{task_id}/status",
            json={"status": "IN_PROGRESS"},
            headers=assignee_onegin_headers,
        )
        client.patch(
            f"{CORE_API_URL}/api/v1/tasks/{task_id}/status",
            json={"status": "REVIEW"},
            headers=assignee_onegin_headers,
        )

        resp = client.patch(
            f"{CORE_API_URL}/api/v1/tasks/{task_id}/status",
            json={"status": "DONE"},
            headers=assignee_onegin_headers,
        )
        assert resp.status_code == 403

    def test_assignee_can_move_to_in_progress(self, client, owner_headers, assignee_onegin_headers, onegin_project):
        pid = onegin_project["id"]
        members = client.get(f"{CORE_API_URL}/api/v1/projects/{pid}/members", headers=owner_headers).json()
        assignee = next(m for m in members if m["role"] == "ASSIGNEE")

        resp = client.post(
            f"{CORE_API_URL}/api/v1/projects/{pid}/tasks",
            json={"title": "Assignee can start", "urgency": "LOW", "assignee_id": assignee["id"]},
            headers=owner_headers,
        )
        task_id = resp.json()["id"]

        resp = client.patch(
            f"{CORE_API_URL}/api/v1/tasks/{task_id}/status",
            json={"status": "IN_PROGRESS"},
            headers=assignee_onegin_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "IN_PROGRESS"

    def test_assignee_cannot_reassign(self, client, owner_headers, assignee_onegin_headers, onegin_project):
        pid = onegin_project["id"]
        members = client.get(f"{CORE_API_URL}/api/v1/projects/{pid}/members", headers=owner_headers).json()
        assignee = next(m for m in members if m["role"] == "ASSIGNEE")

        resp = client.post(
            f"{CORE_API_URL}/api/v1/projects/{pid}/tasks",
            json={"title": "No reassign", "urgency": "LOW", "assignee_id": assignee["id"]},
            headers=owner_headers,
        )
        task_id = resp.json()["id"]

        resp = client.patch(
            f"{CORE_API_URL}/api/v1/tasks/{task_id}",
            json={"assignee_id": 999},
            headers=assignee_onegin_headers,
        )
        assert resp.status_code == 403
