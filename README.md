# hAI.MyLLMChat

Schlanke, stylische Open-WebUI-Alternative auf Basis von FastAPI + SQLite (kein Postgres/Redis/Node nötig). Läuft als **ein einziger, schlanker Docker-Container**.

## Features

- Chat mit beliebigen **OpenAI-kompatiblen Servern** (OpenRouter, LM Studio, Ollama `/v1`, vLLM, Groq, etc.) - beliebig viele Verbindungen gleichzeitig anlegen
- **Bildgenerierung** über OpenAI-kompatible `/images/generations` Endpunkte
- **MCP-Server-Anbindung** über das `mcpo` Proxy-Muster (MCP -> OpenAPI). Einfach die Basis-URL eines laufenden `mcpo`-Servers eintragen, Tools werden automatisch geladen und aufrufbar
- Chatverlauf in **SQLite**, persistiert über ein Docker-Volume
- **Mobile-responsive**, dunkles, modernes UI ohne Build-Step (reines HTML/CSS/JS, kein Node/React nötig im Container)
- Streaming-Antworten (SSE)

## Architektur

```
 backend/main.py      FastAPI-App: API + Static-File-Server (1 Datei, schlank)
 frontend/             Vanilla JS/HTML/CSS, wird direkt vom Backend ausgeliefert
 Dockerfile            python:3.12-slim, ein Layer, ein Prozess (uvicorn)
 docker-compose.yml    Fertiger Stack für Portainer
```

Daten (SQLite-Datei) liegen in `/data` im Container, gemountet über das Volume `hai_data`.

## Deployment über Portainer (Repository-Stack)

1. In Portainer: **Stacks -> Add stack**
2. Build method: **Repository**
3. Repository URL: `https://github.com/jbkunama1/hAI.MyLLMChat`
4. Repository reference: `refs/heads/main`
5. Compose path: `docker-compose.yml` (Standard)
6. **Deploy the stack** klicken

Portainer klont das Repo, baut das Image lokal (kein extra Registry-Push nötig) und startet den Container. Danach ist die UI unter `http://<host>:8080` erreichbar.

Bei jedem `git push` auf `main` kannst du den Stack in Portainer einfach per **"Pull and redeploy"** aktualisieren.

## Erste Schritte nach dem Start

1. UI öffnen, oben rechts auf **Einstellungen (Zahnrad)**
2. Unter **Verbindungen** eine Chat-Verbindung anlegen, z.B.:
   - Name: `OpenRouter`
   - Typ: `chat`
   - Base-URL: `https://openrouter.ai/api/v1`
   - API-Key: dein OpenRouter-Key
   - Modelle werden automatisch geladen (Button "Modelle laden")
3. Optional eine **Bild-Verbindung** anlegen (jeder Anbieter mit `/images/generations`, z.B. eigenes ComfyUI/Automatic1111-Gateway mit OpenAI-kompatiblem Wrapper)
4. Optional **MCP-Server** eintragen: dazu muss irgendwo ein `mcpo`-Prozess laufen (z.B. `docker run -p 8000:8000 ghcr.io/open-webui/mcpo -- <dein-mcp-server-cmd>`), dann einfach `http://<mcpo-host>:8000` als Basis-URL eintragen
5. Chatten - fertig

## Lokal ohne Docker testen

```bash
pip install -r requirements.txt
DATA_DIR=./data uvicorn backend.main:app --reload --port 8080
```

## Lizenz

MIT - frei nutzbar und anpassbar.
