import pytest

from .conftest import CORE_API_URL, move_task


@pytest.mark.e2e
class TestProjectIsolation:
    def test_owner_sees_all_their_projects(self, client, owner_headers, owner_projects):
        slugs = {p["slug"] for p in owner_projects}
        assert "onegin-park" in slugs
        assert "zhk-bereg" in slugs

    def test_assignee_only_sees_their_project(self, client, assignee_onegin_headers):
        resp = client.get(
            f"{CORE_API_URL}/api/v1/projects", headers=assignee_onegin_headers
        )
        projects = resp.json()
        slugs = {p["slug"] for p in projects}
        assert "onegin-park" in slugs
        assert "zhk-bereg" not in slugs

    def test_assignee_cannot_access_other_project_tasks(
        self, client, assignee_onegin_headers, bereg_project
    ):
        pid = bereg_project["id"]
        resp = client.get(
            f"{CORE_API_URL}/api/v1/projects/{pid}/tasks",
            headers=assignee_onegin_headers,
        )
        assert resp.status_code == 403

    def test_assignee_cannot_create_task_in_other_project(
        self, client, assignee_onegin_headers, bereg_project
    ):
        pid = bereg_project["id"]
        resp = client.post(
            f"{CORE_API_URL}/api/v1/projects/{pid}/tasks",
            json={"title": "Unauthorized task", "urgency": "LOW"},
            headers=assignee_onegin_headers,
        )
        assert resp.status_code == 403

    def test_assignee_cannot_list_other_project_members(
        self, client, assignee_onegin_headers, bereg_project
    ):
        pid = bereg_project["id"]
        resp = client.get(
            f"{CORE_API_URL}/api/v1/projects/{pid}/members",
            headers=assignee_onegin_headers,
        )
        assert resp.status_code == 403


@pytest.mark.e2e
class TestRBACPermissions:
    def test_assignee_cannot_move_task_not_assigned_to_them(
        self, client, owner_headers, assignee_onegin_headers, onegin_project, onegin_columns
    ):
        pid = onegin_project["id"]
        resp = client.post(
            f"{CORE_API_URL}/api/v1/projects/{pid}/tasks",
            json={"title": "Not assignee's task", "urgency": "LOW"},
            headers=owner_headers,
        )
        task_id = resp.json()["id"]

        resp = move_task(client, assignee_onegin_headers, task_id, onegin_columns["IN_PROGRESS"])
        assert resp.status_code == 403

    def test_assignee_cannot_discard_draft(
        self, client, owner_headers, assignee_onegin_headers, onegin_project
    ):
        pid = onegin_project["id"]
        resp = client.post(
            f"{CORE_API_URL}/api/v1/projects/{pid}/tasks",
            json={
                "title": "Draft for discard RBAC",
                "status": "AI_DRAFT",
                "urgency": "LOW",
            },
            headers=owner_headers,
        )
        task_id = resp.json()["id"]

        resp = client.delete(
            f"{CORE_API_URL}/api/v1/tasks/{task_id}", headers=assignee_onegin_headers
        )
        assert resp.status_code == 403

    def test_assignee_moves_own_task_through_board(
        self, client, owner_headers, assignee_onegin_headers, onegin_project, onegin_columns
    ):
        pid = onegin_project["id"]
        members = client.get(
            f"{CORE_API_URL}/api/v1/projects/{pid}/members", headers=owner_headers
        ).json()
        assignee = next(m for m in members if m["role"] == "ASSIGNEE")

        resp = client.post(
            f"{CORE_API_URL}/api/v1/projects/{pid}/tasks",
            json={
                "title": "Assignee can start",
                "urgency": "LOW",
                "assignee_id": assignee["id"],
            },
            headers=owner_headers,
        )
        task_id = resp.json()["id"]

        for status in ["IN_PROGRESS", "REVIEW"]:
            resp = move_task(client, assignee_onegin_headers, task_id, onegin_columns[status])
            assert resp.status_code == 200
            assert resp.json()["status"] == status

    def test_assignee_cannot_reassign(
        self, client, owner_headers, assignee_onegin_headers, onegin_project
    ):
        pid = onegin_project["id"]
        members = client.get(
            f"{CORE_API_URL}/api/v1/projects/{pid}/members", headers=owner_headers
        ).json()
        assignee = next(m for m in members if m["role"] == "ASSIGNEE")

        resp = client.post(
            f"{CORE_API_URL}/api/v1/projects/{pid}/tasks",
            json={
                "title": "No reassign",
                "urgency": "LOW",
                "assignee_id": assignee["id"],
            },
            headers=owner_headers,
        )
        task_id = resp.json()["id"]

        resp = client.patch(
            f"{CORE_API_URL}/api/v1/tasks/{task_id}",
            json={"assignee_id": 999},
            headers=assignee_onegin_headers,
        )
        assert resp.status_code == 403
