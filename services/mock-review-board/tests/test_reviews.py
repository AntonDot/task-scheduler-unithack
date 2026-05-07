import pytest
from httpx import ASGITransport, AsyncClient

from app.main import REVIEWS, app


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture(autouse=True)
def _reset_reviews():
    original = REVIEWS.copy()
    yield
    REVIEWS.clear()
    REVIEWS.extend(original)


class TestHealth:
    async def test_health_ok(self, client):
        resp = await client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"


class TestReviewsHTML:
    async def test_returns_html(self, client):
        resp = await client.get("/reviews")
        assert resp.status_code == 200
        assert "text/html" in resp.headers["content-type"]

    async def test_contains_review_ids(self, client):
        resp = await client.get("/reviews")
        for review in REVIEWS:
            assert f'data-review-id="{review["id"]}"' in resp.text

    async def test_contains_ratings(self, client):
        resp = await client.get("/reviews")
        for review in REVIEWS:
            assert f'data-rating="{review["rating"]}"' in resp.text


class TestReviewsAPI:
    async def test_returns_json(self, client):
        resp = await client.get("/api/reviews")
        assert resp.status_code == 200
        data = resp.json()
        assert "reviews" in data
        assert len(data["reviews"]) == len(REVIEWS)

    async def test_review_fields(self, client):
        resp = await client.get("/api/reviews")
        review = resp.json()["reviews"][0]
        assert "id" in review
        assert "author" in review
        assert "rating" in review
        assert "text" in review
        assert "business" in review


class TestGenerateReview:
    async def test_generates_negative_review(self, client):
        resp = await client.post("/api/reviews/generate")
        assert resp.status_code == 200
        review = resp.json()
        assert review["rating"] in (1, 2)
        assert review["id"].startswith("rev-")
        assert review["business"] in ("Онегин Парк", "ЖК Берег")

    async def test_generate_adds_to_list(self, client):
        initial_count = len(REVIEWS)
        await client.post("/api/reviews/generate")
        assert len(REVIEWS) == initial_count + 1
