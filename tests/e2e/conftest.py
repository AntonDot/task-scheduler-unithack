import os

import httpx
import pytest

CORE_API_URL = os.getenv("E2E_CORE_API_URL", "http://localhost:8000")
ML_WORKER_URL = os.getenv("E2E_ML_WORKER_URL", "http://localhost:8001")
REVIEW_BOARD_URL = os.getenv("E2E_REVIEW_BOARD_URL", "http://localhost:8002")
WEBHOOK_API_KEY = os.getenv("E2E_WEBHOOK_API_KEY", "dev-webhook-key")

OWNER_EMAIL = "d.morozov@victorygroup.ru"
ASSIGNEE_ONEGIN_EMAIL = "a.kozlova@victorygroup.ru"
ASSIGNEE_BEREG_EMAIL = "i.petrov@victorygroup.ru"


def _health_ok(client: httpx.Client, url: str) -> bool:
    try:
        return client.get(f"{url}/health", timeout=2).status_code == 200
    except httpx.HTTPError:
        return False


@pytest.fixture(scope="session")
def live_services():
    with httpx.Client() as client:
        if not _health_ok(client, CORE_API_URL):
            pytest.skip("Core API is not running at " + CORE_API_URL)
        return {
            "core": _health_ok(client, CORE_API_URL),
            "ml": _health_ok(client, ML_WORKER_URL),
            "review": _health_ok(client, REVIEW_BOARD_URL),
        }


@pytest.fixture
def client(live_services):
    with httpx.Client(timeout=10) as c:
        yield c


def _get_token(client: httpx.Client, email: str) -> str:
    resp = client.post(f"{CORE_API_URL}/api/v1/auth/token", json={"email": email})
    resp.raise_for_status()
    return resp.json()["access_token"]


@pytest.fixture
def owner_headers(client):
    return {"Authorization": f"Bearer {_get_token(client, OWNER_EMAIL)}"}


@pytest.fixture
def assignee_onegin_headers(client):
    return {"Authorization": f"Bearer {_get_token(client, ASSIGNEE_ONEGIN_EMAIL)}"}


@pytest.fixture
def assignee_bereg_headers(client):
    return {"Authorization": f"Bearer {_get_token(client, ASSIGNEE_BEREG_EMAIL)}"}


@pytest.fixture
def owner_projects(client, owner_headers):
    resp = client.get(f"{CORE_API_URL}/api/v1/projects", headers=owner_headers)
    resp.raise_for_status()
    return resp.json()


@pytest.fixture
def onegin_project(owner_projects):
    proj = next((p for p in owner_projects if p["slug"] == "onegin-park"), None)
    if proj is None:
        pytest.skip("Project onegin-park not found")
    return proj


@pytest.fixture
def bereg_project(owner_projects):
    proj = next((p for p in owner_projects if p["slug"] == "zhk-bereg"), None)
    if proj is None:
        pytest.skip("Project zhk-bereg not found")
    return proj


# Board columns replaced task statuses: a task's status is derived from the order of its
# column (0 TODO, 1 IN_PROGRESS, 2 REVIEW, 3 DONE in the seeded projects).
STATUS_ORDER = {"TODO": 0, "IN_PROGRESS": 1, "REVIEW": 2, "DONE": 3}


def column_ids(client: httpx.Client, headers: dict, project_id: int) -> dict[str, int]:
    """Map status name → id of the project's column with the matching order."""
    resp = client.get(f"{CORE_API_URL}/api/v1/projects/{project_id}/columns", headers=headers)
    resp.raise_for_status()
    by_order = {c["order"]: c["id"] for c in resp.json()}
    return {status: by_order[order] for status, order in STATUS_ORDER.items()}


def move_task(client: httpx.Client, headers: dict, task_id: int, column_id: int) -> httpx.Response:
    return client.patch(
        f"{CORE_API_URL}/api/v1/tasks/{task_id}/column",
        json={"column_id": column_id},
        headers=headers,
    )


@pytest.fixture
def onegin_columns(client, owner_headers, onegin_project):
    return column_ids(client, owner_headers, onegin_project["id"])
