import os
import base64
from typing import Any, Dict, List, Optional
import sqlite3
from pathlib import Path

from fastapi import FastAPI, HTTPException, Depends, Header, Body, UploadFile, File, Query, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ValidationError
import httpx

from backend.config_store import (
    load_config,
    save_config,
    DATA_DIR,
    ProviderConfig,
    ModelConfig,
    McpServerConfig,
)
from backend.mcp_proxy import (
    get_mcp_servers,
    proxy_request,
    fetch_all_server_tools,
    call_tool,
)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- Admin-Auth ----------

ADMIN_USER = os.getenv("HAI_ADMIN_USER", "admin")
ADMIN_PASSWORD = os.getenv("HAI_ADMIN_PASSWORD", "admin")
ADMIN_TOKEN = os.getenv("HAI_ADMIN_TOKEN")  # optional direkter Token


def verify_admin(x_admin_auth: str | None = Header(default=None)) -> None:
    """
    Einfache Admin-Authentifizierung:
    - Wenn HAI_ADMIN_TOKEN gesetzt ist: muss exakt im Header X-Admin-Auth stehen.
    - Sonst: erwartet base64("user:pass") im Header X-Admin-Auth.
    """
    if ADMIN_TOKEN:
        if x_admin_auth != ADMIN_TOKEN:
            raise HTTPException(status_code=401, detail="Unauthorized")
        return

    if not x_admin_auth:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        decoded = base64.b64decode(x_admin_auth).decode("utf-8")
    except Exception:
        raise HTTPException(status_code=401, detail="Unauthorized")

    if decoded != f"{ADMIN_USER}:{ADMIN_PASSWORD}":
        raise HTTPException(status_code=401, detail="Unauthorized")


# ---------- Database setup ----------


def get_db_connection():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DATA_DIR / "chat.db")
    conn.row_factory = sqlite3.Row  # to return dict-like rows
    return conn


