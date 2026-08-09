FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    DATA_DIR=/data

# Build-Args aus GitHub Secrets (z. B. ADMIN_TOKEN, MCP_API_KEY, DOCKER_REGISTRY)
ARG ADMIN_TOKEN=
ARG MCP_API_KEY=
ARG DOCKER_REGISTRY=
ENV HAI_ADMIN_TOKEN=$ADMIN_TOKEN \
    HAI_MCP_API_KEY=$MCP_API_KEY \
    DOCKER_REGISTRY=$DOCKER_REGISTRY

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend ./backend
COPY frontend ./frontend

RUN mkdir -p /data

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/api/health')" || exit 1

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8080"]
