.PHONY: help install install-backend install-frontend install-extension \
	dev-backend dev-frontend dev-extension dev-extension-firefox \
	build build-frontend build-extension build-extension-firefox zip-extension docker-build \
	check check-backend check-frontend check-extension \
	test test-backend test-extension test-e2e test-e2e-ui test-e2e-headed \
	deploy

help:
	@echo "Setup:"
	@echo "  make install                  - install backend, frontend and extension deps"
	@echo ""
	@echo "Dev:"
	@echo "  make dev-backend              - FastAPI on :8000 (auth disabled, CORS for :5273)"
	@echo "  make dev-frontend             - Vite dev server on :5273"
	@echo "  make dev-extension            - extension dev mode in Chrome, with reload"
	@echo "  make dev-extension-firefox    - extension dev mode in Firefox"
	@echo ""
	@echo "Build:"
	@echo "  make build                    - frontend SPA + Chrome and Firefox extensions"
	@echo "  make build-frontend           - SPA into frontend/dist/client"
	@echo "  make build-extension          - Chrome extension into extension/dist/chrome-mv3"
	@echo "  make build-extension-firefox  - Firefox extension into extension/dist/firefox-mv3"
	@echo "  make zip-extension            - zipped Chrome and Firefox packages in extension/dist"
	@echo "  make docker-build             - build the production image locally"
	@echo ""
	@echo "Check:"
	@echo "  make check                    - lint + typecheck everything"
	@echo ""
	@echo "Test:"
	@echo "  make test                     - backend pytest + extension vitest + frontend e2e"
	@echo "  make test-backend             - backend pytest suite"
	@echo "  make test-extension           - extension vitest suite"
	@echo "  make test-e2e                 - frontend Playwright e2e suite (headless)"
	@echo "  make test-e2e-ui              - e2e suite in Playwright's interactive UI mode"
	@echo "  make test-e2e-headed          - e2e suite with a visible browser window"
	@echo ""
	@echo "Deploy:"
	@echo "  make deploy                   - push main and rebuild on the VPS (needs VPS_USER, VPS_HOST)"

install: install-backend install-frontend install-extension

install-backend:
	cd backend && uv sync

install-frontend:
	cd frontend && pnpm install

install-extension:
	cd extension && pnpm install

dev-backend:
	env -u DB_PATH AUTH_DISABLED=1 CORS_ORIGINS=http://localhost:5273 \
		backend/.venv/bin/uvicorn --app-dir backend main:app --reload

dev-frontend:
	cd frontend && pnpm dev

dev-extension:
	cd extension && pnpm dev

dev-extension-firefox:
	cd extension && pnpm dev:firefox

build: build-frontend build-extension build-extension-firefox

build-frontend:
	cd frontend && pnpm build

build-extension:
	cd extension && pnpm build

build-extension-firefox:
	cd extension && pnpm build:firefox

zip-extension:
	cd extension && pnpm zip && pnpm zip:firefox

docker-build:
	docker compose build

check: check-backend check-frontend check-extension

check-backend:
	cd backend && .venv/bin/ruff check .

check-frontend:
	cd frontend && pnpm typecheck && pnpm lint

check-extension:
	cd extension && pnpm typecheck

test: test-backend test-extension test-e2e

test-backend:
	cd backend && .venv/bin/python -m pytest

test-extension:
	cd extension && pnpm test

test-e2e:
	cd frontend && pnpm test:e2e

test-e2e-ui:
	cd frontend && pnpm test:e2e:ui

test-e2e-headed:
	cd frontend && pnpm exec playwright test --headed

deploy:
	./deploy.sh
