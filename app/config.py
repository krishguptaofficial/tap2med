from pydantic_settings import BaseSettings , SettingsConfigDict
from pydantic import Field
from functools import lru_cache

class Settings(BaseSettings):
    """
    Validates and holds all environment-specific variables.
    If a variable is missing in .env, the app will crash at boot.
    """
    # Master key for HMAC;a high-entropy string in production
    SECRET_KEY: str= Field(default= ...)

    # Secret specifically isolated for lost-device recovery lookup hashes
    LOOKUP_SECRET: str = Field(default=...)
    
    # SQLAlchemy connection string for the PostgreSQL database
    DATABASE_URL: str= Field(default= ...)

    BREVO_API_KEY: str = Field(default=...)
    BREVO_SENDER_EMAIL: str = Field(default="verify@tap2med.com")
    BREVO_SENDER_NAME: str = Field(default="Tap2Med")

    # Pydantic configuration class to link the class to the physical .env file
    model_config = SettingsConfigDict(
        env_file = ".env",
        extra = "ignore",
        case_sensitive=True
    )

@lru_cache
def get_settings():
    """
    Creates a singleton instance of the Settings class.
    lru_cache prevents the app from reading the disk on every request.
    """
    # Initializing the Settings object; this triggers the .env file read
    return Settings()

settings = get_settings()