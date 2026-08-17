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


def _server_headers(server: Dict[str, Any], method: str = "post", name: Optional[str] = None) -> Dict[str, str]:
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "MCP-Protocol-Version": "2026-07-28",
    }
    headers["Mcp-Method"] = method.upper()
    if name:
        headers["Mcp-Name"] = name
    if server.get("api_key"):
        headers["Authorization"] = f"Bearer {server['api_key']}"
    return headers


async def fetch_server_tools(server: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Fragt die Tool- Liste eines MCP-Servers ab (GET {url}/tools).

    Akzeptiert sowohl {'tools': [...]} als auch eine nackte JSON-Liste.
    """
    url = server["url"].rstrip("/") + "/tools"
    try:
        async with httpx.AsyncClient(timeout=MCP_TIMEOUT) as client:
            resp = await client.get(url, headers=_server_headers(server, method="GET"))
        if resp.status_code >= 400:
            return []
        data = resp.json()
    except Exception:
        return []
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and isinstance(data.get("tools"), list):
        return data["tools"]
    return []


async def fetch_all_server_tools() -> Dict[str, List[Dict[str, Any]]]:
    """Liefert {server_name: [tools...]} über alle konfigurierten MCP-Server."""
    result: Dict[str, List[Dict[str, Any]]] = {}
    for server in get_mcp_servers():
        name = server.get("name") or server.get("id") or server.get("url")
        result[name] = await fetch_server_tools(server)
    return result


async def call_tool(server_name: str, tool_name: str, arguments: Dict[str, Any]) -> Any:
    """Führt einen Tool-Call auf einem MCP-Server aus."""
    if not find_server(server_name):
        raise LookupError(f"MCP-Server '{server_name}' nicht konfiguriert")

    server = find_server(server_name)
    url = server["url"].rstrip("/") + "/tools/call"
    headers = _server_headers(server, method="POST", name=tool_name)

    async with httpx.AsyncClient(timeout=MCP_TIMEOUT) as client:
        resp = await client.post(url, json={"name": tool_name, "arguments": arguments or {}}, headers=headers)

    if resp.status_code >= 400:
        raise RuntimeError(f"MCP-Upstream {server_name}: {resp.status_code} {resp.text[:200]}")

    try:
        return resp.json()
    except Exception:
        return {"raw": resp.text}


# Legacy proxy_request for backward compatibility
async def proxy_request(name: str, path: str, method: str, body: Any) -> Dict[str, Any]:
    """Leitet method+path an den MCP-Server 'name' weiter und gibt dessen JSON zurück."""
    server = find_server(name)
    if not server:
        raise LookupError(f"MCP-Server '{name}' nicht konfiguriert")

    url = server["url"].rstrip("/") + "/" + path.lstrip("/")
    headers = _server_headers(server, method="PUT", name="tool_update")

    async with httpx.AsyncClient(timeout=MCP_TIMEOUT) as client:
        resp = await client.request(method, url, json=body or {}, headers=headers)

    if resp.status_code >= 400:
        raise RuntimeError(f"MCP-Upstream {name}: {resp.status_code} {resp.text[:200]}")

    try:
        return resp.json()
    except Exception:
        return {"raw": resp.text}

