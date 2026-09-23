.PHONY: help test test-backend test-e2e test-e2e-ui test-e2e-headed

help:
	@echo "Available targets:"
	@echo "  make test             - run backend pytest + frontend e2e"
	@echo "  make test-backend     - run backend pytest suite"
	@echo "  make test-e2e         - run frontend Playwright e2e suite (headless)"
	@echo "  make test-e2e-ui      - run e2e suite in Playwright's interactive UI mode"
	@echo "  make test-e2e-headed  - run e2e suite with a visible browser window"

test: test-backend test-e2e

test-backend:
	cd backend && .venv/bin/python -m pytest

test-e2e:
	cd frontend && pnpm test:e2e

test-e2e-ui:
	cd frontend && pnpm test:e2e:ui

test-e2e-headed:
	cd frontend && pnpm exec playwright test --headed
