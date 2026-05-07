from parser import filter_negative, parse_reviews

SAMPLE_HTML = """
<html>
<body>
<div class="review" data-review-id="rev-001" data-rating="5">
    <p>Отличная работа!</p>
    <span class="business">Онегин Парк</span>
</div>
<div class="review" data-review-id="rev-002" data-rating="1">
    <p>Ужасный сервис.</p>
    <span class="business">Онегин Парк</span>
</div>
<div class="review" data-review-id="rev-003" data-rating="2">
    <p>Долгая доставка.</p>
    <span class="business">ЖК Берег</span>
</div>
<div class="review" data-review-id="rev-004" data-rating="3">
    <p>Средний уровень.</p>
    <span class="business">ЖК Берег</span>
</div>
</body>
</html>
"""


class TestParseReviews:
    def test_extracts_all_reviews(self):
        reviews = parse_reviews(SAMPLE_HTML)
        assert len(reviews) == 4

    def test_extracts_review_id(self):
        reviews = parse_reviews(SAMPLE_HTML)
        ids = [r["id"] for r in reviews]
        assert ids == ["rev-001", "rev-002", "rev-003", "rev-004"]

    def test_extracts_rating(self):
        reviews = parse_reviews(SAMPLE_HTML)
        ratings = [r["rating"] for r in reviews]
        assert ratings == [5, 1, 2, 3]

    def test_extracts_text(self):
        reviews = parse_reviews(SAMPLE_HTML)
        assert reviews[0]["text"] == "Отличная работа!"
        assert reviews[1]["text"] == "Ужасный сервис."

    def test_extracts_business(self):
        reviews = parse_reviews(SAMPLE_HTML)
        assert reviews[0]["business"] == "Онегин Парк"
        assert reviews[2]["business"] == "ЖК Берег"

    def test_empty_html_returns_empty(self):
        assert parse_reviews("<html><body></body></html>") == []

    def test_missing_text_element(self):
        html = '<div class="review" data-review-id="r1" data-rating="3"><span class="business">X</span></div>'
        reviews = parse_reviews(html)
        assert reviews[0]["text"] == ""

    def test_missing_business_element(self):
        html = '<div class="review" data-review-id="r1" data-rating="3"><p>Text</p></div>'
        reviews = parse_reviews(html)
        assert reviews[0]["business"] == ""


class TestFilterNegative:
    def test_filters_rating_1_and_2(self):
        reviews = parse_reviews(SAMPLE_HTML)
        negative = filter_negative(reviews)
        assert len(negative) == 2
        assert all(r["rating"] <= 2 for r in negative)

    def test_default_max_rating_is_2(self):
        reviews = parse_reviews(SAMPLE_HTML)
        negative = filter_negative(reviews)
        ids = [r["id"] for r in negative]
        assert "rev-002" in ids
        assert "rev-003" in ids
        assert "rev-001" not in ids
        assert "rev-004" not in ids

    def test_custom_max_rating(self):
        reviews = parse_reviews(SAMPLE_HTML)
        negative = filter_negative(reviews, max_rating=3)
        assert len(negative) == 3

    def test_no_negative_reviews(self):
        html = '<div class="review" data-review-id="r1" data-rating="5"><p>Good</p><span class="business">X</span></div>'  # noqa: E501
        reviews = parse_reviews(html)
        assert filter_negative(reviews) == []
