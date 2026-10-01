import os

# Required settings are read from the environment at import time (12-factor III);
# tests provide their own values before the scraper module is imported.
os.environ.setdefault("SCRAPER_REVIEW_BOARD_URL", "http://review-board.test")
os.environ.setdefault("SCRAPER_ML_WORKER_URL", "http://ml-worker.test")
os.environ.setdefault("SCRAPER_WEBHOOK_API_KEY", "test-webhook-key")
