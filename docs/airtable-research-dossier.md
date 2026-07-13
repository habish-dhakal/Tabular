# Airtable Deep Research Dossier For Tabular

Date: 2026-07-13

Purpose: understand Airtable end to end, compare it against Tabular's current implementation, and convert that research into a senior-architect build plan for making Tabular close to, then better than, Airtable.

This is a working dossier, not marketing copy. It should guide product decisions, architecture decisions, test strategy, and implementation order.

## Method

Research inputs:

- Tabular source inspection in this repo.
- Refresh pass against upstream `origin/main` at `62ef60d` after the author added scheduled automations, form view, member management, rate limiting, health checks, SSRF guard, cascade cleanup, Makefile, and a starter k6 load test.
- Airtable support/product/security/pricing/platform documentation.
- Airtable public product positioning around AI, Omni, agents, HyperDB, interfaces, automations, and governance.
- Public user-review signals from G2 and TrustRadius.
- Competitive signals from NocoDB, Baserow, and Grist.
- Grafana k6 documentation for scenarios, thresholds, browser tests, and concurrent-user modeling.
- OWASP Top 10 and OWASP ASVS for secure engineering expectations.

Evidence standard:

- Airtable capability claims should be backed by official Airtable docs where possible.
- Market/user-pain claims should be backed by review platforms or competitor docs.
- Tabular capability claims should be backed by current source files, not memory.
- Strategy and priority calls are expert synthesis.

## Executive Thesis

Airtable is not merely a spreadsheet with a database under it. It is a layered work operating system:

1. Dynamic relational data layer.
2. Spreadsheet-grade editing surface.
3. Multiple durable view models.
4. Form/capture layer.
5. App/interface builder layer.
6. Automation/workflow engine.
7. Integration and API platform.
8. Sync/import/export/data movement layer.
9. Collaboration/permissions/governance layer.
10. AI-native assistant/agent layer.

Tabular already has the correct architectural seed: dynamic fields stored as data, records stored in JSONB, view config in JSONB, linked records in a join table, Drizzle/Postgres, Auth.js, BullMQ, and a virtualized React grid. The strategic mistake would be to chase visible Airtable features before establishing a canonical value engine, grid interaction model, permission model, and testing discipline.

The strongest path is:

1. Make data values correct everywhere.
2. Make the grid feel excellent.
3. Complete field types and import/export.
4. Productize views and forms.
5. Harden permissions/collaboration.
6. Make automations reliable.
7. Build interfaces.
8. Add platform/API/sync/AI layers.

## Engineering Bar

Build as if a senior software architect with 20+ years of experience is accountable for every line.

Non-negotiables:

- No spaghetti code.
- No domain rules buried in React components.
- No duplicated interpretation of field values.
- No endpoint without explicit authz.
- No raw user input crossing service boundaries without validation.
- No manual string hacking where structured parsing is available.
- No new feature without tests.
- No security-relevant feature without OWASP ASVS-style acceptance checks.
- No demo-only behavior shipped as product behavior.
- No feature expansion before refactoring weak foundations it depends on.
- No commit, PR update, or phase completion unless the required quality gates pass.

Loop engineering rule:

1. Research expected behavior.
2. Inspect current implementation.
3. Write acceptance criteria.
4. Write failing tests first.
5. Implement through a clean service boundary.
6. Verify authorization, validation, abuse controls, and auditability.
7. Add Playwright coverage for the primary user path.
8. Refactor before moving to the next loop.
9. Document the architectural decision.
10. Keep the blast radius narrow.

Pre-commit and phase gate:

- Before committing any implementation work, the relevant gate must pass locally.
- Before a phase is considered complete, the full gate must pass.
- Required gate categories:
  - Unit tests: pure logic, field behavior, value resolution, permission rules, automation semantics.
  - API/backend tests: authenticated routes, authorization, validation, persistence, rate limiting, integration stubs.
  - E2E/frontend tests: primary user workflows in the browser, including grid, views, forms, members, and automations.
  - Full suite: unit + API/backend + E2E/frontend + typecheck + security/performance checks relevant to the phase.
- Existing scripts map partly to this gate today:
  - `npm run verify:logic` is the current logic/unit-style gate.
  - `npm run verify:backend` is the current API/backend gate.
  - `npm run verify:frontend` is the current E2E/frontend gate.
  - `npm run verify` is the current full-suite gate.
- The Makefile should be the blessed local command surface:
  - `make up` starts Docker infrastructure.
  - `make down` stops Docker infrastructure.
  - `make restart` restarts Docker infrastructure and waits for readiness.
  - `make pre-commit` runs the local pre-commit gate.
- As Vitest/Playwright/k6 coverage matures, keep explicit commands for unit, API, E2E, and full suite so the gate is unambiguous.

## Tabular Current Architecture

Current stack from `package.json` and `README.md`:

