# syntax=docker/dockerfile:1

# --- Stage 1: build the SPA -------------------------------------------------
FROM node:22-slim AS frontend
WORKDIR /app/frontend

RUN corepack enable && corepack prepare pnpm@10.6.4 --activate

# Deps first (cached unless the lockfile changes); the pnpm store is a cache
# mount so even a lockfile change only fetches the packages that are new.
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store

COPY frontend/ ./
RUN pnpm build
# Output we care about: /app/frontend/dist/client (index.html + assets)

# --- Stage 2: python runtime ---------------------------------------------------
FROM python:3.14-slim AS runtime
WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Litestream: continuous SQLite backup to an S3-compatible target (R2).
ARG LITESTREAM_VERSION=0.3.13
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates wget \
    && wget -qO /tmp/litestream.tar.gz \
       "https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-v${LITESTREAM_VERSION}-linux-$(dpkg --print-architecture).tar.gz" \
    && tar -C /usr/local/bin -xzf /tmp/litestream.tar.gz \
    && rm /tmp/litestream.tar.gz \
    && apt-get purge -y --auto-remove wget \
    && rm -rf /var/lib/apt/lists/*

# Python deps first (cached unless pyproject/lock change).
ENV UV_LINK_MODE=copy UV_COMPILE_BYTECODE=1
COPY backend/pyproject.toml backend/uv.lock ./backend/
RUN --mount=type=cache,target=/root/.cache/uv \
    cd backend && uv sync --frozen --no-dev
ENV PATH="/app/backend/.venv/bin:$PATH"

COPY backend/ ./backend/
COPY --from=frontend /app/frontend/dist/client ./frontend/dist/client
COPY litestream.yml /etc/litestream.yml
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

ENV DB_PATH=/data/notes-again.db \
    FRONTEND_DIST=/app/frontend/dist/client \
    PORT=8000
VOLUME ["/data"]
EXPOSE 8000

ENTRYPOINT ["./docker-entrypoint.sh"]
