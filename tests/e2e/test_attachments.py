import uuid

import pytest

from .conftest import CORE_API_URL


@pytest.mark.e2e
class TestAttachments:
    def _create_task(self, client, owner_headers, project_id):
        resp = client.post(
            f"{CORE_API_URL}/api/v1/projects/{project_id}/tasks",
            json={"title": f"Attach test {uuid.uuid4().hex[:8]}", "urgency": "LOW"},
            headers=owner_headers,
        )
        assert resp.status_code == 201
        return resp.json()["id"]

    def test_upload_and_list_attachment(self, client, owner_headers, onegin_project):
        task_id = self._create_task(client, owner_headers, onegin_project["id"])

        resp = client.post(
            f"{CORE_API_URL}/api/v1/tasks/{task_id}/attachments",
            files={"file": ("test.txt", b"hello world", "text/plain")},
            headers=owner_headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["filename"] == "test.txt"
        assert data["content_type"] == "text/plain"
        assert data["size_bytes"] == len(b"hello world")

        resp = client.get(
            f"{CORE_API_URL}/api/v1/tasks/{task_id}/attachments",
            headers=owner_headers,
        )
        assert resp.status_code == 200
        items = resp.json()
        assert len(items) >= 1
        assert any(a["filename"] == "test.txt" for a in items)

    def test_download_attachment(self, client, owner_headers, onegin_project):
        task_id = self._create_task(client, owner_headers, onegin_project["id"])

        resp = client.post(
            f"{CORE_API_URL}/api/v1/tasks/{task_id}/attachments",
            files={"file": ("dl.txt", b"download me", "text/plain")},
            headers=owner_headers,
        )
        att_id = resp.json()["id"]

        resp = client.get(
            f"{CORE_API_URL}/api/v1/attachments/{att_id}/download",
            headers=owner_headers,
        )
        assert resp.status_code == 200
        assert resp.content == b"download me"

    def test_delete_attachment_owner(self, client, owner_headers, onegin_project):
        task_id = self._create_task(client, owner_headers, onegin_project["id"])

        resp = client.post(
            f"{CORE_API_URL}/api/v1/tasks/{task_id}/attachments",
            files={"file": ("del.txt", b"delete me", "text/plain")},
            headers=owner_headers,
        )
        att_id = resp.json()["id"]

        resp = client.delete(
            f"{CORE_API_URL}/api/v1/attachments/{att_id}",
            headers=owner_headers,
        )
        assert resp.status_code == 204

        resp = client.get(
            f"{CORE_API_URL}/api/v1/tasks/{task_id}/attachments",
            headers=owner_headers,
        )
        assert all(a["id"] != att_id for a in resp.json())

    def test_delete_attachment_assignee_forbidden(self, client, owner_headers, assignee_onegin_headers, onegin_project):
        task_id = self._create_task(client, owner_headers, onegin_project["id"])

        resp = client.post(
            f"{CORE_API_URL}/api/v1/tasks/{task_id}/attachments",
            files={"file": ("keep.txt", b"keep", "text/plain")},
            headers=owner_headers,
        )
        att_id = resp.json()["id"]

        resp = client.delete(
            f"{CORE_API_URL}/api/v1/attachments/{att_id}",
            headers=assignee_onegin_headers,
        )
        assert resp.status_code == 403

    def test_upload_disallowed_type(self, client, owner_headers, onegin_project):
        task_id = self._create_task(client, owner_headers, onegin_project["id"])

        resp = client.post(
            f"{CORE_API_URL}/api/v1/tasks/{task_id}/attachments",
            files={"file": ("evil.exe", b"MZ", "application/x-executable")},
            headers=owner_headers,
        )
        assert resp.status_code == 422

    def test_attachment_requires_project_access(self, client, owner_headers, assignee_bereg_headers, onegin_project):
        task_id = self._create_task(client, owner_headers, onegin_project["id"])

        resp = client.post(
            f"{CORE_API_URL}/api/v1/tasks/{task_id}/attachments",
            files={"file": ("nope.txt", b"nope", "text/plain")},
            headers=assignee_bereg_headers,
        )
        assert resp.status_code == 403
