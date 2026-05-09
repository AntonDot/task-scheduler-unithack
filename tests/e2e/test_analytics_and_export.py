import uuid

import pytest

from tests.e2e.conftest import CORE_API_URL


def skip_if_not_implemented(client, url, headers):
    resp = client.get(url, headers=headers)
    if resp.status_code == 404:
        pytest.skip(f"Endpoint not implemented: {url}")


@pytest.mark.e2e
class TestAnalytics:
    def test_analytics_returns_status_breakdown(self, client, owner_headers, onegin_project):
        pid = onegin_project["id"]
        url = f"{CORE_API_URL}/api/v1/projects/{pid}/analytics"
        skip_if_not_implemented(client, url, owner_headers)

        resp = client.get(url, headers=owner_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "by_status" in data

    def test_analytics_returns_assignee_load(self, client, owner_headers, onegin_project):
        pid = onegin_project["id"]
        url = f"{CORE_API_URL}/api/v1/projects/{pid}/analytics"
        skip_if_not_implemented(client, url, owner_headers)

        resp = client.get(url, headers=owner_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "assignee_load" in data

    def test_analytics_requires_project_access(
        self, client, owner_headers, assignee_bereg_headers, onegin_project
    ):
        pid = onegin_project["id"]
        url = f"{CORE_API_URL}/api/v1/projects/{pid}/analytics"
        skip_if_not_implemented(client, url, owner_headers)

        resp = client.get(url, headers=assignee_bereg_headers)
        assert resp.status_code == 403

    def test_analytics_accessible_by_assignee_of_project(
        self, client, assignee_onegin_headers, onegin_project, owner_headers
    ):
        pid = onegin_project["id"]
        url = f"{CORE_API_URL}/api/v1/projects/{pid}/analytics"
        skip_if_not_implemented(client, url, owner_headers)

        resp = client.get(url, headers=assignee_onegin_headers)
        assert resp.status_code == 200

    def test_analytics_unauthenticated(self, client, owner_headers, onegin_project):
        pid = onegin_project["id"]
        url = f"{CORE_API_URL}/api/v1/projects/{pid}/analytics"
        skip_if_not_implemented(client, url, owner_headers)

        resp = client.get(url)
        assert resp.status_code in (401, 403)


@pytest.mark.e2e
class TestExport:
    def test_export_csv_downloads_file(self, client, owner_headers, onegin_project):
        pid = onegin_project["id"]
        url = f"{CORE_API_URL}/api/v1/projects/{pid}/export?format=csv"
        skip_if_not_implemented(client, url, owner_headers)

        resp = client.get(url, headers=owner_headers)
        assert resp.status_code == 200
        content_type = resp.headers.get("content-type", "")
        assert "csv" in content_type or "text/" in content_type

    def test_export_csv_contains_task_data(self, client, owner_headers, onegin_project):
        pid = onegin_project["id"]

        marker = f"Export test {uuid.uuid4().hex[:8]}"
        client.post(
            f"{CORE_API_URL}/api/v1/projects/{pid}/tasks",
            json={"title": marker, "urgency": "LOW"},
            headers=owner_headers,
        )

        url = f"{CORE_API_URL}/api/v1/projects/{pid}/export?format=csv"
        skip_if_not_implemented(client, url, owner_headers)

        resp = client.get(url, headers=owner_headers)
        assert resp.status_code == 200
        body = resp.text
        assert marker in body

    def test_export_requires_project_access(
        self, client, owner_headers, assignee_bereg_headers, onegin_project
    ):
        pid = onegin_project["id"]
        url = f"{CORE_API_URL}/api/v1/projects/{pid}/export?format=csv"
        skip_if_not_implemented(client, url, owner_headers)

        resp = client.get(url, headers=assignee_bereg_headers)
        assert resp.status_code == 403

    def test_export_csv_has_header_row(self, client, owner_headers, onegin_project):
        pid = onegin_project["id"]
        url = f"{CORE_API_URL}/api/v1/projects/{pid}/export?format=csv"
        skip_if_not_implemented(client, url, owner_headers)

        resp = client.get(url, headers=owner_headers)
        assert resp.status_code == 200
        lines = resp.text.strip().split("\n")
        assert len(lines) >= 1
        header = lines[0].lower()
        assert "title" in header or "id" in header

    def test_export_unauthenticated(self, client, owner_headers, onegin_project):
        pid = onegin_project["id"]
        url = f"{CORE_API_URL}/api/v1/projects/{pid}/export?format=csv"
        skip_if_not_implemented(client, url, owner_headers)

        resp = client.get(url)
        assert resp.status_code in (401, 403)
