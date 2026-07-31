FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    DATA_DIR=/data

WORKDIR /app

# Abhängigkeiten installieren
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Backend und Frontend in das Image kopieren
COPY backend ./backend
COPY frontend ./frontend

# Datenverzeichnis für SQLite / config.json
RUN mkdir -p /data

# Port des FastAPI-Backends im Container
EXPOSE 8080

# Healthcheck: prüft /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/api/health')" || exit 1

# Startkommando: FastAPI via uvicorn
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8080"]
