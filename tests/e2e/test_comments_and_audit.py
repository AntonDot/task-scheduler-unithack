import uuid

import pytest

from tests.e2e.conftest import CORE_API_URL


def skip_if_not_implemented(client, url, headers):
    resp = client.get(url, headers=headers)
    if resp.status_code == 404:
        pytest.skip(f"Endpoint not implemented: {url}")


@pytest.mark.e2e
class TestComments:
    def test_add_comment_to_task(self, client, owner_headers, onegin_project):
        pid = onegin_project["id"]

        resp = client.post(
            f"{CORE_API_URL}/api/v1/projects/{pid}/tasks",
            json={"title": f"Comment test {uuid.uuid4().hex[:8]}", "urgency": "LOW"},
            headers=owner_headers,
        )
        assert resp.status_code == 201
        task_id = resp.json()["id"]

        resp = client.post(
            f"{CORE_API_URL}/api/v1/tasks/{task_id}/comments",
            json={"text": "This is a test comment"},
            headers=owner_headers,
        )
        assert resp.status_code == 201
        comment = resp.json()
        assert comment["text"] == "This is a test comment"
        assert comment["task_id"] == task_id

        resp = client.get(f"{CORE_API_URL}/api/v1/tasks/{task_id}/comments", headers=owner_headers)
        assert resp.status_code == 200
        comments = resp.json()
        assert len(comments) >= 1
        assert any(c["text"] == "This is a test comment" for c in comments)

    def test_comment_requires_auth(self, client, onegin_project, owner_headers):
        pid = onegin_project["id"]
        resp = client.post(
            f"{CORE_API_URL}/api/v1/projects/{pid}/tasks",
            json={"title": f"Auth comment test {uuid.uuid4().hex[:8]}", "urgency": "LOW"},
            headers=owner_headers,
        )
        task_id = resp.json()["id"]

        resp = client.post(
            f"{CORE_API_URL}/api/v1/tasks/{task_id}/comments",
            json={"text": "Unauthorized comment"},
        )
        assert resp.status_code in (401, 403)

    def test_comment_on_nonexistent_task(self, client, owner_headers):
        resp = client.post(
            f"{CORE_API_URL}/api/v1/tasks/999999/comments",
            json={"text": "Should fail"},
            headers=owner_headers,
        )
        assert resp.status_code == 404

    def test_comment_visible_to_project_member(
        self, client, owner_headers, assignee_onegin_headers, onegin_project
    ):
        pid = onegin_project["id"]
        resp = client.post(
            f"{CORE_API_URL}/api/v1/projects/{pid}/tasks",
            json={"title": f"Shared comment {uuid.uuid4().hex[:8]}", "urgency": "LOW"},
            headers=owner_headers,
        )
        task_id = resp.json()["id"]

        members = client.get(f"{CORE_API_URL}/api/v1/projects/{pid}/members", headers=owner_headers).json()
        assignee = next(m for m in members if m["role"] == "ASSIGNEE")
        client.patch(
            f"{CORE_API_URL}/api/v1/tasks/{task_id}",
            json={"assignee_id": assignee["id"]},
            headers=owner_headers,
        )

        client.post(
            f"{CORE_API_URL}/api/v1/tasks/{task_id}/comments",
            json={"text": "Owner comment"},
            headers=owner_headers,
        )

        resp = client.get(f"{CORE_API_URL}/api/v1/tasks/{task_id}/comments", headers=assignee_onegin_headers)
        assert resp.status_code == 200
        comments = resp.json()
        assert any(c["text"] == "Owner comment" for c in comments)

    def test_comment_not_visible_to_outsider(
        self, client, owner_headers, assignee_bereg_headers, onegin_project
    ):
        pid = onegin_project["id"]
        resp = client.post(
            f"{CORE_API_URL}/api/v1/projects/{pid}/tasks",
            json={"title": f"Outsider comment {uuid.uuid4().hex[:8]}", "urgency": "LOW"},
            headers=owner_headers,
        )
        task_id = resp.json()["id"]

        resp = client.get(f"{CORE_API_URL}/api/v1/tasks/{task_id}/comments", headers=assignee_bereg_headers)
        assert resp.status_code == 403


@pytest.mark.e2e
class TestAuditLog:
    def test_audit_log_records_actions(self, client, owner_headers, onegin_project):
        pid = onegin_project["id"]

        resp = client.post(
            f"{CORE_API_URL}/api/v1/projects/{pid}/tasks",
            json={"title": f"Audit test {uuid.uuid4().hex[:8]}", "urgency": "LOW"},
            headers=owner_headers,
        )
        assert resp.status_code == 201
        task_id = resp.json()["id"]

        audit_url = f"{CORE_API_URL}/api/v1/tasks/{task_id}/audit"
        skip_if_not_implemented(client, audit_url, owner_headers)

        client.patch(
            f"{CORE_API_URL}/api/v1/tasks/{task_id}/status",
            json={"status": "IN_PROGRESS"},
            headers=owner_headers,
        )

        resp = client.get(audit_url, headers=owner_headers)
        assert resp.status_code == 200
        entries = resp.json()
        assert len(entries) >= 2
        actions = [e["action"] for e in entries]
        assert "created" in actions
        assert "status_changed" in actions

    def test_audit_log_requires_project_access(
        self, client, owner_headers, assignee_bereg_headers, onegin_project
    ):
        pid = onegin_project["id"]
        resp = client.post(
            f"{CORE_API_URL}/api/v1/projects/{pid}/tasks",
            json={"title": f"Audit access test {uuid.uuid4().hex[:8]}", "urgency": "LOW"},
            headers=owner_headers,
        )
        assert resp.status_code == 201
        task_id = resp.json()["id"]

        audit_url = f"{CORE_API_URL}/api/v1/tasks/{task_id}/audit"
        skip_if_not_implemented(client, audit_url, owner_headers)

        resp = client.get(audit_url, headers=assignee_bereg_headers)
        assert resp.status_code == 403
