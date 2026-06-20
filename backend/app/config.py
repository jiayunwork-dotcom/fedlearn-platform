import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "FedLearn Platform"
    DEBUG: bool = True

    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql://fedlearn:fedlearn123@localhost:5432/fedlearn_db"
    )
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    CELERY_BROKER_URL: str = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/1")
    CELERY_RESULT_BACKEND: str = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/2")

    DATA_DIR: str = os.getenv("DATA_DIR", "./data")

    class Config:
        env_file = ".env"


settings = Settings()