- Next.js 16 App Router.
- React 19.
- TypeScript.
- Tailwind CSS v4.
- PostgreSQL 16.
- Drizzle ORM.
- Auth.js / NextAuth v5.
- BullMQ + Redis for automations.
- `isolated-vm` for sandboxed automation scripts.
- Zod at API boundaries.
- Puppeteer verification scripts.
- Makefile task runner.
- Starter k6 API load test.
- `cron-parser` for scheduled automation due detection.

Strong current choices:

- User-created schemas are data, not database DDL.
- `workspace -> base -> table -> field/view/record` hierarchy exists.
- `field.options` is JSONB for type-specific configuration.
- `record.cells` is JSONB keyed by field id.
- `view.config` is JSONB for filters, sorts, grouping, hidden fields, order, widths, row height, kanban, and calendar settings.
- `record_link` represents many-to-many linked-record relationships.
- Comments, notifications, invites, roles, and workspace membership are represented.
- Automations have triggers, action tree/grouping, run history, step history, and sandboxed script support.
- Scheduled automations now have a v1 runner in the worker: friendly schedule config, timezone-aware cron due detection, and a one-run catch-up behavior for missed intervals.
- Form view is now exposed in the table UI as an internal record-entry view.
- Health endpoint checks Postgres and reports Redis status.
- Per-client fixed-window API rate limiting exists, Redis-backed when available and memory-backed otherwise.
- HTTP request automation action has an SSRF guard for private, loopback, link-local, reserved, and redirect targets.
- Field/table delete now performs cascade cleanup for JSONB references in views, automation trigger configs, link fields, and record cells.
- Workspace settings now expose member management and invite-link acceptance.

Key files:

- `src/server/db/schema.ts`
- `src/lib/compute.ts`
- `src/lib/query.ts`
- `src/lib/fields.ts`
- `src/components/table/views/GridView.tsx`
- `src/components/table/TableWorkspace.tsx`
- `src/components/table/FieldEditor.tsx`
- `src/server/services/access.ts`
- `src/server/services/links.ts`
- `src/server/automations/emit.ts`
- `src/server/automations/run.ts`
- `src/server/automations/schedule.ts`
- `src/server/automations/schedule-due.ts`
- `src/worker/index.ts`
- `src/server/rate-limit.ts`
- `src/server/integrations/ssrf.ts`
- `src/server/services/cleanup.ts`
- `src/components/table/views/FormView.tsx`
- `scripts/load-test.js`

Current critical gaps:

- Computed values are not universal. `computeCellValue` is display-oriented; filters/sorts/groups operate on raw `record.cells`.
- Automations do not see lookup/rollup/formula values in triggers/tokens.
- Scheduled automations exist as v1, but need hardening around idempotency, missed-run policy, run concurrency, observability, retries, and operational controls.
- Form view exists as an internal view, but standalone/public/shareable forms, form permissions, conditional visibility, validation rules, redirects, anti-spam, and form-submitted triggers are still missing.
- Attachment and user fields are listed in schema but hidden from field creation.
- Grid editing is cell-by-cell, not spreadsheet-grade.
- No import/export product workflow.
- No realtime collaboration implementation.
- Permissions are workspace-level, not Airtable-grade base/table/field/view/interface/link-level.
- The k6 script validates a narrow one-table, 200-row, one-user workload; it does not yet model a real Airtable-shaped operational base with 90k rows, linked tables, SLA views, automations, or integration fanout.

## Airtable Capability System

### 1. Data Model

Airtable organizes work into workspaces, bases, tables, fields, records, views, forms, interfaces, automations, syncs, and collaborators.

Field system includes:

- Attachment.
- Autonumber.
- Barcode.
- Button.
- Checkbox.
- Count.
- Created time.
- Created by.
- Currency.
- Date/date-time.
- Duration.
- Email.
- Formula.
- Last modified by.
- Last modified time.
- Linked record.
- Long text/rich text.
- Lookup.
- Multiple select.
- Number.
- Percent.
- Phone.
- Rating.
- Rollup.
- Single line text.
- Single select.
- URL.
- User/collaborator.

Tabular has many of these in schema, but several are incomplete or not productized.

Architecture implication:

- Build field behavior as domain plugins behind typed interfaces.
- Every field type needs:
  - storage shape
  - display shape
  - edit UI
  - validation/coercion
  - filter semantics
  - sort semantics
  - formula semantics
  - import/export semantics
  - automation token semantics
  - permission semantics

### 2. Grid And Spreadsheet Surface

Airtable's grid is not just an HTML table. It supports:

- Active selected cell.
- Copy/cut/paste.
- Range selection.
- Keyboard navigation.
- Insert row.
- Expand record.
- Expand cell.
- Jump to table edges.
- Bulk field operations.
- Undo/redo.
- Date shortcut behavior.
- View/filter/group/sort shortcuts.

Tabular currently has:

- Virtualized rows.
- Inline cell edit.
- Checkbox edit.
- Link picker.
- Expanded record modal.
- Add/delete row.
- Field add/menu.

Gap:

