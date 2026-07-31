# hAI.MyLLMChat

<!-- badges: start -->
![Repo size](https://img.shields.io/github/repo-size/jbkunama1/hAI.MyLLMChat)
![Last commit](https://img.shields.io/github/last-commit/jbkunama1/hAI.MyLLMChat)
![License](https://img.shields.io/github/license/jbkunama1/hAI.MyLLMChat)
![Docker](https://img.shields.io/badge/docker-ready-blue)
![GitHub Pages](https://img.shields.io/badge/docs-GitHub%20Pages-lightgrey)
<!-- badges: end -->

Schlanke, stylische Open-WebUI-Alternative auf Basis von FastAPI + SQLite (kein Postgres/Redis/Node nötig). Läuft als **ein einziger, schlanker Docker-Container**.

## Features

- Chat mit beliebigen **OpenAI-kompatiblen Servern** (OpenRouter, LM Studio, Ollama `/v1`, vLLM, Groq, etc.) – beliebig viele Verbindungen gleichzeitig anlegen
- **Bildgenerierung** über OpenAI-kompatible `/images/generations` Endpunkte
- **MCP-Server-Anbindung** über das `mcpo` Proxy-Muster (MCP → OpenAPI). Einfach die Basis-URL eines laufenden `mcpo`-Servers eintragen, Tools werden automatisch geladen und aufrufbar
- Chatverlauf in **SQLite**, persistiert über ein Docker-Volume
- **Mobile-responsive**, dunkles, modernes UI ohne Build-Step (reines HTML/CSS/JS, kein Node/React nötig im Container)
- Streaming-Antworten (SSE)

## Architektur

```text
 backend/main.py      FastAPI-App: API + Static-File-Server (1 Datei, schlank)
 frontend/            Vanilla JS/HTML/CSS, wird direkt vom Backend ausgeliefert
 Dockerfile           python:3.12-slim, ein Layer, ein Prozess (uvicorn)
 docker-compose.yml   Fertiger Stack für Portainer
```

Daten (SQLite-Datei) liegen in `/data` im Container, gemountet über das Volume `hai_data`.

## Deployment über Portainer (Repository-Stack)

1. In Portainer: **Stacks → Add stack**
2. Build method: **Repository**
3. Repository URL: `https://github.com/jbkunama1/hAI.MyLLMChat`
4. Repository reference: `refs/heads/main`
5. Compose path: `docker-compose.yml` (Standard)
6. **Deploy the stack** klicken

Portainer klont das Repo, baut das Image lokal (kein extra Registry-Push nötig) und startet den Container. Danach ist die UI unter `http://<host>:8080` erreichbar.

Bei jedem `git push` auf `main` kannst du den Stack in Portainer einfach per **„Pull and redeploy“** aktualisieren.

## ENV-Konfiguration (Overview)

Dieses Projekt ist komplett über Environment-Variablen konfigurierbar:

- `HAI_DEFAULT_CHAT_NAME`, `HAI_DEFAULT_CHAT_BASE_URL`, `HAI_DEFAULT_CHAT_API_KEY`, `HAI_DEFAULT_CHAT_MODEL`
- `HAI_DEFAULT_IMAGE_NAME`, `HAI_DEFAULT_IMAGE_BASE_URL`, `HAI_DEFAULT_IMAGE_API_KEY`, `HAI_DEFAULT_IMAGE_ENDPOINT`
- `HAI_MCP_ENABLED`, `HAI_MCP_BASE_URL`, `HAI_MCP_TOKEN`

Die Variablen werden im Container über `docker-compose.yml` nur als Platzhalter (`${...}`) gesetzt und können in Portainer oder einer `.env`-Datei für jede Umgebung frei belegt werden.

## Lokal ohne Docker testen

```bash
pip install -r requirements.txt
DATA_DIR=./data uvicorn backend.main:app --reload --port 8080
```

## Lizenz

MIT – frei nutzbar und anpassbar.
