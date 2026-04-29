import os
from pydantic import BaseModel
from typing import Optional


class Config(BaseModel):
    # API Configuration
    api_base_url: str = os.getenv("BETTERBUGS_API_URL", "http://localhost:3001")
    api_key: str = os.getenv("BETTERBUGS_API_KEY", "dev-key")

    # Optional: AI Configuration
    anthropic_api_key: Optional[str] = os.getenv("ANTHROPIC_API_KEY")
    openai_api_key: Optional[str] = os.getenv("OPENAI_API_KEY")

    # Optional: Custom analysis prompt
    analysis_prompt: str = os.getenv(
        "ANALYSIS_PROMPT",
        "You are a senior software engineer analyzing a bug report. "
        "Provide: 1) Root cause analysis, 2) Suggested fix, 3) Severity assessment, "
        "4) Similar bugs to look for. Session data: {session_data}"
    )


config = Config()