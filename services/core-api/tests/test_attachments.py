import pytest

from app.main import app
from app.storage import ObjectNotFoundError, get_storage


class InMemoryStorage:
    """Stand-in for the S3 backing service: same interface, objects kept in a dict."""

    def __init__(self):
        self.objects: dict[str, tuple[bytes, str]] = {}

    async def put(self, key: str, data: bytes, content_type: str) -> None:
        self.objects[key] = (data, content_type)

    async def get(self, key: str) -> bytes:
        if key not in self.objects:
            raise ObjectNotFoundError(key)
        return self.objects[key][0]

    async def delete(self, key: str) -> None:
        self.objects.pop(key, None)


@pytest.fixture
def storage(client):
    fake = InMemoryStorage()
    app.dependency_overrides[get_storage] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_storage, None)


# ── upload ──────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_upload_attachment(client, seed_data, get_token, storage):
    sd = seed_data
    token = get_token(sd["manager"].id)
    task_id = sd["todo_task"].id

    resp = await client.post(
        f"/api/v1/tasks/{task_id}/attachments",
        files={"file": ("readme.txt", b"hello world", "text/plain")},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 201
    data = resp.json()
    assert data["filename"] == "readme.txt"
    assert data["content_type"] == "text/plain"
    assert data["size_bytes"] == len(b"hello world")
    assert data["task_id"] == task_id
    assert data["user_id"] == sd["manager"].id
    assert "id" in data
    assert "created_at" in data
    # The file went to object storage, keyed by task, not to the local disk
    [(key, (body, content_type))] = storage.objects.items()
    assert key.startswith(f"tasks/{task_id}/")
    assert body == b"hello world"
    assert content_type == "text/plain"


# ── list ────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_attachments(client, seed_data, get_token, storage):
    sd = seed_data
    token = get_token(sd["manager"].id)
    task_id = sd["todo_task"].id

    # Upload two files
    await client.post(
        f"/api/v1/tasks/{task_id}/attachments",
        files={"file": ("a.txt", b"aaa", "text/plain")},
        headers={"Authorization": f"Bearer {token}"},
    )
    await client.post(
        f"/api/v1/tasks/{task_id}/attachments",
        files={"file": ("b.pdf", b"bbb", "application/pdf")},
        headers={"Authorization": f"Bearer {token}"},
    )

    resp = await client.get(
        f"/api/v1/tasks/{task_id}/attachments",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 2
    filenames = {i["filename"] for i in items}
    assert filenames == {"a.txt", "b.pdf"}


# ── download ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_download_attachment(client, seed_data, get_token, storage):
    sd = seed_data
    token = get_token(sd["manager"].id)
    task_id = sd["todo_task"].id

    upload_resp = await client.post(
        f"/api/v1/tasks/{task_id}/attachments",
        files={"file": ("doc.txt", b"file contents here", "text/plain")},
        headers={"Authorization": f"Bearer {token}"},
    )
    attachment_id = upload_resp.json()["id"]

    resp = await client.get(
        f"/api/v1/attachments/{attachment_id}/download",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 200
    assert resp.content == b"file contents here"


# ── delete: owner can delete ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_delete_attachment_owner(client, seed_data, get_token, storage):
    sd = seed_data
    token = get_token(sd["manager"].id)
    task_id = sd["todo_task"].id

    upload_resp = await client.post(
        f"/api/v1/tasks/{task_id}/attachments",
        files={"file": ("temp.txt", b"delete me", "text/plain")},
        headers={"Authorization": f"Bearer {token}"},
    )
    attachment_id = upload_resp.json()["id"]

    resp = await client.delete(
        f"/api/v1/attachments/{attachment_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 204

    # Verify it's gone from the list and from object storage
    list_resp = await client.get(
        f"/api/v1/tasks/{task_id}/attachments",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert len(list_resp.json()) == 0
    assert storage.objects == {}


# ── delete: assignee (non-owner) gets 403 ──────────────────────────────────


@pytest.mark.asyncio
async def test_delete_attachment_assignee_forbidden(client, seed_data, get_token, storage):
    sd = seed_data
    owner_token = get_token(sd["manager"].id)
    assignee_token = get_token(sd["specialist"].id)
    task_id = sd["todo_task"].id

    upload_resp = await client.post(
        f"/api/v1/tasks/{task_id}/attachments",
        files={"file": ("keep.txt", b"keep", "text/plain")},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    attachment_id = upload_resp.json()["id"]

    resp = await client.delete(
        f"/api/v1/attachments/{attachment_id}",
        headers={"Authorization": f"Bearer {assignee_token}"},
    )
    assert resp.status_code == 403


# ── upload requires project access ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_upload_requires_project_access(client, seed_data, get_token, storage):
    sd = seed_data
    outsider_token = get_token(sd["outsider"].id)
    task_id = sd["todo_task"].id

    resp = await client.post(
        f"/api/v1/tasks/{task_id}/attachments",
        files={"file": ("hack.txt", b"nope", "text/plain")},
        headers={"Authorization": f"Bearer {outsider_token}"},
    )
    assert resp.status_code == 403


# ── upload too large ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_upload_too_large(client, seed_data, get_token, storage):
    sd = seed_data
    token = get_token(sd["manager"].id)
    task_id = sd["todo_task"].id

    # 10 MB + 1 byte
    big_content = b"x" * (10 * 1024 * 1024 + 1)
    resp = await client.post(
        f"/api/v1/tasks/{task_id}/attachments",
        files={"file": ("big.bin", big_content, "application/octet-stream")},
        headers={"Authorization": f"Bearer {token}"},
    )
    # 413 Request Entity Too Large (or 422 depending on where check happens)
    assert resp.status_code in (413, 422)


# ── disallowed content type ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_upload_disallowed_type(client, seed_data, get_token, storage):
    sd = seed_data
    token = get_token(sd["manager"].id)
    task_id = sd["todo_task"].id

    resp = await client.post(
        f"/api/v1/tasks/{task_id}/attachments",
        files={"file": ("evil.exe", b"MZ\x90", "application/x-executable")},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_download_missing_object_returns_404(client, seed_data, get_token, storage):
    sd = seed_data
    token = get_token(sd["manager"].id)
    upload_resp = await client.post(
        f"/api/v1/tasks/{sd['todo_task'].id}/attachments",
        files={"file": ("lost.txt", b"gone", "text/plain")},
        headers={"Authorization": f"Bearer {token}"},
    )
    storage.objects.clear()

    resp = await client.get(
        f"/api/v1/attachments/{upload_resp.json()['id']}/download",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404
