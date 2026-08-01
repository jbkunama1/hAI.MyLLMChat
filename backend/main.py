import os
import base64
from typing import Any, Dict, List

from fastapi import FastAPI, HTTPException, Depends, Header, Body, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx

from backend.config_store import load_config, save_config

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


# ---------- API-Schemas ----------

class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    model: str | None = None
    temperature: float | None = 0.7


class ChatResponse(BaseModel):
    content: str


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
    Aktuell nur das in der Config gesetzte Modell; kann später durch Provider-API ersetzt werden.
    """
    cfg = load_config()
    model = cfg.get("chat", {}).get("model")
    if model:
        return {"models": [model]}
    return {"models": []}


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


# ---------- Chat-Endpoint (OpenAI-kompatibel) ----------

@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    backend = get_chat_backend()

    if not backend["base_url"]:
        raise HTTPException(status_code=500, detail="Chat-Backend nicht konfiguriert (ENV/Config prüfen).")

    model = req.model or backend["model"]
    if not model:
        raise HTTPException(status_code=400, detail="Kein Modell angegeben (weder Config noch Request).")

    url = backend["base_url"].rstrip("/") + "/chat/completions"

    payload = {
        "model": model,
        "messages": [{"role": m.role, "content": m.content} for m in req.messages],
        "temperature": req.temperature,
        "stream": False,
    }

    headers = {"Content-Type": "application/json"}
    if backend["api_key"]:
        headers["Authorization"] = f"Bearer {backend['api_key']}"

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

    try:
        content = data["choices"][0]["message"]["content"]
    except Exception:
        raise HTTPException(status_code=500, detail="Unerwartetes Antwortformat vom LLM-Backend.")

    return ChatResponse(content=content)


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
    mcp = get_mcp_config()
    if not mcp["enabled"] or not mcp["base_url"]:
        return {"enabled": False, "tools": []}
    return {"enabled": True, "tools": []}


# ---------- Static files (Frontend) ----------

app.mount("/", StaticFiles(directory="frontend", html=True), name="static")