- No active-cell state machine.
- No selection model.
- No range paste.
- No fill handle.
- No undo/redo stack.
- No keyboard-first ergonomics.
- No clipboard matrix parser.

### 3. Views

Airtable view types:

- Grid.
- Form.
- Calendar.
- Gallery.
- Kanban.
- Timeline.
- List.
- Gantt.

View management:

- Create/duplicate/delete.
- View sections.
- Personal views.
- Collaborative views.
- Locked views.
- Favorites.
- Hide/show fields.
- Filter.
- Sort.
- Group.
- Color records.
- Search.
- Preview for large views.
- Share/sync-enabled views.

Tabular currently has:

- Grid.
- Kanban.
- Calendar.
- Gallery.
- Form view exposed in the table UI.
- Toolbar for hide/filter/sort/group/row height.

Gap:

- Form view is internal/member-only and does not yet cover standalone/public/shareable form workflows.
- No list/timeline/gantt.
- No personal/locked/collaborative view type semantics.
- No view sections/favorites.
- No shareable view links.
- No large-view preview strategy.
- No server-side view query engine for large operational views.

### 4. Forms And Capture

Airtable forms are a distinct product surface:

- Standalone form builder.
- Legacy form view.
- Interface form layouts.
- Record creation form buttons.
- Public/private/domain/password share settings.
- Groups and sections.
- Field reordering/resizing.
- Default values.
- Required fields.
- Conditional visibility.
- Select option restriction.
- Linked-record selection restriction.
- User-field collaborator restriction.
- Email/URL/number/range/character/file-type validation.
- Submit messages.
- Redirects.
- Print/PDF.
- Embedded forms.
- Form submitted automation trigger.

Tabular current:

- Basic internal form view exposed as a table view.
- Supports simple record entry for writable non-computed fields.
- Excludes link, attachment, user, and computed fields.
- Requires the primary field before submission.
- Persists form title, description, and submit label in view config.

Strategic call:

- Treat current form view as a useful v1, not the full form product.
- Build standalone/shareable forms after canonical value engine and field validation, otherwise form rules will duplicate field rules and become brittle.
- Public forms must not reuse workspace-member-only assumptions from the internal form view.

### 5. Interfaces And Apps

Airtable Interface Designer turns base data into role-specific apps:

- Pages.
- Layouts.
- List/gallery/kanban/calendar/timeline/grid visualizations.
- Dashboard.
- Record review.
- Form layout.
- Overview.
- Blank layout.
- Filters fixed by builder.
- End-user tabs/dropdowns.
- Search/filter/sort/group toggles for end users.
- Inline edit controls.
- Add/delete controls.
- CSV export/import controls.
- Record detail pages.
- Buttons.
- Interface permissions.

Tabular current:

- No interface layer.

Strategic call:

- Do not build interfaces before views, permissions, forms, and value truth are strong.
- Interfaces should consume existing view/query/form/permission primitives, not create another feature universe.

### 6. Portals

Airtable Portals expose interfaces to external collaborators:

- Branded external access.
- Portal guests.
- Interface-based subset access.
- Invite by email or link.
- Custom sign-in on higher plans.
- Reduced external-user account/menu surface.

Tabular current:

- Workspace invites only.

Opportunity:

- Later, Tabular can beat Airtable with clearer external-user pricing and simpler external access rules.

### 7. Automations

Airtable automation triggers include:

- Record enters view.
- Record created.
- Record updated.
- Record matches conditions.
- Form submitted.
- Scheduled time.
- Webhook received.
- Button clicked.
- Google Workspace triggers.
- Outlook triggers.
- Email received.
- Comment added in docs index.

Actions include:

- Create record.
- Update record.
- Run script.
- Send email.
- Find records.
- Sort list.
- Slack.
- Google Workspace.
- Document automator.
- Microsoft Teams.
- Outlook.
- Jira.
- Salesforce.
- Facebook Pages.
- GitHub Issues.
- Twilio.
- Hootsuite.
- Generate with AI.

Automation platform behavior includes:

- Trigger testing.
- Action testing.
- Dynamic tokens.
- Conditional groups.
- Repeating groups.
- Run history.
- Revision history.
- Run limits by plan.
- Server-side execution even when no one has the base open.
- Non-retroactive trigger semantics.
- Backend ID references for stable rename behavior.

Tabular current:

- Record created/updated/deleted/matches/enters-condition triggers.
- Scheduled trigger v1: hourly/daily/weekly/monthly friendly schedule config, timezone support, cron-parser due detection, worker tick, and last-run claim before execution.
- Email, Slack, Google Sheet append, create/update record, HTTP request, run script.
- Conditional/loop groups.
- Run/step logs.
- Sandboxed script.
- HTTP request action now has an SSRF guard and manually revalidates redirects.

Gaps:

