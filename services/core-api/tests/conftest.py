import pytest
from httpx import ASGITransport, AsyncClient
from jose import jwt
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.database import get_db
from app.domain import ProjectRole, Urgency
from app.main import app
from app.models import Base, Project, Task, User, UserProject, BoardColumn

TEST_SECRET = "test-secret"  # noqa: S105
TEST_SERVICE_TOKEN = "test-service-token"  # noqa: S105


@pytest.fixture(autouse=True)
def _set_test_settings():
    original_jwt = settings.jwt_secret
    original_service = settings.service_token
    settings.jwt_secret = TEST_SECRET
    settings.service_token = TEST_SERVICE_TOKEN
    yield
    settings.jwt_secret = original_jwt
    settings.service_token = original_service


@pytest.fixture
async def db_session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture
async def engine():
    eng = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await eng.dispose()


@pytest.fixture
async def session_factory(engine):
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture
async def client(session_factory):
    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.fixture
async def seed_data(session_factory):
    async with session_factory() as session:
        manager = User(full_name="Manager", email="manager@test.com")
        specialist = User(full_name="Specialist", email="spec@test.com")
        outsider = User(full_name="Outsider", email="out@test.com")
        session.add_all([manager, specialist, outsider])
        await session.flush()

        project = Project(name="Test Project", slug="test-proj", color="#ff0000")
        session.add(project)
        await session.flush()

        session.add_all(
            [
                UserProject(user_id=manager.id, project_id=project.id, role=ProjectRole.OWNER),
                UserProject(user_id=specialist.id, project_id=project.id, role=ProjectRole.ASSIGNEE),
            ]
        )
        await session.flush()

        todo_col = BoardColumn(name="TODO", project_id=project.id, order=0)
        review_col = BoardColumn(name="REVIEW", project_id=project.id, order=1)
        session.add_all([todo_col, review_col])
        await session.flush()

        draft_task = Task(
            project_id=project.id,
            creator_id=manager.id,
            assignee_id=specialist.id,
            title="AI Draft Task",
            column_id=todo_col.id,
            urgency=Urgency.MEDIUM,
        )
        todo_task = Task(
            project_id=project.id,
            creator_id=manager.id,
            assignee_id=specialist.id,
            title="Todo Task",
            column_id=todo_col.id,
            urgency=Urgency.HIGH,
        )
        review_task = Task(
            project_id=project.id,
            creator_id=manager.id,
            assignee_id=specialist.id,
            title="Review Task",
            column_id=review_col.id,
            urgency=Urgency.LOW,
        )
        session.add_all([draft_task, todo_task, review_task])
        await session.commit()

        return {
            "manager": manager,
            "specialist": specialist,
            "outsider": outsider,
            "project": project,
            "draft_task": draft_task,
            "todo_task": todo_task,
            "review_task": review_task,
        }


@pytest.fixture
def get_token():
    def _token(user_id: int) -> str:
        return jwt.encode({"sub": str(user_id)}, TEST_SECRET, algorithm="HS256")

    return _token
