"""Seed script for demo data — realistic Victory Group digital agency tasks."""

import asyncio
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.domain import ProjectRole, TaskStatus, Urgency
from app.models import Base, Project, Task, User, UserProject

USERS = [
    {"full_name": "Дмитрий Морозов", "email": "d.morozov@victorygroup.ru"},
    {"full_name": "Анна Козлова", "email": "a.kozlova@victorygroup.ru"},
    {"full_name": "Игорь Петров", "email": "i.petrov@victorygroup.ru"},
]

PROJECTS = [
    {"name": "Онегин Парк", "slug": "onegin-park", "color": "#ff4757"},
    {"name": "ЖК Берег", "slug": "zhk-bereg", "color": "#2ed573"},
]

now = datetime.now(tz=UTC)


def _tasks(project_id: int, creator_id: int, assignee_id: int) -> list[dict]:
    return [
        {
            "project_id": project_id,
            "creator_id": creator_id,
            "assignee_id": assignee_id,
            "title": "Просадка лидов из Директа (клиент Онегин)",
            "description": "CTR упал на 30% за последние 3 дня. Проверить ставки, минус-слова и посадочные.",
            "status": TaskStatus.TODO,
            "urgency": Urgency.URGENT,
            "deadline": now + timedelta(hours=2),
        },
        {
            "project_id": project_id,
            "creator_id": creator_id,
            "title": "Негативный отзыв на Яндекс Картах — 1 звезда",
            "description": "Клиент жалуется на долгую доставку. Нужно оперативно отработать негатив.",
            "status": TaskStatus.IN_PROGRESS,
            "urgency": Urgency.HIGH,
            "assignee_id": assignee_id,
            "deadline": now + timedelta(hours=1),
        },
        {
            "project_id": project_id,
            "creator_id": creator_id,
            "title": "Отрисовать баннеры для VK",
            "description": "3 варианта: акция, имиджевый, ретаргетинг. Размеры: 1080x607.",
            "status": TaskStatus.AI_DRAFT,
            "urgency": Urgency.MEDIUM,
        },
        {
            "project_id": project_id,
            "creator_id": creator_id,
            "assignee_id": assignee_id,
            "title": "Согласовать SEO-ядро для лендинга ЖК Берег",
            "description": "Собрано 450 ключей. Кластеризация готова, ждёт аппрув менеджера.",
            "status": TaskStatus.REVIEW,
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

        tasks = _tasks(proj1.id, manager.id, specialist1.id) + _tasks(proj2.id, manager.id, specialist2.id)
        session.add_all([Task(**t) for t in tasks])

        await session.commit()

    await engine.dispose()
    print("Seed data loaded successfully.")


if __name__ == "__main__":
    asyncio.run(seed())