- Scheduled execution hardening: run concurrency, missed-run policy, retry/dead-letter behavior, timezone edge cases, admin controls, metrics, and alerting.
- Webhooks.
- Form submitted.
- Button clicked.
- Record enters view instead of condition only.
- Find records.
- Revision history.
- Retrying/backoff/dead-lettering.
- Run limits/quotas.
- Secret management.
- Computed-field-aware triggers.
- Full test snapshots.
- Worker observability.

### 8. Sync And Data Movement

Airtable sync includes:

- Source grid views enabled for sync.
- One-way sync.
- Two-way sync on higher plans.
- Multi-source sync.
- Sync linked records.
- Manual or automatic sync.
- Sync frequency controls.
- Field selection.
- Source deletion behavior.
- Primary field customization.
- Destination field customizations.
- Re-authentication if source share link changes.
- Limits around sources, synced tables, reads, source views, and integrated sync record counts.

Import includes:

- CSV.
- Excel.
- Google Sheets.
- New base/new table/existing table flows.
- Field mapping.
- First row as headers.
- Type auto-detection.
- Native file-size limits.

Tabular current:

- No productized import/export/sync.

Strategic call:

- Import/export must come before AI. AI app-building is weak if users cannot bring data in and get data out safely.

### 9. Collaboration, Permissions, Governance

Airtable permission/governance surfaces:

- Workspace permissions.
- Base permissions.
- Interface permissions.
- Form permissions.
- Enterprise permissions.
- Field/table editing permissions.
- Sync permissions.
- Share links.
- Password/domain restricted views/forms.
- Comments.
- Notifications.
- Portals.
- Admin panel.
- Users/groups/workspaces/bases/interfaces/data sets/apps/reports/settings.
- Data residency.
- Enterprise API.
- Retention policies.
- eDiscovery.
- DLP.
- Audit logs.
- AI credit audit logs.
- Export controls.
- SSO.
- IdP sync.
- Domain federation.
- Enterprise key management.
- Security certifications and SAML/2FA/revision history.

Tabular current:

- Workspace roles: owner/admin/editor/commenter/viewer.
- Workspace members.
- Invites.
- Workspace settings UI for members.
- Invite links with optional pinned email and 7-day expiry.
- Comments.
- Mentions.
- Notifications.
- Central access service.
- Basic per-client API rate limiting.
- Health endpoint for dependency readiness.

Gap:

- Base-level collaborators.
- Table-level permissions.
- Field-level permissions.
- View/form/interface permissions.
- Share links.
- Revision history.
- Audit logs.
- Enterprise controls.
- Rate limiting is per-client rather than per-user/workspace/base/action, and it may need special handling during k6 tests because local load often comes from one source IP.

### 10. Extensions, API, AI, And Platform

Airtable platform includes:

- API.
- Developer docs.
- Scripting.
- Custom React extensions.
- Marketplace extensions.
- Chart/map/page designer/pivot/summary/dedupe/import/extensions.
- MCP server.
- Omni AI.
- AI fields/field agents.
- AI app building.
- AI-generated interface elements.
- AI automations.
- AI in Slack.
- HyperDB for up to 100M rows on Enterprise Scale.

Competitor pressure:

- NocoDB offers a broad Airtable-like surface: grid/form/gallery/kanban/calendar/timeline/gantt/list/map views, fine-grained roles, automations, scripts, webhooks, dashboards, AI, sync, docs, external data sources, REST API, and MCP.
- Baserow leans on open source, self-hosting, APIs, WebSocket updates, plugins, and technical docs around formulas, undo/redo, and permissions.
- Grist leans on spreadsheet/database/app-builder fusion, Python formulas, granular access rules, dashboards/layouts, widgets, forms, AI assistant, API/webhooks, self-hosting, and strong data-analysis semantics.

Tabular opportunity:

- Be more open, more architecturally transparent, easier to self-host, stronger at export/reporting, and less confusing around permissions and automations.

## Capability Matrix

| Layer | Airtable capability | Tabular current | Gap | Priority |
| --- | --- | --- | --- | --- |
| Dynamic schema | Runtime fields and records | Good base design | Need stronger field contracts | P0 |
| Value truth | Raw/display/computed/import/export/token values | Split between `compute.ts`, `links.ts`, `query.ts` | No canonical resolver | P0 |
| Grid | Spreadsheet-grade editing | Basic virtual grid | No range/keyboard/clipboard/undo | P0 |
| Field types | Very broad | Many in schema, some hidden/incomplete | Attachments, user, autoNumber, count, duration, button | P1 |
| Views | Grid/form/calendar/gallery/kanban/timeline/list/gantt | Grid/kanban/calendar/gallery/form | Missing collaboration semantics, large-view strategy, list/timeline/gantt | P1 |
| Forms | Standalone builder, validation, sharing | Basic internal form view | Public/shareable form product missing | P2 |
| Imports/exports | CSV/Excel/Sheets | None productized | Data movement missing | P1 |
| Automations | Broad trigger/action/workflow engine | Solid seed with scheduled v1 | Missing webhook/form/button/find/revision/retry/quota/observability | P2 |
| Collaboration | Comments, mentions, sharing, realtime | Comments/mentions/member UI/invites foundation | Realtime, revision, sharing missing | P2 |
| Permissions | Workspace/base/table/field/interface/form/admin | Workspace-level with member management | Too coarse | P1/P2 |
| Interfaces | Role-specific apps | None | Entire app-builder missing | P3 |
| Portals | External interface access | None | External access missing | P3 |
| API/platform | API, scripting, extensions, MCP | Internal APIs only | Public platform missing | P3 |
| AI | Omni, agents, MCP, AI field agents | None | Should wait until core is clean | P4 |
| Scale | HyperDB and performance guidance | Basic Postgres JSONB + starter k6 + health/rate limit | Need server-side view query/index/load-test strategy | P1/P2 |

