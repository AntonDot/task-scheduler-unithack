from pydantic_settings import BaseSettings

# Application settings loaded from environment variables with CORE_ prefix


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/taskscheduler"
    jwt_secret: str = "dev-secret-key"  # noqa: S105
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24
    service_token: str = "dev-service-token"  # noqa: S105
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]
    dev_login: bool = True
    ml_worker_url: str = "http://localhost:8001"
    ml_webhook_api_key: str = "dev-webhook-key"  # noqa: S105
    review_board_url: str = "http://localhost:8002"
    rabbitmq_url: str = "amqp://guest:guest@localhost:5672/"
    automation_events_queue: str = "automation.events"
    # VAPID keys for Web Push — generate with: python -c "from py_vapid import Vapid; v=Vapid(); v.generate_keys(); print(v.public_key, v.private_key)"
    vapid_private_key: str = ""
    vapid_public_key: str = ""
    vapid_claims_email: str = "admin@victory.local"

    model_config = {"env_prefix": "CORE_", "env_file": ".env", "extra": "ignore"}


settings = Settings()
