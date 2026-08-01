# hAI.MyLLMChat

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
HAI_CHAT_API_KEY=
HAI_IMAGE_API_KEY=
HAI_MCP_API_KEY=
```

## Deployment mit GHCR + Portainer

### Überblick

- GitHub Actions baut bei jedem Push auf `main` automatisch ein Docker‑Image und pusht es nach GHCR:
  - `ghcr.io/jbkunama1/hai-myllmchat:latest`
  - `ghcr.io/jbkunama1/hai-myllmchat:<commit-sha>`
- Portainer pullt das Image und startet den Container.

### Workflows

- **Auto‑Build** (`.github/workflows/auto-build-ghcr.yml`):
  - Trigger: `push` auf `main`
  - Baut und pusht automatisch nach GHCR.
- **Manueller Build** (`.github/workflows/manual-build-ghcr.yml`):
  - Trigger: `workflow_dispatch` (Button in GitHub Actions)
  - Ermö¿¿¹glicht manuelles Auslö¿¿¹sen des Builds mit Parametern.

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

## Sicherheitshinweis

- Standard‑Passwort (`changeme`) unbedingt ändern.
- Vor einem öffentlichen Zugriff HTTPS und Authentifizierung vorsehen (z.B. Reverse Proxy + Auth).

## Lizenz

Siehe `LICENSE` im Repository.
