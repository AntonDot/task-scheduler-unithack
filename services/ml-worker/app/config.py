from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    core_api_url: str = "http://localhost:8000"
    core_api_token: str = ""  # noqa: S105
    llm_api_key: str = ""
    llm_model: str = "claude-sonnet-4-20250514"
    use_mock_llm: bool = True
    webhook_api_key: str = "dev-webhook-key"

    model_config = {
        "env_prefix": "ML_",
        "env_file": ".env",
        "extra": "ignore"
    }


settings = Settings()
