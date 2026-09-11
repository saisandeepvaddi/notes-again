# syntax=docker/dockerfile:1

# --- Stage 1: build the SPA -------------------------------------------------
FROM node:22-slim AS frontend
WORKDIR /app/frontend

RUN corepack enable && corepack prepare pnpm@10.6.4 --activate

# Firebase web config is baked into the bundle at build time. These values are
# not secrets (client-side config), but the build fails loudly without them so a
# production image is never shipped with auth disabled.
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY \
    VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN \
    VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID

COPY frontend/ ./
RUN pnpm install --frozen-lockfile && pnpm build
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
COPY backend/pyproject.toml backend/uv.lock ./backend/
RUN cd backend && uv sync --frozen --no-dev
ENV PATH="/app/backend/.venv/bin:$PATH"

COPY backend/ ./backend/
COPY --from=frontend /app/frontend/dist/client ./frontend/dist/client
COPY litestream.yml /etc/litestream.yml
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

ENV DB_PATH=/data/note-and-learn.db \
    FRONTEND_DIST=/app/frontend/dist/client \
    PORT=8000
VOLUME ["/data"]
EXPOSE 8000

ENTRYPOINT ["./docker-entrypoint.sh"]
