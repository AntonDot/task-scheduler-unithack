from pydantic_settings import BaseSettings

# Application settings loaded from environment variables with CORE_ prefix.
# Everything that differs between deploys (addresses of backing services, secrets)
# has no default: the process refuses to start until it is set in the environment.


class Settings(BaseSettings):
    database_url: str
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24
    service_token: str
    cors_origins: list[str] = []
    dev_login: bool = False
    ml_worker_url: str = ""
    ml_webhook_api_key: str
    # Empty URL disables publishing automation events (the `full` compose profile brings RabbitMQ up)
    rabbitmq_url: str = ""
    automation_events_queue: str = "automation.events"
    # S3-compatible object storage for task attachments (RustFS in compose, any S3 in the cloud)
    s3_endpoint_url: str = ""
    s3_region: str = "us-east-1"
    s3_access_key: str
    s3_secret_key: str
    s3_bucket: str = "attachments"
    # PostgreSQL LISTEN/NOTIFY channel that fans WebSocket events out to every core-api replica
    ws_channel: str = "ws_events"
    log_level: str = "INFO"
    # VAPID keys for Web Push — generate with:
    # python -c "from py_vapid import Vapid; v=Vapid(); v.generate_keys(); print(v.public_key, v.private_key)"
    vapid_private_key: str = ""
    vapid_public_key: str = ""
    vapid_claims_email: str = "admin@victory.local"

    model_config = {"env_prefix": "CORE_", "extra": "ignore"}


settings = Settings()
