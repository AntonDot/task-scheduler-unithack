from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/taskscheduler"
    jwt_secret: str = ""  # noqa: S105
    service_token: str = "dev-service-token"  # noqa: S105
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]
    dev_login: bool = True
    ml_worker_url: str = "http://localhost:8001"
    ml_webhook_api_key: str = "dev-webhook-key"  # noqa: S105
    review_board_url: str = "http://localhost:8002"

    model_config = {"env_prefix": "CORE_", "env_file": ".env", "extra": "ignore"}


settings = Settings()
