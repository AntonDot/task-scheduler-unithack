import pytest

from .conftest import CORE_API_URL


@pytest.mark.e2e
class TestAuth:
    def test_get_token_for_valid_email(self, client):
        resp = client.post(
            f"{CORE_API_URL}/api/v1/auth/token",
            json={"email": "d.morozov@victorygroup.ru"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_get_token_for_invalid_email(self, client):
        resp = client.post(
            f"{CORE_API_URL}/api/v1/auth/token", json={"email": "nobody@example.com"}
        )
        assert resp.status_code == 404

    def test_me_endpoint(self, client, owner_headers):
        resp = client.get(f"{CORE_API_URL}/api/v1/me", headers=owner_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == "d.morozov@victorygroup.ru"
        assert data["full_name"] == "Дмитрий Морозов"

    def test_unauthenticated_request_rejected(self, client):
        resp = client.get(f"{CORE_API_URL}/api/v1/projects")
        assert resp.status_code in (401, 403)


@pytest.mark.e2e
class TestManualTaskLifecycle:
    def test_create_and_move_through_all_statuses(
        self, client, owner_headers, onegin_project
    ):
        pid = onegin_project["id"]

        resp = client.post(
            f"{CORE_API_URL}/api/v1/projects/{pid}/tasks",
            json={
                "title": "E2E lifecycle task",
                "description": "Full flow test",
                "urgency": "MEDIUM",
            },
            headers=owner_headers,
        )
        assert resp.status_code == 201
        task = resp.json()
        task_id = task["id"]
        assert task["status"] == "TODO"

        resp = client.patch(
            f"{CORE_API_URL}/api/v1/tasks/{task_id}/status",
            json={"status": "IN_PROGRESS"},
            headers=owner_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "IN_PROGRESS"

        resp = client.patch(
            f"{CORE_API_URL}/api/v1/tasks/{task_id}/status",
            json={"status": "REVIEW"},
            headers=owner_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "REVIEW"

        resp = client.patch(
            f"{CORE_API_URL}/api/v1/tasks/{task_id}/status",
            json={"status": "DONE"},
            headers=owner_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "DONE"

    def test_reopen_done_task(self, client, owner_headers, onegin_project):
        pid = onegin_project["id"]
        resp = client.post(
            f"{CORE_API_URL}/api/v1/projects/{pid}/tasks",
            json={"title": "E2E reopen task", "urgency": "LOW"},
            headers=owner_headers,
        )
        task_id = resp.json()["id"]

        for status in ["IN_PROGRESS", "REVIEW", "DONE"]:
            client.patch(
                f"{CORE_API_URL}/api/v1/tasks/{task_id}/status",
                json={"status": status},
                headers=owner_headers,
            )

        resp = client.patch(
            f"{CORE_API_URL}/api/v1/tasks/{task_id}/status",
            json={"status": "TODO"},
            headers=owner_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "TODO"

    def test_invalid_transition_rejected(self, client, owner_headers, onegin_project):
        pid = onegin_project["id"]
        resp = client.post(
            f"{CORE_API_URL}/api/v1/projects/{pid}/tasks",
            json={"title": "E2E invalid transition", "urgency": "LOW"},
            headers=owner_headers,
        )
        task_id = resp.json()["id"]

        resp = client.patch(
            f"{CORE_API_URL}/api/v1/tasks/{task_id}/status",
            json={"status": "DONE"},
            headers=owner_headers,
        )
        assert resp.status_code == 422


@pytest.mark.e2e
class TestAIDraftFlow:
    def test_owner_creates_and_approves_draft(
        self, client, owner_headers, onegin_project
    ):
        pid = onegin_project["id"]
        resp = client.post(
            f"{CORE_API_URL}/api/v1/projects/{pid}/tasks",
            json={"title": "E2E draft", "status": "AI_DRAFT", "urgency": "LOW"},
            headers=owner_headers,
        )
        assert resp.status_code == 201
        task_id = resp.json()["id"]
        assert resp.json()["status"] == "AI_DRAFT"

        resp = client.post(
            f"{CORE_API_URL}/api/v1/tasks/{task_id}/approve", headers=owner_headers
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "TODO"

    def test_owner_discards_draft(self, client, owner_headers, onegin_project):
        pid = onegin_project["id"]
        resp = client.post(
            f"{CORE_API_URL}/api/v1/projects/{pid}/tasks",
            json={"title": "E2E discard draft", "status": "AI_DRAFT", "urgency": "LOW"},
            headers=owner_headers,
        )
        task_id = resp.json()["id"]

        resp = client.delete(
            f"{CORE_API_URL}/api/v1/tasks/{task_id}", headers=owner_headers
        )
        assert resp.status_code == 204

        resp = client.get(
            f"{CORE_API_URL}/api/v1/tasks/{task_id}", headers=owner_headers
        )
        assert resp.status_code == 404

    def test_cannot_approve_non_draft(self, client, owner_headers, onegin_project):
        pid = onegin_project["id"]
        resp = client.post(
            f"{CORE_API_URL}/api/v1/projects/{pid}/tasks",
            json={"title": "E2E not a draft", "status": "TODO", "urgency": "LOW"},
            headers=owner_headers,
        )
        task_id = resp.json()["id"]

        resp = client.post(
            f"{CORE_API_URL}/api/v1/tasks/{task_id}/approve", headers=owner_headers
        )
        assert resp.status_code == 422

    def test_owner_can_delete_non_draft(self, client, owner_headers, onegin_project):
        pid = onegin_project["id"]
        resp = client.post(
            f"{CORE_API_URL}/api/v1/projects/{pid}/tasks",
            json={"title": "E2E non-draft delete", "status": "TODO", "urgency": "LOW"},
            headers=owner_headers,
        )
        task_id = resp.json()["id"]

        resp = client.delete(
            f"{CORE_API_URL}/api/v1/tasks/{task_id}", headers=owner_headers
        )
        assert resp.status_code == 204


@pytest.mark.e2e
class TestTaskUpdate:
    def test_owner_can_reassign(self, client, owner_headers, onegin_project):
        pid = onegin_project["id"]

        members = client.get(
            f"{CORE_API_URL}/api/v1/projects/{pid}/members", headers=owner_headers
        ).json()
        assignee = next((m for m in members if m["role"] == "ASSIGNEE"), None)
        assert assignee is not None

        resp = client.post(
            f"{CORE_API_URL}/api/v1/projects/{pid}/tasks",
            json={"title": "E2E reassign test", "urgency": "LOW"},
            headers=owner_headers,
        )
        task_id = resp.json()["id"]

        resp = client.patch(
            f"{CORE_API_URL}/api/v1/tasks/{task_id}",
            json={"assignee_id": assignee["id"]},
            headers=owner_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["assignee_id"] == assignee["id"]

    def test_owner_can_update_title(self, client, owner_headers, onegin_project):
        pid = onegin_project["id"]
        resp = client.post(
            f"{CORE_API_URL}/api/v1/projects/{pid}/tasks",
            json={"title": "Original title", "urgency": "LOW"},
            headers=owner_headers,
        )
        task_id = resp.json()["id"]

        resp = client.patch(
            f"{CORE_API_URL}/api/v1/tasks/{task_id}",
            json={"title": "Updated title"},
            headers=owner_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["title"] == "Updated title"


@pytest.mark.e2e
class TestProjectMembers:
    def test_list_members(self, client, owner_headers, onegin_project):
        pid = onegin_project["id"]
        resp = client.get(
            f"{CORE_API_URL}/api/v1/projects/{pid}/members", headers=owner_headers
        )
        assert resp.status_code == 200
        members = resp.json()
        assert len(members) >= 2
        roles = {m["role"] for m in members}
        assert "OWNER" in roles
        assert "ASSIGNEE" in roles

    def test_assignee_can_also_list_members(
        self, client, assignee_onegin_headers, onegin_project
    ):
        pid = onegin_project["id"]
        resp = client.get(
            f"{CORE_API_URL}/api/v1/projects/{pid}/members",
            headers=assignee_onegin_headers,
        )
        assert resp.status_code == 200

    def test_assignee_filter(self, client, owner_headers, onegin_project):
        pid = onegin_project["id"]
        members = client.get(
            f"{CORE_API_URL}/api/v1/projects/{pid}/members", headers=owner_headers
        ).json()
        assignee = next((m for m in members if m["role"] == "ASSIGNEE"), None)
        if assignee is None:
            pytest.skip("No assignee in project")

        resp = client.get(
            f"{CORE_API_URL}/api/v1/projects/{pid}/tasks?assignee_id={assignee['id']}",
            headers=owner_headers,
        )
        assert resp.status_code == 200
        tasks = resp.json()
        for task in tasks:
            assert task["assignee_id"] == assignee["id"]
