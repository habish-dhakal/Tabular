# Tabular — task runner. `make` (or `make help`) lists everything.
# Cold start: `make setup` then `make dev` (+ `make worker` for automations).

PORT ?= 3100
COMPOSE := docker compose
COMPOSE_PROD := docker compose -f docker-compose.prod.yml -p tabular-prod

.DEFAULT_GOAL := help
.PHONY: help setup install env up down db-wait migrate generate seed studio \
        dev worker build start typecheck verify verify-logic verify-backend \
        verify-frontend prod-up prod-down prod-logs reset clean

help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | sort | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

## ---- Cold start --------------------------------------------------------

setup: install env up db-wait migrate seed ## Full cold start: deps, .env, docker, migrate, seed
	@echo "\n✓ Ready. Run 'make dev' (and 'make worker' for automations)."

install: ## Install node dependencies
	npm install

env: ## Create .env from .env.example if missing
	@test -f .env || (cp .env.example .env && echo "Created .env from .env.example — fill in secrets.")

## ---- Infra (Postgres + Redis) -----------------------------------------

up: ## Start Postgres + Redis (docker)
	$(COMPOSE) up -d

down: ## Stop Postgres + Redis
	$(COMPOSE) down

db-wait: ## Block until Postgres + Redis report healthy
	@echo "Waiting for Postgres + Redis to be healthy…"
	@until [ "$$(docker inspect -f '{{.State.Health.Status}}' tabular-db 2>/dev/null)" = "healthy" ]; do sleep 1; done
	@until [ "$$(docker inspect -f '{{.State.Health.Status}}' tabular-redis 2>/dev/null)" = "healthy" ]; do sleep 1; done
	@echo "✓ Infra healthy."

## ---- Database ----------------------------------------------------------

migrate: ## Apply Drizzle migrations
	npm run db:migrate

generate: ## Generate a migration from schema changes
	npm run db:generate

seed: ## Seed demo data
	npm run db:seed

studio: ## Open Drizzle Studio
	npm run db:studio

## ---- Run ---------------------------------------------------------------

dev: ## Run the app on :3100
	PORT=$(PORT) npm run dev

worker: ## Run the automation worker (needs Redis)
	npm run worker

build: ## Production build
	npm run build

start: ## Serve the production build on :3100
	PORT=$(PORT) npm run start

typecheck: ## Type-check without emitting
	npm run typecheck

## ---- Verify ------------------------------------------------------------

verify: ## Run all verify suites (logic + backend + frontend)
	npm run verify

verify-logic: ## Pure-logic QA suite (no server needed)
	npm run verify:logic

verify-backend: ## Backend integration suite (needs app on :3100)
	npm run verify:backend

verify-frontend: ## Puppeteer e2e suite (needs app on :3100 + Chrome)
	npm run verify:frontend

## ---- Docker (production) ----------------------------------------------

prod-up: ## Build + run the full prod stack (web on :3100)
	$(COMPOSE_PROD) up -d --build

prod-down: ## Stop the prod stack
	$(COMPOSE_PROD) down

prod-logs: ## Tail prod stack logs
	$(COMPOSE_PROD) logs -f

## ---- Maintenance -------------------------------------------------------

reset: ## DESTROY the local db volume, then recreate + migrate + seed
	$(COMPOSE) down -v
	$(COMPOSE) up -d
	$(MAKE) db-wait migrate seed
	@echo "✓ Local database reset."

clean: ## Remove the Next.js build cache
	rm -rf .next
