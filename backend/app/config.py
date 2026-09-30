from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    groq_api_key:str=''
    groq_model:str='openai/gpt-oss-120b'
    database_url:str='sqlite:///./job_agent.db'
    backend_url:str='http://localhost:8000'
    cors_origins:str='*'
    gmail_sender:str=''
    gmail_app_password:str=''
    resend_api_key:str=''
    email_from:str=''
    model_config=SettingsConfigDict(env_file='.env',extra='ignore')

@lru_cache
def get_settings():
    return Settings()
