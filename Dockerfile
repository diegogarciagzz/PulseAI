# PULSE AI: one container serving the FastAPI backend and the built React frontend.
#   docker build -t pulseai .
#   docker run -p 8000:8000 pulseai            (demo mode, no Azure needed)

# ---- 1. frontend build -------------------------------------------------------------
FROM node:24-slim AS web
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- 2. runtime --------------------------------------------------------------------
FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    PULSE_STATIC_DIR=/app/frontend/dist PULSE_AI_MODE=auto
WORKDIR /app
COPY backend/requirements-runtime.txt backend/requirements-runtime.txt
RUN pip install -r backend/requirements-runtime.txt
COPY backend/app backend/app
COPY data data
COPY --from=web /src/frontend/dist frontend/dist
RUN useradd --create-home --uid 10001 pulse && chown -R pulse /app
USER pulse
WORKDIR /app/backend
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
