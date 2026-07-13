# Tabular

An open, Airtable-style relational database with a spreadsheet UI.
Workspaces → bases → tables → fields → records, with a virtualized editable grid,
linked records, formulas, multiple view types, automations, and collaboration.

## Stack

| Layer         | Choice                                            |
| ------------- | ------------------------------------------------- |
| Framework     | Next.js 16 (App Router) + TypeScript              |
| Grid          | TanStack Virtual (row virtualization)             |
| Styling       | Tailwind CSS v4                                    |
| Database      | PostgreSQL 16                                      |
| ORM           | Drizzle                                           |
| Auth          | Auth.js (NextAuth v5)                             |
| Queue / cache | Redis + BullMQ (automation worker)                |
| Sandbox       | isolated-vm (sandboxed `runScript` automations)   |

### Data model

User-defined schemas are stored as **data, not DDL** — no runtime migrations when
users add tables/fields:

- `workspace` → `base` → `table`
- `field` defines a column (type + JSONB `options`)
- `record` stores its row values in a single JSONB `cells` column, keyed by field id
- `view` holds per-view config (filters/sorts/grouping/form settings) in JSONB
- `record_link` is the many-to-many join for linked-record fields
- `automation` / `comment` / `notification` / `workspace_invite` back the higher-level features

See [src/server/db/schema.ts](src/server/db/schema.ts).

## Getting started

Requires Docker (Postgres + Redis) and Node ≥ 22. A `Makefile` is the single entry point:

```bash
make setup   # deps + .env + docker (postgres + redis) + migrate + seed
make dev     # app on http://localhost:3100
make worker  # automation worker (separate terminal; needs Redis)
make help    # list every target
```

Open http://localhost:3100 and sign in with any email (dev login auto-provisions an
account; disabled in production — see below). Override the port with `make dev PORT=4000`.

<details>
<summary>Without the Makefile</summary>

```bash
npm install
npm run db:up        # Postgres + Redis (docker compose)
npm run db:migrate   # apply migrations
npm run db:seed      # demo workspace/base/table + sample rows
PORT=3100 npm run dev
npm run worker       # automation worker
```
</details>

## Features

- **Fields** — 25 types: text/long-text, number/currency/percent, checkbox, single/multi-select,
  date/date-time, url/email/phone, rating, **link** (symmetric linked records), **lookup**, **rollup**
  (6 aggregations), **formula** (~70 functions), auto-number, created/updated time·by.
- **Views** — grid, kanban, calendar, gallery, and **form** (record-entry form). Per-view
  filters, sorts, grouping, hidden/reordered fields.
- **Automations** — trigger → action rules (record created/updated/matches/enters-condition/deleted +
  scheduled), 6 action types (email, Slack, Google Sheets, create/update record, HTTP request, sandboxed
  script), loop/conditional builder, `{{token}}` interpolation, run history. Runs in a separate BullMQ worker.
- **Collaboration** — record comments, @mentions, in-app notifications.
- **Members** — token invites, role management (owner/admin/editor/commenter/viewer), accept flow.
- **Ops** — `/api/health` liveness/readiness probe, per-client API rate limiting, cascade-safe
  field/table deletes, SSRF-guarded outbound HTTP.

## Configuration

Secrets live in `.env` (gitignored); `.env.example` documents every knob. Highlights:

- `DATABASE_URL`, `REDIS_URL` — Postgres + Redis (Redis is optional; automations no-op without it).
- Auth: dev email login is **disabled in production** unless `ALLOW_DEV_LOGIN=1`; set
  `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` for GitHub OAuth.
- `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_SEC` / `RATE_LIMIT_FORCE` — per-IP API throttle
  (on in production by default).
- `AUTOMATIONS_STUB=1` — stub all outbound integrations (no network; payloads recorded in run logs).

## Verify

```bash
make verify        # or: npm run verify
```

- `verify:logic` (255) — pure logic: formula engine, coercion, filters, member/invite policy, schedule,
  SSRF classifier, cascade-cleanup scrub, rate-limit window. No server needed.
- `verify:backend` (173) — API integration suite (auth, CRUD, views, tenant isolation, automations,
  members, cascade cleanup, health). Spawns its own stub worker.
- `verify:frontend` (59) — Puppeteer e2e (grid/edit/views/form/automations/comments/members). Needs Chrome.

Also gate on `npm run typecheck` and `npm run build`.

## Production (Docker)

```bash
make prod-up       # full stack (db, redis, migrate, web, worker) — web on :3100
```

Multi-stage `Dockerfile` + `docker-compose.prod.yml`. Point a load balancer / uptime monitor at
`/api/health`. See [AGENTS.md](AGENTS.md) for architecture notes and conventions.
