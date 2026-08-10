"""Selbstcheck (ohne Framework): Admin-Config-Pydantic-Modelle validieren wie erwartet."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pydantic import ValidationError

from backend.config_store import ModelConfig, McpServerConfig, ProviderConfig


def rejects(factory, bad):
    try:
        factory(**bad)
    except ValidationError:
        return
    raise AssertionError(f"sollte fehlschlagen: {bad}")


# Gültige Eingaben werden normalisiert (nur gesendete Felder bleiben erhalten)
p = ProviderConfig(name="OpenRouter", base_url="https://openrouter.ai/api/v1", models=["gpt-4o"])
assert p.model_dump(exclude_unset=True) == {
    "name": "OpenRouter",
    "base_url": "https://openrouter.ai/api/v1",
    "models": ["gpt-4o"],
}

# Pflichtfelder (name/base_url) dürfen nicht fehlen oder leer sein
rejects(ProviderConfig, {"base_url": "https://x"})
rejects(ProviderConfig, {"name": ""})
rejects(ProviderConfig, {"name": "x", "base_url": ""})
rejects(McpServerConfig, {"url": "http://x"})
rejects(McpServerConfig, {"name": "", "url": "http://x"})
rejects(ModelConfig, {})

# models muss eine Liste sein, kein String
rejects(ProviderConfig, {"name": "x", "base_url": "http://x", "models": "gpt-4o"})

# Gültige MCP-/Modell-Daten
McpServerConfig(name="mcpo", url="http://mcpo:8000")
assert ModelConfig(id="gpt-4o", name="gpt-4o").id == "gpt-4o"

print("OK: Config-Modelle validieren wie erwartet.")
