import time
import uuid
import pytest
from .conftest import CORE_API_URL

SERVICE_TOKEN = "dev-service-token"

def _wait_for_notification(client, headers, predicate, timeout=10, interval=0.5):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        resp = client.get(f"{CORE_API_URL}/api/v1/notifications", headers=headers)
        if resp.status_code == 200:
            items = resp.json()
            if predicate(items):
                return items
            # Debug: print last 3 notifications
            print(f"Current notifs: {[ (n['task_id'], n['body']) for n in items[:3] ]}")
        time.sleep(interval)
    return None

def _get_columns(client, project_id, headers):
    resp = client.get(f"{CORE_API_URL}/api/v1/projects/{project_id}/columns", headers=headers)
    resp.raise_for_status()
    return resp.json()

@pytest.mark.e2e
class TestAutomationFixes:
    def test_task_updated_triggers_notification_when_column_matches(
        self, client, owner_headers, assignee_onegin_headers, onegin_project
    ):
        """
        Scenario: Trigger on task_updated, Condition column_equals X.
        When task TITLE is updated (not column), automation should still trigger.
        """
        pid = onegin_project["id"]
        columns = _get_columns(client, pid, owner_headers)
        # Use the LAST column (e.g. Done) to avoid interference from default "move to todo" automations
        col_id = columns[-1]["id"]
        col_name = columns[-1]["name"]

        # 1. Create automation
        notif_message = f"Task updated in {col_name}"
        body = {
            "name": f"Repro automation {uuid.uuid4().hex[:6]}",
            "project_id": pid,
            "is_active": True,
            "config": {
                "trigger": {"type": "task_updated", "filters": {}},
                "conditions": [{"type": "column_equals", "params": {"column_id": col_id}}],
                "actions": [{"type": "send_notification", "params": {"message": notif_message}}],
            },
        }
        auto_resp = client.post(f"{CORE_API_URL}/api/v1/automations?project_id={pid}", json=body, headers=owner_headers)
        auto_id = auto_resp.json()["id"]

        try:
            # 2. Create a task directly in that column
            task_resp = client.post(
                f"{CORE_API_URL}/api/v1/projects/{pid}/tasks",
                json={"title": f"Repro Task {uuid.uuid4().hex[:4]}", "urgency": "LOW", "column_id": col_id},
                headers=owner_headers,
            )
            task_id = task_resp.json()["id"]

            # 3. Update task TITLE (this triggers task_updated event)
            # The column_id is NOT in the 'changes' payload.
            # Our fixed worker should fetch it from DB and trigger the automation.
            client.patch(f"{CORE_API_URL}/api/v1/tasks/{task_id}", json={"title": "Triggering Update"}, headers=owner_headers)

            # 4. Wait for notification
            result = _wait_for_notification(
                client,
                owner_headers,
                lambda items: any(n["task_id"] == task_id and notif_message in n["body"] for n in items),
                timeout=12
            )
            assert result is not None, f"Notification for task {task_id} did not appear after task update. Check worker logs."
        finally:
            client.delete(f"{CORE_API_URL}/api/v1/automations/{auto_id}", headers=owner_headers)

    def test_notification_appears_for_unassigned_task(
        self, client, owner_headers, onegin_project
    ):
        """
        Scenario: Action send_notification on a task with NO assignee.
        It should still produce an AuditLog entry and show up in the project owner's bell.
        """
        pid = onegin_project["id"]
        columns = _get_columns(client, pid, owner_headers)
        col_id = columns[0]["id"]

        # 1. Create automation for task creation
        notif_message = "New unassigned task created"
        body = {
            "name": f"Unassigned test {uuid.uuid4().hex[:6]}",
            "project_id": pid,
            "is_active": True,
            "config": {
                "trigger": {"type": "task_created", "filters": {}},
                "conditions": [],
                "actions": [{"type": "send_notification", "params": {"message": notif_message}}],
            },
        }
        auto_resp = client.post(f"{CORE_API_URL}/api/v1/automations?project_id={pid}", json=body, headers=owner_headers)
        auto_id = auto_resp.json()["id"]

        try:
            # 2. Create a task with NO assignee
            task_resp = client.post(
                f"{CORE_API_URL}/api/v1/projects/{pid}/tasks",
                json={"title": "Unassigned Task", "urgency": "LOW", "column_id": col_id, "assignee_id": None},
                headers=owner_headers,
            )
            task_id = task_resp.json()["id"]

            # 3. Wait for notification in owner's bell
            # (Owner is always interested in project tasks, but let's check if the AuditLog is created)
            result = _wait_for_notification(
                client,
                owner_headers,
                lambda items: any(n["task_id"] == task_id and notif_message in n["body"] for n in items),
                timeout=12
            )
            assert result is not None, "Notification for unassigned task did not appear in UI bell"
        finally:
            client.delete(f"{CORE_API_URL}/api/v1/automations/{auto_id}", headers=owner_headers)
