# Nodus Sonare: one image per commit (API + built web UI). Built once per pipeline run as nodus-sonare:<sha>
# and deployed to every environment with a different configuration (deploy/env/<env>.env).

# --- 1. Frontend: Vite build -> /web/dist -------------------------------------------------------------------
FROM node:22-alpine AS web
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
RUN npm run build

# --- 2. Runtime: Python 3.13 + locked dependencies -----------------------------------------------------------
FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:0.11.31 /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PATH="/app/.venv/bin:$PATH"

# Dependencies first (cached layer): only changes when pyproject.toml / uv.lock change
COPY backend/pyproject.toml backend/uv.lock backend/.python-version ./
RUN uv sync --locked --no-dev --no-install-project

COPY backend/app ./app
COPY backend/scripts ./scripts
COPY --from=web /web/dist ./frontend

# The artifact identifies itself: GET /api/version answers the commit it was built from.
ARG GIT_SHA=unknown
ENV APP_VERSION=$GIT_SHA \
    APP_ENV=unset \
    FRONTEND_DIST=/app/frontend \
    SQLITE_PATH=/app/data/users.db
LABEL org.opencontainers.image.revision=$GIT_SHA

EXPOSE 5002
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "5002"]
