.PHONY: help run serve install install-backend install-frontend install-extension install-mobile \
	dev-backend dev-frontend dev-extension dev-extension-firefox dev-mobile \
	build build-frontend build-extension build-extension-chrome build-extension-firefox zip-extension docker-build update \
	check check-backend check-frontend check-extension check-mobile \
	test test-backend test-frontend test-extension test-e2e test-e2e-ui test-e2e-headed \
	reset-login snapshot doctor deploy

help:
	@echo "Run:"
	@echo "  make run                      - install, build the SPA and serve the app (default http://127.0.0.1:8000)"
	@echo "  make run DB=path/to/notes.db  - same, with the database at a path you choose"
	@echo "  make serve                    - serve without reinstalling or rebuilding"
	@echo "  (settings come from .env.local, which ./install.sh writes)"
	@echo ""
	@echo "Setup:"
	@echo "  make install                  - install backend, frontend, extension and mobile deps"
	@echo ""
	@echo "Dev:"
	@echo "  make dev-backend              - FastAPI on :8000 (auth disabled, CORS for :5273)"
	@echo "  make dev-frontend             - Vite dev server on :5273"
	@echo "  make dev-extension            - extension dev mode in Chrome, with reload"
	@echo "  make dev-extension-firefox    - extension dev mode in Firefox"
	@echo "  make dev-mobile               - Expo dev server for the mobile app (open in Expo Go)"
	@echo ""
	@echo "Build:"
	@echo "  make build                    - frontend SPA + Chrome and Firefox extensions"
	@echo "  make build-frontend           - SPA into frontend/dist/client"
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
	@echo "  make test                     - backend pytest + extension vitest + frontend e2e"
	@echo "  make test-backend             - backend pytest suite"
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

run: install-backend install-frontend build-frontend
	DB='$(DB)' scripts/serve.sh

serve:
	DB='$(DB)' scripts/serve.sh

install: install-backend install-frontend install-extension install-mobile

install-backend:
	cd backend && uv sync

install-frontend:
	cd frontend && pnpm install

install-extension:
	cd extension && pnpm install

install-mobile:
	cd mobile && pnpm install

dev-backend:
	env -u DB_PATH AUTH_DISABLED=1 CORS_ORIGINS=http://localhost:5273 \
		backend/.venv/bin/uvicorn --app-dir backend main:app --reload

dev-frontend:
	cd frontend && pnpm dev

dev-extension:
	cd extension && pnpm dev

dev-extension-firefox:
	cd extension && pnpm dev:firefox

dev-mobile:
	cd mobile && pnpm start

build: build-frontend build-extension

build-frontend:
	cd frontend && pnpm build

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

check: check-backend check-frontend check-extension check-mobile

check-backend:
	cd backend && .venv/bin/ruff check .

check-frontend:
	cd frontend && pnpm typecheck && pnpm lint

check-extension:
	cd extension && pnpm typecheck

check-mobile:
	cd mobile && pnpm typecheck && pnpm lint

test: test-backend test-frontend test-extension test-e2e

test-backend:
	cd backend && .venv/bin/python -m pytest

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

reset-login:
	env -u DB_PATH $(if $(DB),DB_PATH=$(DB)) backend/.venv/bin/python backend/cli.py reset-login

snapshot:
	env -u DB_PATH $(if $(DB),DB_PATH=$(DB)) backend/.venv/bin/python backend/cli.py snapshot

doctor:
	env -u DB_PATH -u FRONTEND_DIST $(if $(DB),DB_PATH=$(DB)) backend/.venv/bin/python backend/cli.py doctor

deploy:
	./deploy.sh
