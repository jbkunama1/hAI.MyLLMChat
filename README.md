# hAI.MyLLMChat

<p align="center">
  <img src="./logo_chat.png" alt="hAI.MyLLMChat Logo" width="140" />
</p>

<!-- badges: start -->
![Repo size](https://img.shields.io/github/repo-size/jbkunama1/hAI.MyLLMChat)
![Last commit](https://img.shields.io/github/last-commit/jbkunama1/hAI.MyLLMChat)
![License](https://img.shields.io/github/license/jbkunama1/hAI.MyLLMChat)
![Docker](https://img.shields.io/badge/docker-ready-blue)
![GitHub Pages](https://img.shields.io/badge/docs-GitHub%20Pages-lightgrey)
<!-- badges: end -->

Schlanke, stylische Open-WebUI-Alternative auf Basis von FastAPI + SQLite (kein Postgres/Redis/Node nötig). Läuft als **ein einziger, schlanker Docker-Container** und wird komplett über Environment-Variablen konfiguriert.

## Features

- Chat mit beliebigen **OpenAI-kompatiblen Servern** (OpenRouter, LM Studio, Ollama `/v1`, vLLM, Groq, etc.) – angebunden über `/chat/completions`
- **Bildgenerierung** über OpenAI-kompatible `/images/generations` Endpunkte
- **MCP-Server-Anbindung** über das `mcpo` Proxy-Muster (MCP → OpenAPI) – Konfiguration via ENV
- Chatverlauf (in einer späteren Ausbaustufe) in **SQLite**, persistiert über ein Docker-Volume
- **Mobile-responsive**, dunkles, modernes UI ohne Build-Step (reines HTML/CSS/JS, kein Node/React nötig im Container)
- ENV-basierte Konfiguration aller Backends (Chat, Image, MCP)

## Architektur

```text
 backend/main.py      FastAPI-App: API + Static-File-Server
 frontend/            Vanilla JS/HTML/CSS, wird direkt vom Backend ausgeliefert
 Dockerfile           python:3.12-slim, ein Layer, ein Prozess (uvicorn)
 docker-compose.yml   Fertiger Stack für Portainer (ENV-Platzhalter)
```

Daten (SQLite-Datei) liegen in `/data` im Container, gemountet über das Volume `hai_data`.

## Deployment über Portainer (Repository-Stack)

1. In Portainer: **Stacks → Add stack**
2. Build method: **Repository**
3. Repository URL: `https://github.com/jbkunama1/hAI.MyLLMChat`
4. Repository reference: `refs/heads/main`
5. Compose path: `docker-compose.yml` (Standard)
6. Netzwerk sicherstellen (einmalig auf dem Host):

   ```bash
   docker network create highfishNetwork
   ```

7. **Deploy the stack** klicken

Standardmäßig wird der Service im externen Netzwerk `highfishNetwork` gestartet und die FastAPI-App auf Port **8066 → 8080** gemappt:

- Host-URL: `http://<host>:8066`
- FastAPI lauscht im Container intern auf Port `8080`.

## docker-compose.yml (Ausschnitt)

```yaml
services:
  hai-myllmchat:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: hai-myllmchat
    restart: unless-stopped
    ports:
      - "8066:8080"
    volumes:
      - hai_data:/data
    environment:
      - DATA_DIR=/data
      - TZ=Europe/Berlin

      # Default Chat Backend (z.B. OpenRouter, OpenAI, Ollama)
      - HAI_DEFAULT_CHAT_NAME=${HAI_DEFAULT_CHAT_NAME}
      - HAI_DEFAULT_CHAT_BASE_URL=${HAI_DEFAULT_CHAT_BASE_URL}
      - HAI_DEFAULT_CHAT_API_KEY=${HAI_DEFAULT_CHAT_API_KEY}
      - HAI_DEFAULT_CHAT_MODEL=${HAI_DEFAULT_CHAT_MODEL}

      # Default Image Backend
      - HAI_DEFAULT_IMAGE_NAME=${HAI_DEFAULT_IMAGE_NAME}
      - HAI_DEFAULT_IMAGE_BASE_URL=${HAI_DEFAULT_IMAGE_BASE_URL}
      - HAI_DEFAULT_IMAGE_API_KEY=${HAI_DEFAULT_IMAGE_API_KEY}
      - HAI_DEFAULT_IMAGE_ENDPOINT=${HAI_DEFAULT_IMAGE_ENDPOINT}

      # MCP Gateway
      - HAI_MCP_ENABLED=${HAI_MCP_ENABLED}
      - HAI_MCP_BASE_URL=${HAI_MCP_BASE_URL}
      - HAI_MCP_TOKEN=${HAI_MCP_TOKEN}

    networks:
      - highfishNetwork

volumes:
  hai_data:
    driver: local

networks:
  highfishNetwork:
    external: true
```

## ENV-Konfiguration

Dieses Projekt ist komplett über Environment-Variablen konfigurierbar:

- Chat:
  - `HAI_DEFAULT_CHAT_NAME`
  - `HAI_DEFAULT_CHAT_BASE_URL`
  - `HAI_DEFAULT_CHAT_API_KEY`
  - `HAI_DEFAULT_CHAT_MODEL`
- Image:
  - `HAI_DEFAULT_IMAGE_NAME`
  - `HAI_DEFAULT_IMAGE_BASE_URL`
  - `HAI_DEFAULT_IMAGE_API_KEY`
  - `HAI_DEFAULT_IMAGE_ENDPOINT`
- MCP:
  - `HAI_MCP_ENABLED`
  - `HAI_MCP_BASE_URL`
  - `HAI_MCP_TOKEN`

Die Variablen werden im Container über `docker-compose.yml` nur als Platzhalter (`${...}`) gesetzt und können in Portainer oder einer `.env`-Datei für jede Umgebung frei belegt werden.

### Beispiel: OpenRouter als Backend

```env
HAI_DEFAULT_CHAT_NAME=OpenRouter
HAI_DEFAULT_CHAT_BASE_URL=https://openrouter.ai/api/v1
HAI_DEFAULT_CHAT_API_KEY=sk-or-...
HAI_DEFAULT_CHAT_MODEL=gpt-4o-mini

HAI_DEFAULT_IMAGE_NAME=OpenRouter-Images
HAI_DEFAULT_IMAGE_BASE_URL=https://openrouter.ai/api/v1
HAI_DEFAULT_IMAGE_API_KEY=sk-or-...
HAI_DEFAULT_IMAGE_ENDPOINT=/images/generations

HAI_MCP_ENABLED=false
HAI_MCP_BASE_URL=
HAI_MCP_TOKEN=
```

## API-Endpunkte (Backend)

- `GET /api/health` – Healthcheck (für Docker HEALTHCHECK)
- `GET /api/config` – gibt die aktuell konfigurierten Backends (Chat, Image, MCP) aus den ENV-Variablen zurück
- `POST /api/chat` – Chat-Endpoint, ruft ein OpenAI-kompatibles Backend (`/chat/completions`) auf
- `POST /api/image` – Bildgenerierung, ruft `/images/generations` auf
- `GET /api/mcp/tools` – MCP-Stub (kann später an ein MCP-Gateway angebunden werden)

Das Frontend (`frontend/index.html`, `style.css`, `app.js`) wird direkt über FastAPI als Static Files auf `/` ausgeliefert.

## Lokal ohne Docker testen

```bash
pip install -r requirements.txt
DATA_DIR=./data uvicorn backend.main:app --reload --port 8080
```

UI: `http://localhost:8080`

## Lizenz

MIT – frei nutzbar und anpassbar.
