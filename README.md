# Tabular

An open, Airtable-style relational database with a spreadsheet UI.
Bases → tables → fields → records, with a virtualized editable grid.

## Stack

| Layer        | Choice                                   |
| ------------ | ---------------------------------------- |
| Framework    | Next.js 16 (App Router) + TypeScript     |
| Grid         | TanStack Virtual (row virtualization)    |
| Styling      | Tailwind CSS v4                          |
| Database     | PostgreSQL 16                            |
| ORM          | Drizzle                                  |
| Auth         | Auth.js (NextAuth v5)                    |

### Data model

User-defined schemas are stored as **data, not DDL** — no runtime migrations:

- `workspace` → `base` → `table`
- `field` defines a column (type + JSONB `options`)
- `record` stores its row values in a single JSONB `cells` column, keyed by field id
- `view` holds per-view config (filters/sorts/grouping) in JSONB
- `record_link` is the many-to-many join for linked-record fields

See [src/server/db/schema.ts](src/server/db/schema.ts).

## Getting started

```bash
npm install
npm run db:up        # start Postgres in Docker
npm run db:migrate   # apply migrations
npm run db:seed      # demo workspace/base/table + sample rows
npm run dev
```

Open http://localhost:3000 and log in with `demo@tabular.dev`
(dev login — any email works and provisions an account).

## Scripts

| Script                | Purpose                          |
| --------------------- | -------------------------------- |
| `npm run dev`         | Dev server                       |
| `npm run db:up`       | Start Postgres (docker compose)  |
| `npm run db:down`     | Stop Postgres                    |
| `npm run db:generate` | Generate a migration from schema |
| `npm run db:migrate`  | Apply migrations                 |
| `npm run db:push`     | Push schema without a migration  |
| `npm run db:studio`   | Drizzle Studio                   |
| `npm run db:seed`     | Seed demo data                   |

## Status

**Phase 1 (done):** auth, workspaces/bases/tables, dynamic fields, virtualized
editable grid, core field types (text, number, currency, percent, checkbox,
single/multi-select, date, rating, url/email/phone), per-tenant access control.

**Roadmap:** views (kanban/calendar/gallery) + filters/sorts/grouping →
linked records + lookups/rollups → formula engine → realtime collab → automations.
