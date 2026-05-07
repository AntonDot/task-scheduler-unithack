import random
import uuid
from datetime import UTC, datetime
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

app = FastAPI(title="Mock Review Board", version="0.1.0")
templates = Jinja2Templates(directory=str(Path(__file__).parent / "templates"))

REVIEWS: list[dict] = [
    {
        "id": "rev-001",
        "author": "Алексей М.",
        "rating": 5,
        "text": "Отличная работа! Всё сделали в срок, качество на высоте.",
        "date": "2025-05-01",
        "business": "Онегин Парк",
    },
    {
        "id": "rev-002",
        "author": "Марина К.",
        "rating": 1,
        "text": "Ужасный сервис. Ждали ответа 3 дня, никто не перезвонил. Больше не обращусь.",
        "date": "2025-05-03",
        "business": "Онегин Парк",
    },
    {
        "id": "rev-003",
        "author": "Дмитрий В.",
        "rating": 4,
        "text": "В целом хорошо, но есть мелкие замечания по дизайну.",
        "date": "2025-05-04",
        "business": "ЖК Берег",
    },
    {
        "id": "rev-004",
        "author": "Ольга П.",
        "rating": 2,
        "text": "Долгая доставка, упаковка повреждена. Разочарована.",
        "date": "2025-05-05",
        "business": "ЖК Берег",
    },
    {
        "id": "rev-005",
        "author": "Игорь С.",
        "rating": 3,
        "text": "Средний уровень обслуживания. Ничего особенного.",
        "date": "2025-05-06",
        "business": "Онегин Парк",
    },
]


@app.get("/health")
async def health():
    return {"status": "ok", "service": "mock-review-board"}


@app.get("/reviews", response_class=HTMLResponse)
async def reviews_page(request: Request):
    return templates.TemplateResponse(request, "reviews.html", context={"reviews": REVIEWS})


@app.get("/api/reviews")
async def reviews_api():
    return {"reviews": REVIEWS}


@app.post("/api/reviews/generate")
async def generate_review():
    negative_texts = [
        "Качество работы упало. Раньше было лучше, сейчас полный провал.",
        "Не рекомендую. Потеряли время и деньги. Никакой коммуникации.",
        "Сайт до сих пор не работает после обновления. Кошмар.",
    ]
    review = {
        "id": f"rev-{uuid.uuid4().hex[:8]}",
        "author": random.choice(["Анна Р.", "Павел Д.", "Елена Ж.", "Виктор Н."]),
        "rating": random.randint(1, 2),
        "text": random.choice(negative_texts),
        "date": datetime.now(tz=UTC).strftime("%Y-%m-%d"),
        "business": random.choice(["Онегин Парк", "ЖК Берег"]),
    }
    REVIEWS.append(review)
    return review
