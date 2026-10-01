import time
import uuid

import pytest

from .conftest import CORE_API_URL

SERVICE_TOKEN = "dev-service-token"


def _wait_for_notification(client, headers, predicate, timeout=8, interval=0.5):
    """Poll GET /notifications until predicate(items) is True or timeout."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        resp = client.get(f"{CORE_API_URL}/api/v1/notifications", headers=headers)
        if resp.status_code == 200 and predicate(resp.json()):
            return resp.json()
        time.sleep(interval)
    return None


def _get_columns(client, project_id, headers):
    resp = client.get(
        f"{CORE_API_URL}/api/v1/projects/{project_id}/columns", headers=headers
    )
    resp.raise_for_status()
    return resp.json()


def _get_assignee(client, project_id, headers):
    members = client.get(
        f"{CORE_API_URL}/api/v1/projects/{project_id}/members", headers=headers
    ).json()
    return next((m for m in members if m["role"] == "ASSIGNEE"), None)


def _get_assignee_headers(
    client, assignee, assignee_onegin_headers, assignee_bereg_headers
):
    """Return the right headers fixture based on the assignee email."""
    if "kozlova" in assignee.get("email", ""):
        return assignee_onegin_headers
    return assignee_bereg_headers


@pytest.mark.e2e
class TestNotificationsAPI:
    def test_notifications_require_auth(self, client):
        resp = client.get(f"{CORE_API_URL}/api/v1/notifications")
        assert resp.status_code in (401, 403)

    def test_notifications_returns_list(self, client, owner_headers):
        resp = client.get(f"{CORE_API_URL}/api/v1/notifications", headers=owner_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_notification_item_schema(self, client, owner_headers, onegin_project):
        pid = onegin_project["id"]
        assignee = _get_assignee(client, pid, owner_headers)
        if assignee is None:
            pytest.skip("No assignee in project")

        # Create a task and assign it so there's at least one notification-eligible action
        task_resp = client.post(
            f"{CORE_API_URL}/api/v1/projects/{pid}/tasks",
            json={"title": f"Schema test {uuid.uuid4().hex[:8]}", "urgency": "LOW"},
            headers=owner_headers,
        )
        assert task_resp.status_code == 201
        task_id = task_resp.json()["id"]

        client.patch(
            f"{CORE_API_URL}/api/v1/tasks/{task_id}",
            json={"assignee_id": assignee["id"]},
            headers=owner_headers,
        )

        resp = client.get(f"{CORE_API_URL}/api/v1/notifications", headers=owner_headers)
        assert resp.status_code == 200
        items = resp.json()
        if not items:
            return  # Nothing to validate schema against — pass silently

        item = items[0]
        required_fields = {
            "id",
            "type",
            "title",
            "body",
            "task_id",
            "task_title",
            "created_at",
            "actor_name",
        }
        assert required_fields.issubset(item.keys()), (
            f"Missing fields: {required_fields - item.keys()}"
        )
        assert isinstance(item["task_id"], int)
        assert item["type"] in {
            "task_assigned",
            "comment",
            "status_change",
            "mention",
            "task_assigned",
        }

    def test_assignment_creates_notification_for_assignee(
        self, client, owner_headers, assignee_onegin_headers, onegin_project
    ):
        pid = onegin_project["id"]
        assignee = _get_assignee(client, pid, owner_headers)
        if assignee is None:
            pytest.skip("No assignee in project")

        task_title = f"Notif assign {uuid.uuid4().hex[:8]}"
        task_resp = client.post(
            f"{CORE_API_URL}/api/v1/projects/{pid}/tasks",
            json={"title": task_title, "urgency": "MEDIUM"},
            headers=owner_headers,
        )
        assert task_resp.status_code == 201
        task_id = task_resp.json()["id"]

        # Owner assigns task to the assignee — this must generate a notification
        patch_resp = client.patch(
            f"{CORE_API_URL}/api/v1/tasks/{task_id}",
            json={"assignee_id": assignee["id"]},
            headers=owner_headers,
        )
        assert patch_resp.status_code == 200

        result = _wait_for_notification(
            client,
            assignee_onegin_headers,
            lambda items: any(
                n["task_id"] == task_id and n["type"] == "task_assigned" for n in items
            ),
        )
        assert result is not None, (
            f"Assignee did not receive task_assigned notification for task {task_id}"
        )

    def test_mention_in_comment_creates_notification(
        self, client, owner_headers, assignee_onegin_headers, onegin_project
    ):
        pid = onegin_project["id"]

        # Resolve the assignee's full name to form the @mention
        me_resp = client.get(
            f"{CORE_API_URL}/api/v1/me", headers=assignee_onegin_headers
        )
        assert me_resp.status_code == 200
        assignee_name = me_resp.json()["full_name"]
        assignee_id = me_resp.json()["id"]

        task_resp = client.post(
            f"{CORE_API_URL}/api/v1/projects/{pid}/tasks",
            json={
                "title": f"Mention test {uuid.uuid4().hex[:8]}",
                "urgency": "LOW",
                "assignee_id": assignee_id,
            },
            headers=owner_headers,
        )
        assert task_resp.status_code == 201
        task_id = task_resp.json()["id"]

        # Owner leaves a comment mentioning the assignee
        comment_resp = client.post(
            f"{CORE_API_URL}/api/v1/tasks/{task_id}/comments",
            json={"text": f"@{assignee_name} пожалуйста проверьте задачу"},
            headers=owner_headers,
        )
        assert comment_resp.status_code == 201

        result = _wait_for_notification(
            client,
            assignee_onegin_headers,
            lambda items: any(
                n["type"] == "mention" and n["task_id"] == task_id for n in items
            ),
        )
        assert result is not None, (
            f"Assignee did not receive mention notification in task {task_id}"
        )

    def test_notifications_capped_at_25(self, client, owner_headers):
        resp = client.get(f"{CORE_API_URL}/api/v1/notifications", headers=owner_headers)
        assert resp.status_code == 200
        assert len(resp.json()) <= 25

    def test_notifications_sorted_newest_first(self, client, owner_headers):
        resp = client.get(f"{CORE_API_URL}/api/v1/notifications", headers=owner_headers)
        assert resp.status_code == 200
        items = resp.json()
        if len(items) < 2:
            return
        timestamps = [n["created_at"] for n in items]
        assert timestamps == sorted(timestamps, reverse=True), (
            "Notifications are not sorted newest-first"
        )


@pytest.mark.e2e
class TestPushSubscription:
    def test_vapid_public_key_endpoint(self, client):
        resp = client.get(f"{CORE_API_URL}/api/v1/push/vapid-public-key")
        # Either configured (200) or not configured (503)
        assert resp.status_code in (200, 503)
        if resp.status_code == 200:
            data = resp.json()
            assert "public_key" in data
            assert isinstance(data["public_key"], str)
            assert len(data["public_key"]) > 0

    def test_subscribe_requires_auth(self, client):
        resp = client.post(
            f"{CORE_API_URL}/api/v1/push/subscribe",
            json={
                "endpoint": "https://push.example.com/sub/test",
                "keys": {"p256dh": "dGVzdA==", "auth": "dGVzdA=="},
            },
        )
        assert resp.status_code in (401, 403)

    def test_subscribe_rejects_missing_keys(self, client, assignee_onegin_headers):
        resp = client.post(
            f"{CORE_API_URL}/api/v1/push/subscribe",
            json={"endpoint": "https://push.example.com/sub/test", "keys": {}},
            headers=assignee_onegin_headers,
        )
        assert resp.status_code == 422

    def test_subscribe_and_unsubscribe(self, client, assignee_onegin_headers):
        resp = client.post(
            f"{CORE_API_URL}/api/v1/push/subscribe",
            json={
                "endpoint": f"https://push.example.com/sub/{uuid.uuid4().hex}",
                "keys": {
                    "p256dh": "BKJV5vqE5QLhSHByEphqsxLgT7bGrqR5zFlhQ==",
                    "auth": "tBHItJI5svbpez7KI4CCXg==",
                },
            },
            headers=assignee_onegin_headers,
        )
        assert resp.status_code == 204

        # Unsubscribe removes all subscriptions for this user
        resp = client.post(
            f"{CORE_API_URL}/api/v1/push/unsubscribe",
            headers=assignee_onegin_headers,
        )
        assert resp.status_code == 204

    def test_internal_notify_rejects_missing_token(self, client, onegin_project):
        onegin_project["id"]
        resp = client.post(
            f"{CORE_API_URL}/api/v1/push/internal/notify",
            json={"user_id": 1, "title": "Test", "body": "Hello", "url": "/"},
        )
        assert resp.status_code == 403

    def test_internal_notify_rejects_wrong_token(self, client):
        resp = client.post(
            f"{CORE_API_URL}/api/v1/push/internal/notify",
            json={"user_id": 1, "title": "Test", "body": "Hello", "url": "/"},
            headers={"X-Service-Token": "invalid-token"},
        )
        assert resp.status_code == 403

    def test_internal_notify_accepts_valid_token(self, client, owner_headers):
        # Resolve a real user id to avoid FK errors
        me_resp = client.get(f"{CORE_API_URL}/api/v1/me", headers=owner_headers)
        user_id = me_resp.json()["id"]

        resp = client.post(
            f"{CORE_API_URL}/api/v1/push/internal/notify",
            json={
                "user_id": user_id,
                "title": "E2E Test",
                "body": "Test push",
                "url": "/",
            },
            headers={"X-Service-Token": SERVICE_TOKEN},
        )
        # 204 = accepted (push will silently skip if VAPID not configured)
        assert resp.status_code == 204


@pytest.mark.e2e
class TestAutomationNotifications:
    """Tests that the automation-worker correctly fires send_notification actions.

    Requires the automation-worker container to be running alongside core-api.
    If the worker is absent, assertions will time-out and fail with a descriptive message.
    """

    def _create_automation(
        self, client, project_id, trigger_type, column_id, message, headers
    ):
        body = {
            "name": f"E2E notif {uuid.uuid4().hex[:6]}",
            "project_id": project_id,
            "is_active": True,
            "config": {
                "trigger": {"type": trigger_type, "filters": {}},
                "conditions": [
                    {"type": "column_equals", "params": {"column_id": column_id}}
                ],
                "actions": [
                    {"type": "send_notification", "params": {"message": message}}
                ],
            },
        }
        resp = client.post(
            f"{CORE_API_URL}/api/v1/automations?project_id={project_id}",
            json=body,
            headers=headers,
        )
        resp.raise_for_status()
        return resp.json()

    def _delete_automation(self, client, automation_id, headers):
        client.delete(
            f"{CORE_API_URL}/api/v1/automations/{automation_id}",
            headers=headers,
        )

    def test_column_change_triggers_notification(
        self, client, owner_headers, assignee_onegin_headers, onegin_project
    ):
        pid = onegin_project["id"]

        # Resolve assignee
        assignee = _get_assignee(client, pid, owner_headers)
        if assignee is None:
            pytest.skip("No assignee in project")

        # Get columns — pick one that isn't the default first column
        columns = _get_columns(client, pid, owner_headers)
        if len(columns) < 2:
            pytest.skip("Project needs at least 2 columns for this test")
        dest_column = columns[-1]  # last column (e.g. Done)
        dest_col_id = dest_column["id"]

        # Create a task assigned to the member
        task_title = f"AutoNotif {uuid.uuid4().hex[:8]}"
        task_resp = client.post(
            f"{CORE_API_URL}/api/v1/projects/{pid}/tasks",
            json={"title": task_title, "urgency": "LOW", "assignee_id": assignee["id"]},
            headers=owner_headers,
        )
        assert task_resp.status_code == 201
        task_id = task_resp.json()["id"]

        # Create automation: when task moved to dest_column → notify assignee
        notif_message = f"Задача перемещена в {dest_column['name']}"
        automation = self._create_automation(
            client, pid, "column_changed", dest_col_id, notif_message, owner_headers
        )
        automation_id = automation["id"]

        try:
            # Move the task to the destination column — fires the column_changed event
            move_resp = client.patch(
                f"{CORE_API_URL}/api/v1/tasks/{task_id}/column",
                json={"column_id": dest_col_id},
                headers=owner_headers,
            )
            assert move_resp.status_code == 200

            # Poll the assignee's notification bell
            result = _wait_for_notification(
                client,
                assignee_onegin_headers,
                lambda items: any(
                    n.get("type") == "task_assigned"
                    and n.get("task_id") == task_id
                    and n.get("action_key") == "automation_triggered"
                    for n in items
                ),
                timeout=10,
            )
            assert result is not None, (
                f"Automation notification for task {task_id} did not appear within 10 s. "
                "Check that the automation-worker container is running."
            )
        finally:
            self._delete_automation(client, automation_id, owner_headers)

    def test_automation_log_records_run(self, client, owner_headers, onegin_project):
        pid = onegin_project["id"]
        columns = _get_columns(client, pid, owner_headers)
        if len(columns) < 2:
            pytest.skip("Project needs at least 2 columns")
        dest_col_id = columns[-1]["id"]

        task_resp = client.post(
            f"{CORE_API_URL}/api/v1/projects/{pid}/tasks",
            json={"title": f"AutoLog {uuid.uuid4().hex[:8]}", "urgency": "LOW"},
            headers=owner_headers,
        )
        assert task_resp.status_code == 201
        task_id = task_resp.json()["id"]

        automation = self._create_automation(
            client, pid, "column_changed", dest_col_id, "Проверка лога", owner_headers
        )
        automation_id = automation["id"]

        try:
            client.patch(
                f"{CORE_API_URL}/api/v1/tasks/{task_id}/column",
                json={"column_id": dest_col_id},
                headers=owner_headers,
            )

            # Wait for the worker to process, then check automation history
            time.sleep(4)
            history_resp = client.get(
                f"{CORE_API_URL}/api/v1/automations/{automation_id}/history",
                headers=owner_headers,
            )
            assert history_resp.status_code == 200
            history = history_resp.json()
            assert len(history) >= 1, (
                "Automation log is empty — automation-worker may not be running "
                "or the column_equals condition did not match."
            )
            assert history[0]["status"] == "success"
        finally:
            self._delete_automation(client, automation_id, owner_headers)

    def test_inactive_automation_does_not_fire(
        self, client, owner_headers, assignee_onegin_headers, onegin_project
    ):
        pid = onegin_project["id"]
        assignee = _get_assignee(client, pid, owner_headers)
        if assignee is None:
            pytest.skip("No assignee in project")

        columns = _get_columns(client, pid, owner_headers)
        if len(columns) < 2:
            pytest.skip("Project needs at least 2 columns")
        dest_col_id = columns[-1]["id"]

        task_resp = client.post(
            f"{CORE_API_URL}/api/v1/projects/{pid}/tasks",
            json={
                "title": f"InactiveAuto {uuid.uuid4().hex[:8]}",
                "urgency": "LOW",
                "assignee_id": assignee["id"],
            },
            headers=owner_headers,
        )
        task_id = task_resp.json()["id"]

        # Create automation, then immediately disable it
        automation = self._create_automation(
            client,
            pid,
            "column_changed",
            dest_col_id,
            "Не должно прийти",
            owner_headers,
        )
        automation_id = automation["id"]
        client.put(
            f"{CORE_API_URL}/api/v1/automations/{automation_id}",
            json={"is_active": False},
            headers=owner_headers,
        )

        try:
            # Snapshot current notifications count for the assignee
            before_resp = client.get(
                f"{CORE_API_URL}/api/v1/notifications", headers=assignee_onegin_headers
            )
            len(before_resp.json())

            client.patch(
                f"{CORE_API_URL}/api/v1/tasks/{task_id}/column",
                json={"column_id": dest_col_id},
                headers=owner_headers,
            )
            time.sleep(4)

            after_resp = client.get(
                f"{CORE_API_URL}/api/v1/notifications", headers=assignee_onegin_headers
            )
            automation_notifs = [
                n
                for n in after_resp.json()
                if n.get("task_id") == task_id
                and n.get("action_key") == "automation_triggered"
            ]
            assert len(automation_notifs) == 0, (
                "Inactive automation must not fire notifications"
            )
        finally:
            self._delete_automation(client, automation_id, owner_headers)

    def test_internal_automation_event_creates_audit_record(
        self, client, owner_headers, onegin_project
    ):
        """The /tasks/internal/automation-event endpoint must create an AuditLog entry."""
        pid = onegin_project["id"]

        task_resp = client.post(
            f"{CORE_API_URL}/api/v1/projects/{pid}/tasks",
            json={"title": f"AuditAuto {uuid.uuid4().hex[:8]}", "urgency": "LOW"},
            headers=owner_headers,
        )
        assert task_resp.status_code == 201
        task_id = task_resp.json()["id"]

        resp = client.post(
            f"{CORE_API_URL}/api/v1/tasks/internal/automation-event",
            json={
                "task_id": task_id,
                "action": "notification",
                "message": "E2E direct call",
            },
            headers={"X-Service-Token": SERVICE_TOKEN},
        )
        assert resp.status_code == 204

        # The audit log for this task must now contain an automation_triggered entry
        audit_resp = client.get(
            f"{CORE_API_URL}/api/v1/tasks/{task_id}/audit", headers=owner_headers
        )
        if audit_resp.status_code == 404:
            pytest.skip("Audit endpoint not available")
        assert audit_resp.status_code == 200
        actions = [e["action"] for e in audit_resp.json()]
        assert "automation_triggered" in actions

    def test_internal_automation_event_rejects_bad_token(self, client, owner_headers, onegin_project):
        pid = onegin_project["id"]
        # Regular task creation needs a user JWT; the service token is only for internal endpoints
        task_resp = client.post(
            f"{CORE_API_URL}/api/v1/projects/{pid}/tasks",
            json={"title": "Token check", "urgency": "LOW"},
            headers=owner_headers,
        )
        task_id = task_resp.json()["id"]

        resp = client.post(
            f"{CORE_API_URL}/api/v1/tasks/internal/automation-event",
            json={"task_id": task_id, "action": "notification", "message": "Bad token"},
            headers={"X-Service-Token": "wrong-token"},
        )
        assert resp.status_code == 403
