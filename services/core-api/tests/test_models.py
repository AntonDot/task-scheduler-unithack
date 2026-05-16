import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.domain import ProjectRole, TaskStatus, Urgency
from app.models import Project, Task, User, UserProject
from app.models.board_column import BoardColumn


async def _create_user(session, email="test@example.com", full_name="Test User"):
    user = User(full_name=full_name, email=email)
    session.add(user)
    await session.flush()
    return user


async def _create_project(session, slug="test-project", name="Test Project"):
    project = Project(name=name, slug=slug, color="#ff4757")
    session.add(project)
    await session.flush()
    return project


class TestUserModel:
    async def test_create_user(self, db_session):
        user = await _create_user(db_session)
        assert user.id is not None
        assert user.email == "test@example.com"
        assert user.is_active is True

    async def test_unique_email(self, db_session):
        await _create_user(db_session, email="dup@example.com")
        with pytest.raises(IntegrityError):
            await _create_user(db_session, email="dup@example.com")


class TestProjectModel:
    async def test_create_project(self, db_session):
        project = await _create_project(db_session)
        assert project.id is not None
        assert project.slug == "test-project"

    async def test_unique_slug(self, db_session):
        await _create_project(db_session, slug="dup")
        with pytest.raises(IntegrityError):
            await _create_project(db_session, slug="dup")


class TestUserProjectModel:
    async def test_assign_role(self, db_session):
        user = await _create_user(db_session)
        project = await _create_project(db_session)

        link = UserProject(user_id=user.id, project_id=project.id, role=ProjectRole.OWNER)
        db_session.add(link)
        await db_session.flush()

        assert link.role == "OWNER"

    async def test_unique_user_project(self, db_session):
        user = await _create_user(db_session)
        project = await _create_project(db_session)

        db_session.add(UserProject(user_id=user.id, project_id=project.id, role=ProjectRole.OWNER))
        await db_session.flush()

        with pytest.raises(IntegrityError):
            db_session.add(UserProject(user_id=user.id, project_id=project.id, role=ProjectRole.ASSIGNEE))
            await db_session.flush()

    async def test_valid_roles(self, db_session):
        assert ProjectRole.OWNER == "OWNER"
        assert ProjectRole.ASSIGNEE == "ASSIGNEE"


class TestTaskModel:
    async def test_create_task(self, db_session):
        user = await _create_user(db_session)
        project = await _create_project(db_session)
        col = BoardColumn(name="TODO", project_id=project.id, order=0)
        db_session.add(col)
        await db_session.flush()

        task = Task(
            project_id=project.id,
            creator_id=user.id,
            title="Test task",
            column_id=col.id,
            urgency=Urgency.HIGH,
        )
        db_session.add(task)
        await db_session.flush()

        assert task.id is not None
        assert task.column_id == col.id
        assert task.urgency == "HIGH"
        assert task.assignee_id is None

    async def test_task_with_assignee(self, db_session):
        creator = await _create_user(db_session, email="creator@example.com")
        assignee = await _create_user(db_session, email="assignee@example.com")
        project = await _create_project(db_session)
        col = BoardColumn(name="TODO", project_id=project.id, order=0)
        db_session.add(col)
        await db_session.flush()

        task = Task(
            project_id=project.id,
            creator_id=creator.id,
            assignee_id=assignee.id,
            title="Assigned task",
            column_id=col.id,
        )
        db_session.add(task)
        await db_session.flush()

        assert task.assignee_id == assignee.id

    async def test_valid_statuses(self, db_session):
        assert TaskStatus.AI_DRAFT == "AI_DRAFT"
        assert TaskStatus.TODO == "TODO"
        assert TaskStatus.IN_PROGRESS == "IN_PROGRESS"
        assert TaskStatus.REVIEW == "REVIEW"
        assert TaskStatus.DONE == "DONE"

    async def test_valid_urgency_levels(self, db_session):
        assert Urgency.LOW == "LOW"
        assert Urgency.MEDIUM == "MEDIUM"
        assert Urgency.HIGH == "HIGH"
        assert Urgency.URGENT == "URGENT"

    async def test_task_project_fk(self, db_session):
        user = await _create_user(db_session)
        project = await _create_project(db_session)
        col = BoardColumn(name="TODO", project_id=project.id, order=0)
        db_session.add(col)
        await db_session.flush()

        task = Task(project_id=project.id, creator_id=user.id, title="FK test", column_id=col.id)
        db_session.add(task)
        await db_session.flush()

        result = await db_session.execute(select(Task).where(Task.project_id == project.id))
        tasks = result.scalars().all()
        assert len(tasks) == 1