def init_db():
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS chats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_id INTEGER NOT NULL,
                role TEXT NOT NULL,  -- 'user' or 'assistant'
                content TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (chat_id) REFERENCES chats(id)
            )
        ''')
        conn.commit()
    finally:
        conn.close()


# Initialize database on startup
init_db()


# ---------- API-Schemas ----------

class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    model: str | None = None
    temperature: float | None = 0.7
    chat_id: int | None = None  # optional chat ID
    tools: List[Dict[str, Any]] | None = None  # OpenAI-Tool-Definitionen (MCP)


class ChatResponse(BaseModel):
    content: str
    chat_id: int  # we always return the chat_id used


class ImageRequest(BaseModel):
    prompt: str
    size: str | None = "512x512"
    n: int | None = 1


class ImageUrl(BaseModel):
    url: str


class ImageResponse(BaseModel):
    images: List[ImageUrl]


# ---------- Health & Config ----------

@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/config")
async def get_config():
    cfg = load_config()
    masked = cfg.copy()

    if masked.get("chat", {}).get("api_key"):
        masked["chat"]["api_key"] = "***"
    if masked.get("image", {}).get("api_key"):
        masked["image"]["api_key"] = "***"
    if masked.get("mcp", {}).get("token"):
        masked["mcp"]["token"] = "***"
    # Maskiere API-Keys der Anbieter
    if masked.get("providers"):
        masked["providers"] = [
            {**p, "api_key": "***"} if p.get("api_key") else p
            for p in masked["providers"]
        ]
    # Maskiere API-Keys der MCP-Server
    if masked.get("mcp_servers"):
        masked["mcp_servers"] = [
            {**s, "api_key": "***"} if s.get("api_key") else s
            for s in masked["mcp_servers"]
        ]

    return masked


@app.post("/api/config/update")
async def update_config(new_cfg: Dict[str, Any] = Body(...), _admin=Depends(verify_admin)):
    """
    Aktualisiert die Laufzeitkonfiguration und speichert sie in /data/config.json.
    Nur mit Admin-Auth.
    """
    cfg = load_config()

    for section in ("chat", "image", "mcp"):
        if section in new_cfg and isinstance(new_cfg[section], dict):
            inner = cfg.get(section, {})
            inner.update({k: v for k, v in new_cfg[section].items() if v is not None})
            cfg[section] = inner

    if "providers" in new_cfg and isinstance(new_cfg["providers"], list):
        # Vom Frontend kommen maskierte Keys; behalte die echten Keys des bisherigen Zustands.
        current = {p.get("id"): p for p in cfg.get("providers", [])}
        updated = []
        for p in new_cfg["providers"]:
            base = current.get(p.get("id"), {})
            merged = {**base}
            for k, v in p.items():
                if v is None or (k == "api_key" and v in ("", "***")):
                    continue
                merged[k] = v
            if not merged.get("id"):
                # Neue Anbieter ohne id bekommen eine slug-artige id
                slug = (merged.get("name") or "provider").strip().lower()
                slug = "".join(c if c.isalnum() else "-" for c in slug).strip("-")
                if not slug:
                    slug = "provider"
                merged["id"] = slug
            updated.append(merged)
        cfg["providers"] = updated

    save_config(cfg)
    return {"status": "ok"}


# ---------- Hilfsfunktionen für Backends ----------

def get_chat_backend() -> Dict[str, Any]:
    cfg = load_config()
    chat = cfg.get("chat", {})
    return {
        "name": chat.get("name"),
        "base_url": chat.get("base_url"),
        "api_key": chat.get("api_key") or os.getenv("HAI_DEFAULT_CHAT_API_KEY"),
        "model": chat.get("model"),
        "backend_type": "openai-compatible",
    }
def get_selected_provider():
    cfg = load_config()
    providers = cfg.get("providers", [])
    for provider in providers:
        if provider.get("selected"):
            return provider
    return None



def get_image_backend() -> Dict[str, Any]:
    cfg = load_config()
    image = cfg.get("image", {})
    return {
        "name": image.get("name"),
        "base_url": image.get("base_url"),
        "api_key": image.get("api_key") or os.getenv("HAI_DEFAULT_IMAGE_API_KEY"),
        "endpoint": image.get("endpoint") or os.getenv("HAI_DEFAULT_IMAGE_ENDPOINT", "/images/generations"),
        "backend_type": "openai-image",
    }


def get_mcp_config() -> Dict[str, Any]:
    cfg = load_config()
    mcp = cfg.get("mcp", {})
    return {
        "enabled": bool(mcp.get("enabled")),
        "base_url": mcp.get("base_url"),
        "token": mcp.get("token"),
        "timeout": int(os.getenv("HAI_MCP_TIMEOUT", "30")),
    }


# ---------- Models-Endpoint (simple) ----------

@app.get("/api/models")
async def list_models():
    """
    Gibt eine einfache Modellliste zurück.
    Nutzt den ausgewählten Provider, falls vorhanden; sonst das Standard-Gesprächsmodell.
    """
    cfg = load_config()
    provider = get_selected_provider()
    
    # Wenn ein Provider ausgewählt ist und er Modelle hat, diese zurückgeben
    if provider and provider.get("models"):
        return {"models": provider["models"]}
    
    # Fallback auf das im Chat konfigurierte Modell
    model = cfg.get("chat", {}).get("model")
    if model:
        return {"models": [model]}
    
    return {"models": []}


@app.get("/api/providers")
async def list_providers():
    """Liefert die Liste der konfigurierten Anbieter (ohne API-Keys).
    Ein virtueller 'default'-Eintrag (Standard aus ENV/Chat-Config) steht immer an erster Stelle."""
    cfg = load_config()
    providers = cfg.get("providers", [])
    any_selected = any(p.get("selected") for p in providers)
    chat = cfg.get("chat", {})
    default_model = chat.get("model")
    default_name = chat.get("name") or "Standard (ENV)"
    result = [
        {
            "id": "default",
            "name": default_name,
            "models": [default_model] if default_model else [],
            "selected": not any_selected,
            "is_default": True,
        }
    ]
    result += [
        {
            "id": p.get("id"),
            "name": p.get("name"),
            "models": p.get("models", []),
            "selected": bool(p.get("selected")),
            "is_default": False,
        }
        for p in providers
    ]
    return {"providers": result}


@app.post("/api/providers/select")
async def select_provider(req: Optional[Dict[str, Any]] = Body(None)):
    """Setzt einen Anbieter als ausgewählt. 'default' = ENV-Standard (deselektiert alle konfigurierten)."""
    data = req if isinstance(req, dict) else {}
    provider_id = (data.get("provider_id") or "").strip()
    if not provider_id:
        raise HTTPException(status_code=400, detail="provider_id fehlt.")
    cfg = load_config()

    if provider_id == "default":
        # ENV-Standard: keinen konfigurierten Anbieter auswählen
        for p in cfg.get("providers", []):
            p["selected"] = False
    else:
        providers = []
        found = False
        for p in cfg.get("providers", []):
            p = dict(p)
            if p.get("id") == provider_id:
                p["selected"] = True
                found = True
            else:
                p["selected"] = False
            providers.append(p)
        if not found:
            raise HTTPException(status_code=404, detail="Anbieter nicht gefunden")
        cfg["providers"] = providers

    save_config(cfg)
    return {"status": "ok", "provider_id": provider_id}


    @app.post("/api/providers/refresh-models")
    async def refresh_provider_models():
        """Fragt die Modellliste des aktiven Providers ab (GET {base_url}/models) und speichert sie."""
        cfg = load_config()
        provider = get_selected_provider()
        backend = get_chat_backend()

        base_url = (provider or {}).get("base_url") or backend.get("base_url")
        api_key = (provider or {}).get("api_key") or backend.get("api_key")
        if not base_url:
            raise HTTPException(status_code=400, detail="Kein aktiver Provider / kein Chat-Backend konfiguriert.")

        url = base_url.rstrip("/") + "/models"
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.get(url, headers=headers)
        except httpx.RequestError:
            raise HTTPException(status_code=502, detail="Modell-Endpoint des Providers nicht erreichbar.")

        if resp.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"Provider antwortete mit {resp.status_code}.")

        try:
            data = resp.json()
        except Exception:
            raise HTTPException(status_code=502, detail="Unerwartetes Format der Modellliste.")

        if isinstance(data, dict) and isinstance(data.get("data"), list):
            models = [m.get("id") for m in data["data"] if isinstance(m, dict) and m.get("id")]
            models = sorted(dict.fromkeys(str(m) for m in models))
        else:
            raise HTTPException(status_code=502, detail="Keine 'data[].id'-Modellliste empfangen.")

        if provider:
            provider["models"] = models
            save_config(cfg)
        return {"models": models}


    # ---------- File Upload ----------

@app.post("/api/upload")
async def upload(file: UploadFile = File(...)):
    """
    Nimmt eine Datei entgegen und gibt einen kurzen Summary-Text zurück,
    der im Frontend dem Prompt hinzugefügt werden kann.
    """
    return {
        "filename": file.filename,
        "content_type": file.content_type,
        "summary": f"Datei '{file.filename}' wurde hochgeladen und steht für die Analyse bereit."
    }


# ---------- Chat-Endpoints ----------

@app.post("/api/chat/new")
async def create_new_chat():
    """Create a new chat and return its ID."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO chats (name) VALUES (?)", ("New Chat",))
        conn.commit()
        chat_id = cursor.lastrowid
        return {"chat_id": chat_id}
    finally:
        conn.close()


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()

        # Determine chat ID: use provided, or create new if none/invalid
        if req.chat_id is not None:
            cursor.execute("SELECT id FROM chats WHERE id=?", (req.chat_id,))
            chat_row = cursor.fetchone()
            if chat_row:
                chat_id = req.chat_id
            else:
                # Provided chat_id doesn't exist -> create new chat
                cursor.execute("INSERT INTO chats (name) VALUES (?)", ("New Chat",))
                conn.commit()
                chat_id = cursor.lastrowid
        else:
            # No chat_id provided -> create new chat
            cursor.execute("INSERT INTO chats (name) VALUES (?)", ("New Chat",))
            conn.commit()
            chat_id = cursor.lastrowid

        # Store the incoming messages (user's new message(s))
        for msg in req.messages:
            cursor.execute(
                "INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)",
                (chat_id, msg.role, msg.content)
            )
        conn.commit()

        # Retrieve full chat history from database for context
        cursor.execute(
            "SELECT role, content FROM messages WHERE chat_id=? ORDER BY created_at",
            (chat_id,)
        )
        db_messages = cursor.fetchall()
        history_for_llm = [{"role": row["role"], "content": row["content"]} for row in db_messages]

        # Forward to LLM backend
        backend = get_chat_backend()
        provider = get_selected_provider()
        if provider and (provider.get("base_url") or provider.get("api_key") or provider.get("name")):
            backend = {
                "name": provider.get("name"),
                "base_url": provider.get("base_url"),
                "api_key": provider.get("api_key"),
                "model": None,
                "backend_type": "openai-compatible",
            }
        if not backend["base_url"]:
            base_url = provider.get("base_url") if provider else None
            if not base_url:
                raise HTTPException(status_code=500, detail="Chat-Backend nicht konfiguriert (ENV/Config prüfen).")
            backend["base_url"] = base_url

        model = req.model or backend["model"]
        if not model:
            raise HTTPException(status_code=400, detail="Kein Modell angegeben (weder Config noch Request).")

        url = backend["base_url"].rstrip("/") + "/chat/completions"

        payload = {
            "model": model,
            "messages": history_for_llm,
            "temperature": req.temperature,
            "stream": False,
            "tools": req.tools, # Hinzugefügt für Tool-Support
        }

        headers = {"Content-Type": "application/json"}
        if backend["api_key"]:
            headers["Authorization"] = f"Bearer {backend['api_key']}"

        MAX_TOOL_CALL_ITERATIONS = 3
        for _ in range(MAX_TOOL_CALL_ITERATIONS):
            try:
                async with httpx.AsyncClient(timeout=60) as client:
                    resp = await client.post(url, json=payload, headers=headers)
                if resp.status_code != 200:
                    print("Upstream error:", resp.status_code, resp.text)
                    raise HTTPException(status_code=502, detail=f"Upstream-Fehler: {resp.status_code}")
                data = resp.json()
            except httpx.RequestError as e:
                print("HTTP error:", e)
                raise HTTPException(status_code=502, detail="Chat-Backend nicht erreichbar.")

            # Check for tool_calls in the response
            tool_calls = data.get("choices", [])[0].get("message", {}).get("tool_calls")
            if not tool_calls:
                # No tool calls, break the loop and process as a normal message
                break

            # Process tool calls
            tool_responses = []
            for tc in tool_calls:
                function_name = tc["function"]["name"]
                arguments = tc["function"]["arguments"]

                # Determine which MCP server/tool to call
                # Tool names are expected in format 'server_name__tool_name'
                if "__" not in function_name:
                    print(f"Invalid tool name format: {function_name}")
                    tool_responses.append({
                        "tool_call_id": tc["id"],
                        "output": f"Error: Invalid tool format. Expected server__tool: {function_name}"
                    })
                    continue

                server_name, tool_name = function_name.split("__", 1)
                print(f"Calling tool {tool_name} on server {server_name} with args {arguments}")
                try:
                    output = await call_tool(server_name, tool_name, arguments)
                    tool_responses.append({
                        "tool_call_id": tc["id"],
                        "output": output
                    })
                except (LookupError, RuntimeError) as e:
                    print(f"Tool call error: {e}")
                    tool_responses.append({
                        "tool_call_id": tc["id"],
                        "output": f"Error calling tool {function_name}: {str(e)}"
                    })

            # Add tool_responses to history and continue loop
            history_for_llm.append(data["choices"][0]["message"])
            history_for_llm.append({"role": "tool", "tool_calls": tool_calls, "content": tool_responses})
            payload["messages"] = history_for_llm

        try:
            content = data["choices"][0]["message"]["content"]
        except Exception:
            raise HTTPException(status_code=500, detail="Unerwartetes Antwortformat vom LLM-Backend.")

        # Store the assistant response so history is complete
        cursor.execute(
            "INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)",
            (chat_id, "assistant", content)
        )
        conn.commit()

        return ChatResponse(content=content, chat_id=chat_id)
    finally:
        conn.close()


@app.get("/api/chat/{chat_id}/history")
async def get_chat_history(chat_id: int):
    """Get message history for a specific chat."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT role, content, created_at FROM messages WHERE chat_id=? ORDER BY created_at",
            (chat_id,)
        )
        messages = cursor.fetchall()
        return [{"role": row["role"], "content": row["content"], "timestamp": row["created_at"]} for row in messages]
    finally:
        conn.close()


@app.get("/api/chats")
async def get_chats():
    """Get list of all chats (for sidebar)."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, created_at FROM chats ORDER BY created_at DESC")
        chats = cursor.fetchall()
        return [{"id": row["id"], "name": row["name"], "created_at": row["created_at"]} for row in chats]
    finally:
        conn.close()


@app.get("/api/history/search")
async def search_history(q: str = Query(..., min_length=1)):
    """Volltextsuche über alle Chat-Nachrichten (LIKE-Suche)."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT m.id, m.chat_id, c.name AS chat_name, m.role, m.content, m.created_at
            FROM messages m JOIN chats c ON c.id = m.chat_id
            WHERE m.content LIKE ?
            ORDER BY m.created_at DESC
            LIMIT 100
            """,
            (f"%{q}%",),
        )
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()


# ---------- Image-Endpoint (OpenAI-kompatibel) ----------

@app.post("/api/image", response_model=ImageResponse)
async def generate_image(req: ImageRequest):
    backend = get_image_backend()
    if not backend["base_url"]:
        raise HTTPException(status_code=500, detail="Image-Backend nicht konfiguriert (ENV/Config prüfen).")

    url = backend["base_url"].rstrip("/") + backend["endpoint"]

    payload = {
        "prompt": req.prompt,
        "n": req.n or 1,
        "size": req.size or "512x512",
    }

    headers = {"Content-Type": "application/json"}
    if backend["api_key"]:
        headers["Authorization"] = f"Bearer {backend['api_key']}"

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(url, json=payload, headers=headers)
        if resp.status_code != 200:
            print("Upstream image error:", resp.status_code, resp.text)
            raise HTTPException(status_code=502, detail=f"Upstream-Fehler Image: {resp.status_code}")
        data = resp.json()
    except httpx.RequestError as e:
        print("Image HTTP error:", e)
        raise HTTPException(status_code=502, detail="Image-Backend nicht erreichbar.")

    urls: List[ImageUrl] = []
    try:
        for item in data.get("data", []):
            if "url" in item:
                urls.append(ImageUrl(url=item["url"]))
    except Exception:
        raise HTTPException(status_code=500, detail="Unerwartetes Antwortformat vom Image-Backend.")

    return ImageResponse(images=urls)


# ---------- MCP-Proxy-Gerüst ----------

@app.get("/api/mcp/tools")
async def list_mcp_tools():
    """Aggregiert die Tool-Listen aller konfigurierten MCP-Server."""
    servers = fetch_all_server_tools()
    return {
        "enabled": bool(servers),
        "servers": [
            {"name": name, "tools": tools}
            for name, tools in servers.items()
        ],
    }


# ---------- MCP-Proxy-Endpoints ----------

@app.get("/api/mcp/servers")
async def mcp_servers():
    """Listet konfigurierte MCP-Server (ohne API-Keys)."""
    return {
        "servers": [
            {**s, "api_key": "***"} if s.get("api_key") else s
            for s in get_mcp_servers()
        ]
    }


@app.post("/api/mcp/{server_name}/{path:path}")
async def mcp_proxy(server_name: str, path: str, request: Request):
    """
    Proxyt POST/PUT/PATCH/GET/DELETE an den konfigurierten MCP-Server.
    Beispiel: POST /api/mcp/myserver/tools/call
    """
    try:
        body = await request.json()
    except Exception:
        body = {}
    try:
        return await proxy_request(server_name, path, request.method, body)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"MCP-Server nicht erreichbar: {e}")


# ---------- Admin Settings Endpoints ----------

def _validated(items: Any, model) -> List[Dict[str, Any]]:
    """Validiert eine eingehende Liste gegen das Pydantic-Model; wirft 422 bei ungültigen Einträgen."""
    if not isinstance(items, list):
        raise HTTPException(status_code=422, detail="Erwartet eine Liste.")
    try:
        return [m.model_dump(exclude_unset=True) for m in (model(**i) for i in items)]
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=e.errors(include_url=False))


@app.get("/api/admin/config", dependencies=[Depends(verify_admin)])
async def get_admin_config():
    """Retrieves all admin configuration (includes unmasked API keys)."""
    cfg = load_config()
    return cfg


@app.post("/api/admin/config/update", dependencies=[Depends(verify_admin)])
async def update_admin_config(new_cfg: Dict[str, Any] = Body(...)):
    """
    Updates administrative configuration including providers, models, and MCP servers.
    Only accessible with admin authentication.
    """
    cfg = load_config()

    # Update providers
    if "providers" in new_cfg:
        providers = _validated(new_cfg["providers"], ProviderConfig)
        current = {p.get("id"): p for p in cfg.get("providers", [])}
        updated = []
        for p in providers:
            base = current.get(p.get("id"), {})
            merged = {**base}
            for k, v in p.items():
                if v is None or (k == "api_key" and v in ("", "***")):
                    continue
                merged[k] = v
            if not merged.get("id"):
                slug = (merged.get("name") or "provider").strip().lower()
                slug = "".join(c if c.isalnum() else "-" for c in slug).strip("-")
                if not slug:
                    slug = "provider"
                merged["id"] = slug
            updated.append(merged)
        cfg["providers"] = updated

    # Update models
    if "models" in new_cfg:
        models = _validated(new_cfg["models"], ModelConfig)
        current = {m.get("id"): m for m in cfg.get("models", [])}
        updated = []
        for m in models:
            base = current.get(m.get("id"), {})
            merged = {**base, "name": m.get("name"), "id": m.get("id")}
            updated.append(merged)
        cfg["models"] = updated

    # Update MCP servers
    if "mcp_servers" in new_cfg:
        cfg["mcp_servers"] = _validated(new_cfg["mcp_servers"], McpServerConfig)

    # Update core sections
    for section in ("chat", "image", "mcp"):
        if section in new_cfg and isinstance(new_cfg[section], dict):
            inner = cfg.get(section, {})
            inner.update({k: v for k, v in new_cfg[section].items() if v is not None})
            cfg[section] = inner

    save_config(cfg)
    return {"status": "ok"}


# ---------- Static files (Frontend) ----------

app.mount("/", StaticFiles(directory="frontend", html=True), name="static")
