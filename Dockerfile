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

# --- Stage 2: build the server ----------------------------------------------
FROM rust:1-slim-bookworm AS server
WORKDIR /app/server

COPY server/ ./
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/app/server/target \
    cargo build --release --locked \
    && cp target/release/notes-again-server /usr/local/bin/notes-again

# --- Stage 3: runtime -----------------------------------------------------------
FROM debian:bookworm-slim AS runtime
WORKDIR /app

# Litestream: optional continuous SQLite backup to S3-compatible storage, SFTP, etc.
ARG LITESTREAM_VERSION=0.5.17
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates wget \
    && case "$(dpkg --print-architecture)" in \
         amd64) ls_arch=x86_64 ;; \
         arm64) ls_arch=arm64 ;; \
         *) echo "No Litestream build for $(dpkg --print-architecture)" >&2; exit 1 ;; \
       esac \
    && wget -qO /tmp/litestream.tar.gz \
       "https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-${LITESTREAM_VERSION}-linux-${ls_arch}.tar.gz" \
    && tar -C /usr/local/bin -xzf /tmp/litestream.tar.gz litestream \
    && rm /tmp/litestream.tar.gz \
    && apt-get purge -y --auto-remove wget \
    && rm -rf /var/lib/apt/lists/*

COPY --from=server /usr/local/bin/notes-again /usr/local/bin/notes-again
COPY --from=frontend /app/frontend/dist/client ./frontend
COPY litestream.yml /etc/litestream.yml
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

ENV DB_PATH=/data/notes-again.db \
    FRONTEND_DIST=/app/frontend \
    PORT=8000
VOLUME ["/data"]
EXPOSE 8000

ENTRYPOINT ["./docker-entrypoint.sh"]
