"""Seed script for demo data — realistic Victory Group digital agency tasks."""

import asyncio
from datetime import UTC, datetime, timedelta

from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.domain import ProjectRole, Urgency
from app.models import Base, BoardColumn, Project, Task, User, UserProject

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

USERS = [
    {
        "full_name": "Дмитрий Морозов",
        "email": "d.morozov@victorygroup.ru",
        "password_hash": pwd_context.hash("manager123"),  # noqa: S106
    },
    {
        "full_name": "Анна Козлова",
        "email": "a.kozlova@victorygroup.ru",
        "password_hash": pwd_context.hash("assignee123"),  # noqa: S106
    },
    {
        "full_name": "Игорь Петров",
        "email": "i.petrov@victorygroup.ru",
        "password_hash": pwd_context.hash("assignee123"),  # noqa: S106
    },
]

PROJECTS = [
    {"name": "Онегин Парк", "slug": "onegin-park", "color": "#ff4757"},
    {"name": "ЖК Берег", "slug": "zhk-bereg", "color": "#2ed573"},
]

# Default columns created for every project
DEFAULT_COLUMNS = [
    {"name": "Backlog",     "color": "#9CA3AF", "order": 0},
    {"name": "In Progress", "color": "#6366F1", "order": 1},
    {"name": "Review",      "color": "#D97706", "order": 2},
    {"name": "Done",        "color": "#059669", "order": 3},
]

# Column order indexes for task placement
COL_BACKLOG     = 0
COL_IN_PROGRESS = 1
COL_REVIEW      = 2
COL_DONE        = 3

now = datetime.now(tz=UTC)


def _tasks(project_id: int, creator_id: int, assignee_id: int, cols: list[BoardColumn]) -> list[dict]:
    return [
        {
            "project_id": project_id,
            "creator_id": creator_id,
            "assignee_id": assignee_id,
            "column_id": cols[COL_BACKLOG].id,
            "title": "Просадка лидов из Директа (клиент Онегин)",
            "description": "CTR упал на 30% за последние 3 дня. Проверить ставки, минус-слова и посадочные.",
            "urgency": Urgency.URGENT,
            "deadline": now + timedelta(hours=2),
        },
        {
            "project_id": project_id,
            "creator_id": creator_id,
            "assignee_id": assignee_id,
            "column_id": cols[COL_IN_PROGRESS].id,
            "title": "Негативный отзыв на Яндекс Картах — 1 звезда",
            "description": "Клиент жалуется на долгую доставку. Нужно оперативно отработать негатив.",
            "urgency": Urgency.HIGH,
            "deadline": now + timedelta(hours=1),
        },
        {
            "project_id": project_id,
            "creator_id": creator_id,
            "column_id": cols[COL_BACKLOG].id,
            "title": "Отрисовать баннеры для VK",
            "description": "3 варианта: акция, имиджевый, ретаргетинг. Размеры: 1080x607.",
            "urgency": Urgency.MEDIUM,
        },
        {
            "project_id": project_id,
            "creator_id": creator_id,
            "assignee_id": assignee_id,
            "column_id": cols[COL_REVIEW].id,
            "title": "Согласовать SEO-ядро для лендинга ЖК Берег",
            "description": "Собрано 450 ключей. Кластеризация готова, ждёт аппрув менеджера.",
            "urgency": Urgency.LOW,
            "deadline": now + timedelta(days=3),
        },
    ]


async def seed():
    engine = create_async_engine(settings.database_url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        existing_manager = await session.execute(select(User).where(User.email == "d.morozov@victorygroup.ru"))
        if existing_manager.scalar_one_or_none() is not None:
            print("Seed already applied. Skipping.")
            await engine.dispose()
            return

        users = [User(**u) for u in USERS]
        session.add_all(users)
        await session.flush()

        projects = [Project(**p) for p in PROJECTS]
        session.add_all(projects)
        await session.flush()

        manager, specialist1, specialist2 = users
        proj1, proj2 = projects

        links = [
            UserProject(user_id=manager.id, project_id=proj1.id, role=ProjectRole.OWNER),
            UserProject(user_id=specialist1.id, project_id=proj1.id, role=ProjectRole.ASSIGNEE),
            UserProject(user_id=manager.id, project_id=proj2.id, role=ProjectRole.OWNER),
            UserProject(user_id=specialist2.id, project_id=proj2.id, role=ProjectRole.ASSIGNEE),
        ]
        session.add_all(links)
        await session.flush()

        # Create default columns for each project
        cols1 = [BoardColumn(project_id=proj1.id, **c) for c in DEFAULT_COLUMNS]
        cols2 = [BoardColumn(project_id=proj2.id, **c) for c in DEFAULT_COLUMNS]
        session.add_all(cols1 + cols2)
        await session.flush()

        tasks = _tasks(proj1.id, manager.id, specialist1.id, cols1) + \
                _tasks(proj2.id, manager.id, specialist2.id, cols2)
        session.add_all([Task(**t) for t in tasks])

        await session.commit()

    await engine.dispose()
    print("Seed data loaded successfully.")


if __name__ == "__main__":
    asyncio.run(seed())
