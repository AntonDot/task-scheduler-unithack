from pydantic_settings import BaseSettings

# Settings come from ML_* environment variables. Addresses and secrets have no
# defaults: the process does not start until the environment provides them.


class Settings(BaseSettings):
    core_api_url: str
    core_api_token: str
    llm_api_key: str = ""
    llm_model: str = "claude-sonnet-4-20250514"
    llm_base_url: str = ""
    use_mock_llm: bool = True
    webhook_api_key: str
    log_level: str = "INFO"

    model_config = {"env_prefix": "ML_", "extra": "ignore"}


settings = Settings()
