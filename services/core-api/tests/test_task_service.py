import pytest
from fastapi import HTTPException

from app.domain import ProjectRole, TaskStatus, Urgency
from app.models import Project, Task, User, UserProject
from app.schemas import TaskCreate, TaskUpdate
from app.services import task_service


async def _setup_project_data(session):
    """Create users, project, and membership for service-level tests."""
    owner = User(full_name="Owner", email="owner@svc.com")
    assignee = User(full_name="Assignee", email="assignee@svc.com")
    session.add_all([owner, assignee])
    await session.flush()

    project = Project(name="Svc Project", slug="svc-proj", color="#00ff00")
    session.add(project)
    await session.flush()

    owner_link = UserProject(user_id=owner.id, project_id=project.id, role=ProjectRole.OWNER)
    assignee_link = UserProject(user_id=assignee.id, project_id=project.id, role=ProjectRole.ASSIGNEE)
    session.add_all([owner_link, assignee_link])
    await session.flush()

    return owner, assignee, project, owner_link, assignee_link


class TestListTasks:
    async def test_list_tasks_returns_all_for_project(self, db_session):
        owner, assignee, project, _, _ = await _setup_project_data(db_session)

        t1 = Task(
            project_id=project.id,
            creator_id=owner.id,
            assignee_id=assignee.id,
            title="Task A",
            status=TaskStatus.TODO,
            urgency=Urgency.LOW,
        )
        t2 = Task(
            project_id=project.id,
            creator_id=owner.id,
            assignee_id=owner.id,
            title="Task B",
            status=TaskStatus.IN_PROGRESS,
            urgency=Urgency.HIGH,
        )
        db_session.add_all([t1, t2])
        await db_session.flush()

        tasks = await task_service.list_tasks(db_session, project.id)
        assert len(tasks) == 2
        titles = {t.title for t in tasks}
        assert titles == {"Task A", "Task B"}

    async def test_list_tasks_filters_by_assignee(self, db_session):
        owner, assignee, project, _, _ = await _setup_project_data(db_session)

        t1 = Task(
            project_id=project.id,
            creator_id=owner.id,
            assignee_id=assignee.id,
            title="Assigned",
            status=TaskStatus.TODO,
            urgency=Urgency.LOW,
        )
        t2 = Task(
            project_id=project.id,
            creator_id=owner.id,
            assignee_id=owner.id,
            title="Owner task",
            status=TaskStatus.TODO,
            urgency=Urgency.LOW,
        )
        db_session.add_all([t1, t2])
        await db_session.flush()

        tasks = await task_service.list_tasks(db_session, project.id, assignee_id=assignee.id)
        assert len(tasks) == 1
        assert tasks[0].title == "Assigned"


class TestGetTask:
    async def test_get_task_not_found_returns_none(self, db_session):
        result = await task_service.get_task(db_session, 99999)
        assert result is None


class TestCreateTask:
    async def test_create_task_sets_defaults(self, db_session):
        owner, _, project, _, _ = await _setup_project_data(db_session)

        data = TaskCreate(title="Default task")
        task = await task_service.create_task(db_session, project.id, owner.id, data)

        assert task.title == "Default task"
        assert task.status == TaskStatus.TODO
        assert task.urgency == Urgency.MEDIUM
        assert task.assignee_id is None
        assert task.description is None
        assert task.project_id == project.id
        assert task.creator_id == owner.id


class TestChangeStatus:
    async def test_change_status_invalid_transition(self, db_session):
        owner, _, project, owner_link, _ = await _setup_project_data(db_session)

        task = Task(
            project_id=project.id,
            creator_id=owner.id,
            title="Todo task",
            status=TaskStatus.TODO,
            urgency=Urgency.MEDIUM,
        )
        db_session.add(task)
        await db_session.flush()

        with pytest.raises(HTTPException) as exc_info:
            await task_service.change_status(db_session, task.id, TaskStatus.DONE, owner_link)
        assert exc_info.value.status_code == 422


class TestApproveDraft:
    async def test_approve_draft_non_owner_raises(self, db_session):
        _, _, project, _, assignee_link = await _setup_project_data(db_session)

        with pytest.raises(HTTPException) as exc_info:
            await task_service.approve_draft(db_session, 1, assignee_link)
        assert exc_info.value.status_code == 403


