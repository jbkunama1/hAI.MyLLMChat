"""Einfacher MCP-Proxy: leitet Requests an konfigurierte MCP-Server weiter."""
from typing import Any, Dict, List, Optional

import httpx

from backend.config_store import load_config

MCP_TIMEOUT = 30


def get_mcp_servers() -> List[Dict[str, Any]]:
    cfg = load_config()
    return cfg.get("mcp_servers", [])


def find_server(name: str) -> Optional[Dict[str, Any]]:
    for s in get_mcp_servers():
        if s.get("name") == name or s.get("id") == name:
            return s
    return None


async def proxy_request(name: str, path: str, method: str, body: Any) -> Dict[str, Any]:
    """Leitet method+path an den MCP-Server 'name' weiter und gibt dessen JSON zurück."""
    server = find_server(name)
    if not server:
        raise LookupError(f"MCP-Server '{name}' nicht konfiguriert")

    url = server["url"].rstrip("/") + "/" + path.lstrip("/")
    headers = {"Content-Type": "application/json"}
    if server.get("api_key"):
        headers["Authorization"] = f"Bearer {server['api_key']}"

    async with httpx.AsyncClient(timeout=MCP_TIMEOUT) as client:
        resp = await client.request(method, url, json=body or {}, headers=headers)

    if resp.status_code >= 400:
        raise RuntimeError(f"MCP-Upstream {name}: {resp.status_code} {resp.text[:200]}")

    try:
        return resp.json()
    except Exception:
        return {"raw": resp.text}
