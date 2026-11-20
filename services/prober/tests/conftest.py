import os

# Settings come from the environment (12-factor III); tests provide their own values
os.environ.setdefault("PROBER_TARGET_URL", "http://web.test")
os.environ.setdefault("PROBER_EMAIL", "probe@example.com")
os.environ.setdefault("PROBER_PASSWORD", "secret")
os.environ.setdefault("PROBER_PROJECT_SLUG", "onegin-park")