## Upstream Main Refresh

Latest audited upstream baseline:

- `origin/main` at `62ef60d`.
- Dossier branch rebased onto that baseline before this refresh.

New upstream capabilities that change the plan:

- `scripts/load-test.js` adds a k6 starter test that ramps to 300 virtual users with an 80 percent read / 20 percent write mix against one generated table.
- `/api/health` adds a bounded readiness check: Postgres controls 200 vs 503; Redis is reported but not required.
- `src/server/rate-limit.ts` adds fixed-window per-client API throttling, Redis-backed when Redis is configured and memory-backed otherwise.
- `src/components/table/views/FormView.tsx` exposes a basic internal form view for record entry.
- `src/server/automations/schedule.ts`, `schedule-due.ts`, and `src/worker/index.ts` add scheduled automation execution.
- `src/server/integrations/ssrf.ts` guards outbound HTTP automation requests against internal/reserved hosts and validates redirects.
- `src/server/services/cleanup.ts` and `src/lib/cleanup-refs.ts` clean JSONB references when fields/tables are deleted.
- Member settings and invite acceptance are now productized in UI.

Implications:

- The dossier should no longer frame scheduled automations or form view exposure as absent.
- The next work is hardening: correctness, observability, limits, security review, and scale behavior.
- The k6 script is a good smoke/load scaffold, but it is not a production-representative questionnaire workload test.

## Operational Load Testing For The Questionnaire Workload

The internal target is not just 200-300 simultaneous users. It is 200-300 simultaneous users working over an Airtable-shaped operational base with roughly 90k existing rows and 200-300 new questionnaire tasks per week.

The current `scripts/load-test.js` proves the app can be exercised by k6, but it does not yet model the real risk:

- It seeds 200 rows, not 90k+.
- It uses one generated table, not the Questionnaire/Tasks/Customers/KLU/Onboarding/TL-QA/Success Tickets/Customer POCs graph.
- It uses one shared login, not realistic member/session distribution.
- It does not exercise linked-record density, lookup/rollup/formula-heavy views, SLA fields, dashboard/report queries, or integration fanout.
- In production mode, the per-client rate limiter can dominate results unless test clients are modeled with realistic IP/user buckets or the limit is explicitly adjusted for the test environment.

Load-test suites needed:

- **Baseline k6 API suite:** login/session reuse, dashboard, base open, table bundle, record list, record create, cell patch, comments, view config save.
- **Airtable-shaped data suite:** seed 90k and 150k rows across the real dependency graph with representative linked records and hot fields.
- **View pressure suite:** active questionnaire tracking, SLA overdue/upcoming, segment views, change analysis, gap analysis, audit queues, and customer-specific views.
- **Write/edit suite:** questionnaire creation, task creation, status changes, due date/SLA updates, phase transitions, owner/assignee changes.
- **Automation fanout suite:** Slack/Sheets/Salesforce/email/HTTP actions stubbed first, sandboxed second; measure queue depth, run lag, retry behavior, and duplicate-safety.
- **Browser realism suite:** 10-25 k6 browser or Playwright users during a 300-VU API run to measure grid responsiveness, page load, long tasks, and visible usability.
- **Soak and spike suites:** 4-8 hour soak for leaks/queue buildup and fast 20-to-300 VU spike for meeting/deadline rushes.

Initial gates:

- API error rate below 1 percent.
- p95 record list under 800 ms for target-size views.
- p95 record edit under 500 ms.
- p99 record edit under 1500 ms.
- No sustained Postgres pool saturation.
- Automation queue drains within 2-3 minutes after a burst.
- Dashboard/report queries do not block editing.
- Browser grid remains usable while protocol-level load is running.

## Phase Plan

### Phase 0: Architecture, TDD, Security Foundation

Intent:

Create the engineering spine before feature expansion.

Work:

