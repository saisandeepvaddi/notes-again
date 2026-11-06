.PHONY: help run serve install install-server install-frontend install-extension install-mobile install-desktop \
	dev-server dev-frontend dev-extension dev-extension-firefox dev-mobile dev-desktop \
	build build-server build-frontend build-desktop build-extension build-extension-chrome build-extension-firefox zip-extension docker-build update \
	check check-server check-frontend check-extension check-mobile \
	test test-server test-frontend test-extension test-e2e test-e2e-ui test-e2e-headed \
	reset-login snapshot doctor deploy

SERVER := server/target/release/notes-again-server

help:
	@echo "Run:"
	@echo "  make run                      - install, build the SPA and serve the app (default http://127.0.0.1:8000)"
	@echo "  make run DB=path/to/notes.db  - same, with the database at a path you choose"
	@echo "  make serve                    - serve without reinstalling or rebuilding"
	@echo "  (settings come from .env.local, which ./install.sh writes)"
	@echo ""
	@echo "Setup:"
	@echo "  make install                  - build the server and install frontend, extension and mobile deps"
	@echo ""
	@echo "Dev:"
	@echo "  make dev-server               - Rust server on :8000 (auth disabled, CORS for :5273)"
	@echo "  make dev-frontend             - Vite dev server on :5273"
	@echo "  make dev-extension            - extension dev mode in Chrome, with reload"
	@echo "  make dev-extension-firefox    - extension dev mode in Firefox"
	@echo "  make dev-mobile               - Expo dev server for the mobile app (open in Expo Go)"
	@echo "  make dev-desktop              - desktop app against the repo's backend and SPA build"
	@echo ""
	@echo "Build:"
	@echo "  make build                    - frontend SPA + Chrome and Firefox extensions"
	@echo "  make build-server             - release server binary into server/target/release"
	@echo "  make build-frontend           - SPA into frontend/dist/client"
	@echo "  make build-desktop            - desktop installers for this OS into desktop/src-tauri/target/release/bundle"
	@echo "  make build-extension          - Chrome and Firefox extensions"
	@echo "  make build-extension-chrome   - Chrome extension into extension/dist/chrome-mv3"
	@echo "  make build-extension-firefox  - Firefox extension into extension/dist/firefox-mv3"
	@echo "  make zip-extension            - zipped Chrome and Firefox packages in extension/dist"
	@echo "  make docker-build             - build the production image locally"
	@echo "  make update                   - pull the latest code and rebuild/restart the Docker app"
	@echo ""
	@echo "Check:"
	@echo "  make check                    - lint + typecheck everything"
	@echo ""
	@echo "Test:"
	@echo "  make test                     - server tests + frontend and extension vitest + e2e"
	@echo "  make test-server              - server cargo tests"
	@echo "  make test-frontend            - frontend vitest unit tests"
	@echo "  make test-extension           - extension vitest suite"
	@echo "  make test-e2e                 - frontend Playwright e2e suite (headless)"
	@echo "  make test-e2e-ui              - e2e suite in Playwright's interactive UI mode"
	@echo "  make test-e2e-headed          - e2e suite with a visible browser window"
	@echo ""
	@echo "Maintenance (add DB=path to target another database):"
	@echo "  make reset-login              - reset sign-in to a temporary admin password"
	@echo "  make snapshot                 - write a local database snapshot now"
	@echo "  make doctor                   - print the effective setup and check it"
	@echo ""
	@echo "Deploy:"
	@echo "  make deploy                   - push main and rebuild on the VPS (needs VPS_USER, VPS_HOST)"

run: build-server install-frontend build-frontend
	DB='$(DB)' scripts/serve.sh

serve:
	DB='$(DB)' scripts/serve.sh

install: build-server install-frontend install-extension install-mobile install-desktop

build-server:
	cd server && cargo build --release --locked

install-frontend:
	cd frontend && pnpm install

install-extension:
	cd extension && pnpm install

install-mobile:
	cd mobile && pnpm install

install-desktop:
	cd desktop && pnpm install

dev-server:
	cd server && env -u DB_PATH AUTH_DISABLED=1 CORS_ORIGINS=http://localhost:5273 cargo run -- serve

dev-frontend:
	cd frontend && pnpm dev

dev-extension:
	cd extension && pnpm dev

dev-extension-firefox:
	cd extension && pnpm dev:firefox

dev-mobile:
	cd mobile && pnpm start

dev-desktop:
	cd desktop && pnpm dev

build: build-server build-frontend build-extension

build-frontend:
	cd frontend && pnpm build

build-desktop:
	cd desktop && pnpm build

build-extension: build-extension-chrome build-extension-firefox

build-extension-chrome:
	cd extension && pnpm build

build-extension-firefox:
	cd extension && pnpm build:firefox

zip-extension:
	cd extension && pnpm zip && pnpm zip:firefox

docker-build:
	docker compose build

update:
	git pull --ff-only
	docker compose up -d --build

check: check-server check-frontend check-extension check-mobile

check-server:
	cd server && cargo fmt --check && cargo clippy --all-targets -- -D warnings

check-frontend:
	cd frontend && pnpm typecheck && pnpm lint

check-extension:
	cd extension && pnpm typecheck

check-mobile:
	cd mobile && pnpm typecheck && pnpm lint

test: test-server test-frontend test-extension test-e2e

test-server:
	cd server && cargo test

test-extension:
	cd extension && pnpm test

test-frontend:
	cd frontend && pnpm test

test-e2e:
	cd frontend && pnpm test:e2e

test-e2e-ui:
	cd frontend && pnpm test:e2e:ui

test-e2e-headed:
	cd frontend && pnpm exec playwright test --headed

reset-login: build-server
	env -u DB_PATH $(if $(DB),DB_PATH=$(DB)) $(SERVER) reset-login

snapshot: build-server
	env -u DB_PATH $(if $(DB),DB_PATH=$(DB)) $(SERVER) snapshot

doctor: build-server
	env -u DB_PATH $(if $(DB),DB_PATH=$(DB)) FRONTEND_DIST=frontend/dist/client $(SERVER) doctor

deploy:
	./deploy.sh
