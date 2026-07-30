from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
async def health():
    return {"status": "ok"}

@app.get("/api/config")
async def config():
    return {
        "chat": {
            "name": os.getenv("HAI_DEFAULT_CHAT_NAME"),
            "base_url": os.getenv("HAI_DEFAULT_CHAT_BASE_URL"),
        },
        "image": {
            "name": os.getenv("HAI_DEFAULT_IMAGE_NAME"),
            "base_url": os.getenv("HAI_DEFAULT_IMAGE_BASE_URL"),
        },
        "mcp": {
            "enabled": os.getenv("HAI_MCP_ENABLED", "false").lower() == "true",
            "base_url": os.getenv("HAI_MCP_BASE_URL"),
        },
    }

# Static files (frontend)
app.mount("/", StaticFiles(directory="frontend", html=True), name="static")
