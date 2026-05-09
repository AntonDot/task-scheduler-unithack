import csv
import io

import pytest


@pytest.mark.asyncio
class TestExportCSV:
    async def test_export_csv_returns_correct_headers(self, client, seed_data, get_token):
        """CSV export should have the expected column headers."""
        pid = seed_data["project"].id
        manager = seed_data["manager"]
        token = get_token(manager.id)

        resp = await client.get(
            f"/api/v1/projects/{pid}/export",
            params={"format": "csv"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert "text/csv" in resp.headers["content-type"]

        reader = csv.reader(io.StringIO(resp.text))
        headers = next(reader)
        expected = ["id", "title", "status", "urgency", "assignee", "deadline", "created_at", "updated_at"]
        assert headers == expected

    async def test_export_csv_contains_all_tasks(self, client, seed_data, get_token):
        """CSV export should include all tasks in the project."""
        pid = seed_data["project"].id
        manager = seed_data["manager"]
        token = get_token(manager.id)

        resp = await client.get(
            f"/api/v1/projects/{pid}/export",
            params={"format": "csv"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        reader = csv.reader(io.StringIO(resp.text))
        rows = list(reader)
        # 1 header row + 3 data rows from seed_data
        assert len(rows) == 4

    async def test_export_csv_requires_access(self, client, seed_data, get_token):
        """Outsiders should not be able to export project data."""
        pid = seed_data["project"].id
        outsider = seed_data["outsider"]
        token = get_token(outsider.id)

        resp = await client.get(
            f"/api/v1/projects/{pid}/export",
            params={"format": "csv"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403

    async def test_export_csv_outsider_forbidden(self, client, seed_data, get_token):
        """Different framing: outsider gets 403 on export."""
        pid = seed_data["project"].id
        outsider = seed_data["outsider"]
        token = get_token(outsider.id)

        resp = await client.get(
            f"/api/v1/projects/{pid}/export",
            params={"format": "csv"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403
        # Should not return any CSV content
        assert "text/csv" not in resp.headers.get("content-type", "")