- Add ADRs for value resolution, field types, permission model, automation semantics, attachments, realtime, imports, interfaces, and AI boundaries.
- Add Vitest or equivalent unit test framework.
- Keep existing verification scripts, but do not treat them as enough for TDD.
- Keep the new k6 script, but treat it as smoke load only until domain-shaped scenarios and seeded datasets exist.
- Make the Makefile the official developer task runner for setup, Docker lifecycle, database work, verification, and pre-commit gates.
- Define explicit pre-commit commands for unit, API/backend, E2E/frontend, typecheck, full suite, and phase-specific load/security checks.
- Create service ownership boundaries:
  - `src/server/services/values`
  - `src/server/services/permissions`
  - `src/server/services/imports`
  - `src/server/services/forms`
  - `src/server/services/audit`
  - `src/lib/grid`
- Define engineering checklists:
  - TDD red/green/refactor.
  - OWASP Top 10 review.
  - ASVS requirement mapping for auth/session/input/output/file/security-sensitive flows.
  - Performance budget.
  - Load-test budget for 90k and 150k row fixtures.
  - Migration plan.
  - Rollback plan.
- Define a phase-gate checklist template:
  - acceptance criteria linked to tests
  - unit gate pass
  - API/backend gate pass
  - E2E/frontend gate pass
  - full-suite gate pass
  - phase-specific security and load gates pass

Exit criteria:

- A new feature cannot merge without tests.
- Every API route has explicit authz.
- Field behavior has a single owner.
- Security checklist exists in docs and PR template.
- `make up`, `make down`, `make restart`, and `make pre-commit` exist and are documented.
- Baseline k6 smoke test is documented separately from production-representative load tests.
- Each phase has an explicit pre-commit/full-suite gate, and phase completion is blocked unless unit, API/backend, E2E/frontend, and full-suite checks pass.

### Phase 1: Canonical Value Engine

Intent:

Make every feature agree on what a value is.

Work:

- Create `ValueResolver`.
- Support:
  - raw stored value
  - normalized value
  - display value
  - computed value
  - query value
  - export value
  - import value
  - automation token value
- Move lookup/rollup enrichment behind resolver.
- Move formula dependency evaluation behind resolver.
- Make filters/sorts/groups use resolver.
- Make automations use resolver.
- Add dependency graph and cycle detection.
- Add deterministic computed-field invalidation/recalc rules.

Test first:

- Formula field filters correctly.
- Lookup field sorts correctly.
- Rollup field triggers automation correctly.
- AutoNumber returns stable values.
- Link field display/query/token values are distinct but coherent.
- Cycles produce safe errors.

Exit criteria:

- No core product surface reads `record.cells[fieldId]` directly unless it explicitly asks for raw storage.

### Phase 2: Spreadsheet-Grade Grid

Intent:

Make the grid feel like a serious Airtable/Sheets-class editing surface.

Work:

- Create grid state machine:
  - active cell
  - selected range
  - editing cell
  - viewing computed cell
  - clipboard operation
  - drag/fill operation
- Keyboard navigation.
- Range selection.
- Copy/cut/paste matrix parser.
- Multi-cell paste with validation preview.
- Undo/redo.
- Fill down/right.
- Bulk delete/duplicate.
- Column resize/reorder persistence.
- Row reorder/manual sort.
- Accessibility pass.

Test first:

- Arrow/tab/enter navigation.
- Paste 3x3 matrix.
- Paste rejects invalid field values without partial silent corruption.
- Undo restores previous cell state.
- Range copy preserves display/export value semantics.

Exit criteria:

- A power user can operate the grid primarily with keyboard and clipboard.

### Phase 3: Field System Completion

Intent:

Make fields product-grade, not schema placeholders.

Work:

- Attachments:
  - object storage abstraction
  - signed URLs
  - MIME/type/size validation
  - preview metadata
  - deletion lifecycle
  - virus-scan hook
- User/collaborator field.
- AutoNumber.
- Count.
- Duration.
- Button.
- Field descriptions.
- Required/default/unique validations.
- Select option lifecycle hardening.
- Formula parser/evaluator expansion and test fixture library.

Test first:

- Attachment permission checks.
- File validation.
- User field only accepts collaborators.
- Default values apply consistently to API, form, import, and automation create-record.
- Field type conversion preview catches lossy changes.

Exit criteria:

- Each field type has storage/display/edit/query/import/export/automation behavior documented and tested.

### Phase 4: Import, Export, And Data Movement

Intent:

Make Tabular usable with real customer data.

Work:

- CSV import wizard.
- Excel import.
- Field mapping.
- Type inference.
- First row as headers.
- Preview.
- Validation errors with row/column.
- Transactional import.
- Import into new base/new table/existing table.
- CSV export by table/view.
- JSON backup export.
- Later: Google Sheets import/sync.
- Later: Airtable importer.
- Airtable-shaped dependency import:
  - preserve external Airtable record IDs
  - load all tables before linking
  - recreate linked-record edges after row import
  - map formula/lookup/rollup fields to either computed fields or migrated static snapshots
  - produce parity reports against source counts, null rates, select choices, and link cardinality

Test first:

- Invalid rows reported before write.
- Transaction rollback on configured strict import.
- Partial import mode produces a report.
- Export respects hidden fields only when explicitly exporting view.
- Permission checks for import/export.
- Airtable import preserves link counts and primary display values.

