# hAI.MyLLMChat
[![Status](https://img.shields.io/badge/status-active-brightgreen?style=for-the-badge)](https://github.com/jbkunama1/hAI.MyLLMChat)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://github.com/jbkunama1/hAI.MyLLMChat)
[![LLM](https://img.shields.io/badge/LLM-OpenAI%20Compatible-10a37f?style=for-the-badge&logo=openai&logoColor=white)](https://github.com/jbkunama1/hAI.MyLLMChat)
[![MCP](https://img.shields.io/badge/MCP-Server-6f42c1?style=for-the-badge&logo=mcp&logoColor=white)](https://github.com/jbkunama1/hAI.MyLLMChat)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)




[![Buy me a coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/highfish)

Moderne Chat‑UI mit Unterstützung für:
- Text‑Chat über beliebige OpenAI‑kompatible APIs
- Bildgenerierung (z.B. über OpenRouter Images)
- Optional MCP (Model Context Protocol) Integration
- Lokale Konfiguration und Persistenz in `/data`
- Dark/Light Mode + Themes

## Schnellstart (lokal)

```bash
docker compose up -d
```

Dann öffnen: `http://localhost:8066`

Umgebungsvariablen (optional in `.env`):

```env
HAI_ADMIN_USER=admin
HAI_ADMIN_PASSWORD=changeme
HAI_ADMIN_TOKEN=

# Standard-Chat-Provider (OpenAI-kompatibel, z. B. OpenRouter)
HAI_CHAT_API_KEY=
HAI_DEFAULT_CHAT_BASE_URL=https://openrouter.ai/api/v1
HAI_DEFAULT_CHAT_MODEL=openai/gpt-4o-mini
HAI_DEFAULT_CHAT_NAME=OpenRouter

# Bildgenerierung (optional)
HAI_IMAGE_API_KEY=
HAI_DEFAULT_IMAGE_BASE_URL=
HAI_DEFAULT_IMAGE_NAME=

# MCP-Integration (optional)
HAI_MCP_API_KEY=
HAI_MCP_ENABLED=false
HAI_MCP_BASE_URL=
HAI_MCP_TOKEN=
```

### GitHub Secrets (für den CI/CD-Build)

Die folgenden Secrets müssen in den Repository Settings unter
**Settings → Secrets and variables → Actions** angelegt werden. Sie werden beim
Docker-Build als `build-args` übergeben und zur Laufzeit als `ENV` im Image abgelegt.

| Secret          | Beispielwert                                | Zweck                                    |
|-----------------|---------------------------------------------|------------------------------------------|
| `ADMIN_TOKEN`   | `sk-admin-9f3a...`                          | Admin-Token für die Container-App        |
| `MCP_API_KEY`   | `sk-mcp-2c8b...`                            | API-Key für die MCP-Integration          |

*Hinweis: `DOCKER_REGISTRY` wird nur als `build-arg` in GitHub Actions verwendet und muss nicht als Secret in den Container injiziert werden.*

Beispielwerte für `.env` (Laufzeit):
```env
ADMIN_TOKEN=sk-admin-9f3a...
MCP_API_KEY=sk-mcp-2c8b...
```

## Deployment mit GHCR + Portainer

### Überblick

- GitHub Actions baut bei jedem Push auf `main` automatisch ein Docker‑Image und pusht es nach GHCR:
  - `ghcr.io/jbkunama1/hai-myllmchat:latest`
  - `ghcr.io/jbkunama1/hai-myllmchat:<commit-sha>`
- Portainer pullt das Image und startet den Container.

### Workflows

- **Build & Push** (`.github/workflows/build-ghcr.yml`):
  - Trigger: `push` auf `main` **oder** manuell über `workflow_dispatch` (Button in GitHub Actions)
  - Beim manuellen Start kann optional ein `image_tag` angegeben werden (leer = `latest`)
  - Baut und pusht automatisch `latest` + Commit-SHA nach GHCR

### Portainer (Stack via Git)

1. In Portainer einen neuen **Stack** anlegen.
2. **Repository** wählen:
   - Repository URL: `https://github.com/jbkunama1/hAI.MyLLMChat`
   - Reference: `refs/heads/main`
   - Compose path: `docker-compose.yml`
3. Umgebungsvariablen setzen (z.B. im Stack oder via `.env`):
   - `HAI_ADMIN_USER`, `HAI_ADMIN_PASSWORD`, etc.
4. Stack deployen.

Bei jedem Push auf `main`:
- GitHub Actions baut neues Image und pusht nach GHCR.
- In Portainer den Stack öffnen → **Pull and redeploy** / **Recreate**.
- Portainer zieht das neue `ghcr.io/jbkunama1/hai-myllmchat:latest` und startet neu.

### Portainer (lokal mit docker compose)

Falls du den Stack nicht über Git, sondern lokal verwaltest:

```bash
# Image pullen
docker compose pull

# Container neu starten
docker compose up -d
```

Das `docker-compose.yml` ist bereits auf GHCR ausgelegt:
```yaml
services:
  hai-myllmchat:
    image: ghcr.io/jbkunama1/hai-myllmchat:latest
    # ...
```

## Konfiguration im Container

- Konfigurationsdatei: `/data/config.json`
- Wird über die Settings‑UI im Browser verwaltet.
- Daten (Chats, Uploads etc.) landen ebenfalls unter `/data`.

## Mehrere Provider

- Der Chat ist über beliebige OpenAI‑kompatible APIs nutzbar.
- Die Standard‑Provider lassen sich per Umgebungsvariablen setzen (`HAI_DEFAULT_CHAT_*`, `HAI_DEFAULT_IMAGE_*`).
- In der Settings‑UI können weitere Provider/Modelle hinterlegt und pro Chat gewechselt werden.
- Die MCP‑Integration wird über `HAI_MCP_ENABLED` aktiviert (Basis‑URL und Token über `HAI_MCP_BASE_URL` / `HAI_MCP_TOKEN`).

## Sicherheitshinweis

- Standard‑Passwort (`changeme`) unbedingt ändern.
- Vor einem öffentlichen Zugriff HTTPS und Authentifizierung vorsehen (z.B. Reverse Proxy + Auth).

## Lizenz

Siehe `LICENSE` im Repository.

