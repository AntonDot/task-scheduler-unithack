from bs4 import BeautifulSoup


def parse_reviews(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    reviews = []
    for div in soup.select(".review[data-review-id]"):
        review_id = div.get("data-review-id", "")
        rating = int(div.get("data-rating", "5"))
        text_el = div.find("p")
        text = text_el.get_text(strip=True) if text_el else ""
        business_el = div.select_one(".business")
        business = business_el.get_text(strip=True) if business_el else ""
        reviews.append({
            "id": review_id,
            "rating": rating,
            "text": text,
            "business": business,
        })
    return reviews


def filter_negative(reviews: list[dict], max_rating: int = 2) -> list[dict]:
    return [r for r in reviews if r["rating"] <= max_rating]