Exit criteria:

- A user can bring in a CSV and safely get data back out.

### Phase 5: Views As Product Objects

Intent:

Make views durable collaboration surfaces.

Work:

- Harden current form view as a view type.
- Move filtering/sorting/grouping/search to a server-side view query path.
- Add cursor pagination and visible-field projection.
- Add list view.
- Add timeline and gantt later.
- View sections.
- Favorite views.
- Personal/collaborative/locked views.
- Duplicate views.
- Color rules.
- View search.
- Large-view preview/load-all strategy.
- Shareable read-only view links.

Test first:

- A 90k-row table can open a filtered/sorted view without loading every row into the browser.
- Locked view blocks editor config changes.
- Personal view is only configurable by owner.
- View duplication preserves config.
- Shared view cannot leak hidden fields.

Exit criteria:

- Views have ownership, access, collaboration semantics, and are safe to share.

### Phase 6: Forms And Capture

Intent:

Turn Tabular into an intake product.

Work:

- Promote the current internal form view into a proper product surface without duplicating field/value rules.
- Standalone form builder.
- Public form route.
- Share settings:
  - public
  - password
  - domain
  - authenticated workspace/base access
- Field groups.
- Required fields.
- Hidden fields.
- Default values.
- Conditional visibility.
- Validation rules.
- Submit message.
- Redirect.
- Form submitted automation event.
- Anti-spam/rate-limit.
- Submission audit trail.
- Form-specific permission model.

Test first:

- Internal form view remains member-authenticated and cannot be used as a public bypass.
- Public submission creates record without workspace membership.
- Hidden fields are not a security boundary.
- Required/validation rules block submission.
- Password/domain restrictions work.
- Form trigger fires exactly once per submission.

Exit criteria:

- Form behavior uses the same field/value engine as grid/API/import.

### Phase 7: Permissions, Collaboration, Audit

Intent:

Make teams and enterprises trust Tabular.

Work:

- Harden workspace member management and invite links.
- Base-level collaborators.
- Table permissions.
- Field permissions.
- View/form permissions.
- Share links.
- Comments edit/delete/resolve.
- Record revision history.
- Activity feed.
- Audit log.
- Export controls.
- Basic admin panel.
- Rate-limit policy by user/workspace/base/action, not only client IP.
- Presence.
- Realtime collaboration.
- Conflict handling.

Test first:

- Cross-tenant access attempts fail.
- Invite pinned to an email cannot be accepted by another email.
- Rate limiting does not block legitimate 300-user internal load when traffic comes through a small number of NAT/proxy IPs.
- Field-level lock blocks grid/API/form/automation writes unless explicitly allowed.
- Revision history records human and automation actors.
- Share links cannot mutate data unless configured.

Exit criteria:

- Permissions are centralized, testable, and impossible to bypass through alternate API routes.

### Phase 8: Automations Reliability

Intent:

Turn automation from promising feature into dependable workflow engine.

Work:

- Harden scheduled trigger runner:
  - explicit missed-run semantics
  - idempotency keys
  - schedule drift metrics
  - admin pause/resume
  - concurrency controls
  - timezone edge-case fixtures
- Webhook trigger.
- Form submitted trigger.
- Button clicked trigger.
- Record enters view trigger.
- Find records action.
- Sort/list action.
- Retry/backoff/dead-letter.
- Run quotas.
- Run cancellation.
- Revision history.
- Secret manager.
- Integration outbox for Slack/Google/Salesforce/email/HTTP.
- Worker health dashboard.
- Trigger test snapshots.
- Queue depth and run lag metrics.
- Automation-specific view best-practice support.

Test first:

- Scheduled trigger fires in configured timezone and does not duplicate after restart.
- Webhook validates payload and rate limits.
- Failed step persists error without crashing other automations.
- Retry does not duplicate non-idempotent actions unless configured.
- Formula/lookup/rollup conditions work through `ValueResolver`.

Exit criteria:

- Automations are observable, debuggable, quota-aware, and safe.

### Phase 9: Interfaces And App Builder

Intent:

Move from database tool to operational app platform.

Work:

- Interface model:
  - interface
  - page
  - element
  - layout
  - data binding
  - permission binding
- Page types:
  - list
  - gallery
  - kanban
  - calendar
  - grid
  - dashboard
  - record review
  - form
- Builder/editor UI.
- End-user mode.
- Buttons/actions.
- Interface-only permissions.
- CSV export/import toggles.

Test first:

- Interface page respects backend base/table/field permissions.
- End-user edits flow through same record service.
- Buttons can trigger automation safely.

Exit criteria:

- Interfaces are consumers of records/views/forms/permissions, not a duplicate product stack.

### Phase 10: Platform, Sync, AI-Ready Core

Intent:

Build the layer that lets Tabular become AI-native later.

Work:

