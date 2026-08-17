import os
import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

DATA_DIR = Path(os.getenv("DATA_DIR", "/data"))
CONFIG_PATH = DATA_DIR / "config.json"


class ProviderConfig(BaseModel):
    """Ein LLM-Anbieter (Admin-Konfiguration)."""

    id: Optional[str] = None
    name: str = Field(min_length=1)
    base_url: str = Field(min_length=1)
    api_key: Optional[str] = None
    models: List[str] = []
    selected: bool = False


class ModelConfig(BaseModel):
    """Ein global verfügbares Modell."""

    id: Optional[str] = None
    name: str = Field(min_length=1)


class McpServerConfig(BaseModel):
    """Ein MCP-Server (Admin-Konfiguration)."""

    id: Optional[str] = None
    name: str = Field(min_length=1)
    url: str = Field(min_length=1)
    api_key: Optional[str] = None

DEFAULT_CONFIG: Dict[str, Any] = {
    "providers": [],
    "models": [],
    "mcp_servers": [],
    "chat": {
        "name": os.getenv("HAI_DEFAULT_CHAT_NAME"),
        "base_url": os.getenv("HAI_DEFAULT_CHAT_BASE_URL"),
        "api_key": os.getenv("HAI_DEFAULT_CHAT_API_KEY"),
        "model": os.getenv("HAI_DEFAULT_CHAT_MODEL"),
    },
    "image": {
        "name": os.getenv("HAI_DEFAULT_IMAGE_NAME"),
        "base_url": os.getenv("HAI_DEFAULT_IMAGE_BASE_URL"),
        "api_key": os.getenv("HAI_DEFAULT_IMAGE_API_KEY"),
        "endpoint": os.getenv("HAI_DEFAULT_IMAGE_ENDPOINT", "/images/generations"),
    },
    "mcp": {
        "enabled": os.getenv("HAI_MCP_ENABLED", "false").lower() == "true",
        "base_url": os.getenv("HAI_MCP_BASE_URL"),
        "token": os.getenv("HAI_MCP_TOKEN"),
    },
}


def load_config() -> Dict[str, Any]:
    if CONFIG_PATH.exists():
        try:
            return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    save_config(DEFAULT_CONFIG)
    return DEFAULT_CONFIG


def save_config(cfg: Dict[str, Any]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")