class TestDiscardDraft:
    async def test_discard_draft_non_draft_raises(self, db_session):
        owner, _, project, owner_link, _ = await _setup_project_data(db_session)

        task = Task(
            project_id=project.id,
            creator_id=owner.id,
            title="Todo task",
            status=TaskStatus.TODO,
            urgency=Urgency.MEDIUM,
        )
        db_session.add(task)
        await db_session.flush()

        with pytest.raises(HTTPException) as exc_info:
            await task_service.discard_draft(db_session, task.id, owner_link)
        assert exc_info.value.status_code == 422


class TestUpdateTask:
    async def test_update_task_not_found_raises(self, db_session):
        _, _, project, owner_link, _ = await _setup_project_data(db_session)

        data = TaskUpdate(title="Nope")
        with pytest.raises(HTTPException) as exc_info:
            await task_service.update_task(db_session, 99999, data, owner_link)
        assert exc_info.value.status_code == 404

    async def test_update_task_partial_update(self, db_session):
        owner, _, project, owner_link, _ = await _setup_project_data(db_session)

        data = TaskCreate(title="Original", description="Original desc", urgency=Urgency.LOW)
        task = await task_service.create_task(db_session, project.id, owner.id, data)

        update_data = TaskUpdate(title="Updated title")
        updated = await task_service.update_task(db_session, task.id, update_data, owner_link)

        assert updated.title == "Updated title"
        assert updated.description == "Original desc"
        assert updated.urgency == Urgency.LOW

    async def test_assignee_cannot_reassign(self, db_session):
        owner, assignee, project, _, assignee_link = await _setup_project_data(db_session)

        task = Task(
            project_id=project.id,
            creator_id=owner.id,
            assignee_id=assignee.id,
            title="Assigned task",
            status=TaskStatus.TODO,
            urgency=Urgency.MEDIUM,
        )
        db_session.add(task)
        await db_session.flush()

        data = TaskUpdate(assignee_id=owner.id)
        with pytest.raises(HTTPException) as exc_info:
            await task_service.update_task(db_session, task.id, data, assignee_link)
        assert exc_info.value.status_code == 403


class TestChangeStatusExtended:
    async def test_change_status_valid_transition(self, db_session):
        owner, _, project, owner_link, _ = await _setup_project_data(db_session)

        task = Task(
            project_id=project.id,
            creator_id=owner.id,
            title="Valid transition",
            status=TaskStatus.TODO,
            urgency=Urgency.MEDIUM,
        )
        db_session.add(task)
        await db_session.flush()

        result = await task_service.change_status(db_session, task.id, TaskStatus.IN_PROGRESS, owner_link)
        assert result.status == TaskStatus.IN_PROGRESS

    async def test_change_status_invalid_transition_todo_to_done(self, db_session):
        owner, _, project, owner_link, _ = await _setup_project_data(db_session)

        task = Task(
            project_id=project.id,
            creator_id=owner.id,
            title="Invalid transition",
            status=TaskStatus.TODO,
            urgency=Urgency.MEDIUM,
        )
        db_session.add(task)
        await db_session.flush()

        with pytest.raises(HTTPException) as exc_info:
            await task_service.change_status(db_session, task.id, TaskStatus.DONE, owner_link)
        assert exc_info.value.status_code == 422


class TestDeleteTask:
    async def test_delete_task_owner_only(self, db_session):
        owner, assignee, project, _, assignee_link = await _setup_project_data(db_session)

        task = Task(
            project_id=project.id,
            creator_id=owner.id,
            title="Delete me",
            status=TaskStatus.TODO,
            urgency=Urgency.MEDIUM,
        )
        db_session.add(task)
        await db_session.flush()

        with pytest.raises(HTTPException) as exc_info:
            await task_service.delete_task(db_session, task.id, assignee_link)
        assert exc_info.value.status_code == 403

    async def test_delete_task_by_owner_succeeds(self, db_session):
        owner, _, project, owner_link, _ = await _setup_project_data(db_session)

        task = Task(
            project_id=project.id,
            creator_id=owner.id,
            title="Owner deletes",
            status=TaskStatus.TODO,
            urgency=Urgency.MEDIUM,
        )
        db_session.add(task)
        await db_session.flush()
        task_id = task.id

        project_id, deleted_id = await task_service.delete_task(db_session, task_id, owner_link)
        assert deleted_id == task_id
        assert project_id == project.id

        result = await task_service.get_task(db_session, task_id)
        assert result is None