- Public REST API.
- API tokens/scopes.
- Webhooks.
- MCP server.
- Extension/plugin architecture.
- Sync engine.
- External source connectors.
- Admin console.
- Usage/billing/limits.
- AI metadata:
  - schema descriptions
  - field semantics
  - view intent
  - form intent
  - automation intent
  - permission-aware retrieval
- AI operations:
  - ask data
  - analyze table
  - propose schema
  - generate form
  - generate view
  - draft automation
  - explain automation failure

Test first:

- API scopes restrict every endpoint.
- MCP reads/writes as the user, not as superuser.
- AI cannot access hidden/forbidden data.
- Generated schema changes require preview/approval.

Exit criteria:

- AI is permission-aware, auditable, reversible, and grounded in clean product primitives.

## First 90-Day Execution Plan

### Weeks 1-2

- Rebase and rebaseline against latest upstream main.
- Add test framework.
- Add architecture docs.
- Add PR/security checklist.
- Write value-engine acceptance tests.
- Refactor current raw/display/computed value reads behind a resolver facade.
- Document the current k6 smoke script and define separate domain-load scenarios.

### Weeks 3-5

- Implement canonical `ValueResolver`.
- Refactor filters/sorts/groups.
- Refactor automations to resolve computed values.
- Add formula/lookup/rollup regression fixtures.
- Start server-side view query spike for filtered/sorted/paginated records.

### Weeks 6-8

- Build grid state machine.
- Add keyboard navigation.
- Add range selection.
- Add clipboard matrix paste.
- Add undo/redo.
- Add 90k-row synthetic seed fixture for questionnaire-shaped data.
- Run first k6 baseline against production build with realistic rate-limit settings.

### Weeks 9-10

- Implement autoNumber, user field, and attachment architecture skeleton.
- Add field behavior contract docs.
- Add field-level validation/defaults design.
- Harden internal form view around validation/default behavior.
- Add scheduled automation restart/idempotency tests.

### Weeks 11-12

- CSV import/export MVP.
- Airtable import design for linked records and formula/lookup/rollup parity.
- Domain-shaped k6 suite for Questionnaire/Tasks/Customers/SLA workflows.
- Security review of API routes and file boundaries.

## Strategic Product Differentiation

Do not simply clone Airtable. Beat it where users feel friction:

- Better export/reporting from day one.
- More transparent automation debugging.
- Clearer permissions.
- Self-hostable and developer-friendly.
- Lower vendor lock-in.
- Stronger open API.
- More predictable pricing model later.
- Cleaner AI controls: every AI action previewable, reversible, permission-aware, and audit-logged.

## Source Index

Official Airtable:

- Supported field types: https://support.airtable.com/docs/supported-field-types-in-airtable-overview
- Views: https://support.airtable.com/docs/getting-started-with-airtable-views
- Forms: https://support.airtable.com/docs/building-and-sharing-forms-in-airtable
- Interface Designer: https://support.airtable.com/docs/getting-started-with-airtable-interface-designer
- Automations: https://support.airtable.com/docs/getting-started-with-airtable-automations
- Sync: https://support.airtable.com/docs/getting-started-with-airtable-sync
- Importing data: https://support.airtable.com/docs/importing-third-party-data-into-airtable
- Permissions: https://support.airtable.com/docs/airtable-permissions-overview
- Collaboration: https://support.airtable.com/docs/airtable-collaboration-overview
- Portals: https://support.airtable.com/docs/using-airtable-portals-for-external-collaborators
- Extensions: https://support.airtable.com/docs/airtable-extensions-overview
- Performance: https://support.airtable.com/docs/troubleshooting-airtable-performance
- HyperDB: https://support.airtable.com/docs/hyperdb-in-airtable
- Omni AI: https://support.airtable.com/docs/using-omni-ai-in-airtable
- MCP: https://support.airtable.com/docs/using-the-airtable-mcp-server
- Platform: https://www.airtable.com/platform
- AI platform: https://www.airtable.com/platform/ai
- Pricing: https://airtable.com/pricing
- Security: https://www.airtable.com/company/trust-and-security

Market and competitors:

- G2 Airtable reviews: https://www.g2.com/products/airtable/reviews
- TrustRadius Airtable reviews: https://www.trustradius.com/products/airtable/reviews
- Baserow docs: https://baserow.io/docs
- NocoDB docs: https://nocodb.com/docs/product-docs
- NocoDB GitHub: https://github.com/nocodb/nocodb
- Grist product: https://www.getgrist.com/product/

Load testing:

- k6 scenarios: https://grafana.com/docs/k6/latest/using-k6/scenarios/
- k6 thresholds: https://grafana.com/docs/k6/latest/using-k6/thresholds/
- k6 browser: https://grafana.com/docs/k6/latest/using-k6-browser/
- k6 concurrent-user modeling: https://grafana.com/docs/k6/latest/testing-guides/calculate-concurrent-users/

Security:

- OWASP Top 10: https://owasp.org/www-project-top-ten/
- OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/
