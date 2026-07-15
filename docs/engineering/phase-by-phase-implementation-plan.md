# Phase-By-Phase Implementation And PR Plan For Tabular

This is the canonical implementation plan for taking Tabular from an
Airtable-style foundation to an Airtable-grade internal replacement.

Every phase must be implemented like production software reviewed by a senior
software architect with 20+ years of experience: boring, service-owned,
well-tested, security-aware, and readable by a junior engineer without tribal
knowledge.

## Non-Negotiable Coding Standard

- Do not write implementation work on `main`.
- Use one branch and one PR per phase unless a phase is explicitly split by
  behavior and risk.
- Use the branch shape `phase-number-phase-name`, for example
  `phase-01-value-engine`.
- Write tests first where practical. At minimum, write the smallest failing
  unit or service test before implementing new business behavior.
- Use existing local services, helpers, framework APIs, and proven dependencies
  before writing custom code.
- Do not write 50 lines of custom code when 2-5 clear lines using the framework
  or existing helper will do.
- Do not duplicate business rules across API routes, UI components, imports,
  forms, automations, or scripts.
- Keep API routes thin: authenticate, validate, call a service, return a
  response.
- Keep UI components focused on interaction and display. Business invariants
  belong in services or pure helpers.
- Keep database writes behind service-owned validation and permission checks.
- Treat OWASP/ASVS concerns as part of implementation, not a final checklist.
- Every PR must name the owning service, validation path, authz path, tests,
  OWASP/ASVS notes, rollback plan, and out-of-scope work.
- Every phase must pass `make pre-commit` before commit and push.

## How To Code Every Phase

Start each phase by reading the current implementation path and writing down the
owner. If no owner exists, create the smallest service or pure helper that can
own the behavior without becoming a dumping ground.

Use this order of operations:

1. Identify the existing route, service, component, schema, and tests involved.
2. Write the smallest failing test for the new contract.
3. Implement the smallest clear service-owned change.
4. Reuse existing helpers, Zod validation, Drizzle patterns, TanStack/Next APIs,
   and browser/API verification scripts where they fit.
5. Remove duplicated logic only when the new owner is tested and used by callers.
6. Run the targeted suite, then `make pre-commit`.

Good code in Tabular is easy to delete, easy to test, and obvious about where a
rule lives. Avoid clever abstractions, hidden global state, custom mini
frameworks, and large components that mix rendering, validation, permissions,
and persistence.

## Phase Workflow

For every phase:

```bash
git fetch origin main
git switch -c phase-XX-name origin/main
```

Implement only that phase. If a phase depends on an earlier unmerged phase,
wait by default. Use stacked PRs only when explicitly approved.

If upstream changes during a phase:

```bash
git fetch origin main
git rebase origin/main
make pre-commit
git push --force-with-lease fork phase-XX-name
```

Before commit:

```bash
make pre-commit
```

Push to the fork:

```bash
git push -u fork phase-XX-name
```

The PR body must include Summary, Why, Key Changes, Tests, Risk, and Out Of
Scope. Risk must include rollback notes.

Use this compare URL pattern:

```txt
https://github.com/anurodhme/Tabular/compare/main...habish-dhakal:Tabular:phase-XX-name
```

If a phase becomes too large, split it by behavior and risk, not by random file
groups. Example: split `phase-05-views-query-scale` only if view sharing or
indexing becomes independently reviewable.

## Phase 0: Engineering Spine And Gates

Branch: `phase-00-engineering-spine`

PR title: `Phase 0: Add engineering spine and gates`

Goal: make the repo safe for long-term implementation by juniors and agents.

Engineering guidance:

- Keep Phase 0 infrastructure-only.
- Make the Makefile the official command surface.
- Add ADR, PR, and ticket structure before feature work.
- Add a real unit test framework and make it part of the gate.
- Do not introduce product behavior changes.

Required checks:

```bash
make help
make -n restart
make -n pre-commit
make pre-commit
```

## Phase 1: Canonical Value Engine

Branch: `phase-01-value-engine`

PR title: `Phase 1: Add canonical value engine`

Goal: create one source of truth for field values.

Engineering guidance:

- Implement one `ValueResolver` service for raw, normalized, display, query,
  computed, export, import, and automation token values.
- One field-type switch inside the value service is acceptable. Repeated
  field-type switches across services, UI, imports, forms, and automations are
  not acceptable.
- Move value behavior out of `compute.ts`, `links.ts`, `query.ts`, automation
  interpolation, grid display, and form display only after equivalent tests
  exist.
- Add dependency graph and cycle detection for formula, lookup, and rollup.
- Make auto-number stable and service-owned.

Required tests:

- Formula filters correctly.
- Lookup sorts correctly.
- Rollup values trigger automation conditions correctly.
- Linked record display, query, and token values are coherent.
- Cycles produce safe errors.
- Auto-number is stable.
- `make pre-commit`.

## Phase 2: Spreadsheet-Grade Grid

Branch: `phase-02-spreadsheet-grid`

PR title: `Phase 2: Add spreadsheet-grade grid`

Goal: make grid editing feel like Airtable and spreadsheets.

Engineering guidance:

- Put global grid behavior in pure helpers: active cell, selected range,
  editing state, clipboard state, and undo/redo state.
- Keep cell editors small and field-specific.
- Do not bury keyboard navigation, paste behavior, or undo/redo inside
  individual cell components.
- Use the `ValueResolver` for validation and display instead of reimplementing
  field rules in the grid.
- Persist column width, field order, row height, and manual row position through
  service-owned APIs.

Required tests:

- Grid state unit tests.
- Paste parser unit tests.
- Invalid paste does not corrupt partial data.
- E2E keyboard navigation.
- E2E copy/paste.
- `make pre-commit`.

## Phase 3: Field System Completion

Branch: `phase-03-field-system`

PR title: `Phase 3: Complete field system`

Goal: make field types production-grade.

Engineering guidance:

- Define one field behavior contract and implement validation once.
- Do not create separate validation paths for API, grid, forms, imports, and
  automations.
- Add attachment architecture behind an adapter: metadata, signed URL, type and
  size validation, delete lifecycle, and virus-scan hook placeholder.
- Implement user/collaborator, count, duration, button, descriptions, defaults,
  required, unique, and type-conversion preview.
- Use existing schema/options patterns. Avoid ad hoc JSON shapes that only one
  component understands.

Required tests:

- User field rejects non-members.
- Attachment validation works.
- Defaults apply through API, grid, form, import, and automation paths.
- Unique and required validation works.
- Type conversion preview catches lossy changes.
- `make pre-commit`.

## Phase 4: Import, Export, And Airtable CSV Foundation

Branch: `phase-04-import-export`

PR title: `Phase 4: Add import/export and Airtable CSV foundation`

Goal: give Tabular a safe baseline for CSV import, CSV export, and JSON backup
without pretending the baseline is a full migration product.

Engineering guidance:

- Keep the implementation focused on the first usable import/export slice.
- Separate parsing, validation, mapping, database writing, and reporting.
- Import UI must not contain import business logic.
- Export must use the same value engine as imports.
- Preserve source row order and produce a basic report for created fields,
  created rows, skipped rows, invalid rows, and duplicate headers.
- Parsing must support duplicate headers by stable disambiguation, for example
  `Questionnaire Wizard?` and `Questionnaire Wizard? (2)`, while preserving
  both column values.
- Parsing must tolerate embedded newlines, quoted cells, empty trailing columns,
  and common Airtable CSV quirks.
- File upload validation must enforce size, extension/content hints, encoding,
  row/column limits, tenant ownership, authz, and rate limits.
- Export by table/view must respect permissions, hidden fields, view filters,
  and field visibility.
- Defend against CSV formula injection by escaping dangerous
  spreadsheet-leading characters on export.
- Defer migration-grade import planning, relationship inference, background
  jobs, append/replace/merge UX, and stateful import navigation to Phase 6.

Required tests:

- Uploaded Airtable CSV with duplicate headers preserves both columns and both
  values.
- Embedded newlines parse into the correct record count.
- Basic import preview reports valid/invalid rows before write.
- Basic import commit creates fields and records.
- Invalid rows report before write.
- Strict mode rolls back.
- Partial mode reports skipped rows.
- Export respects permissions, hidden fields, view visibility, and CSV
  injection escaping.
- `make pre-commit`.

## Phase 5: Views, Query Engine, And Scale

Branch: `phase-05-views-query-scale`

PR title: `Phase 5: Add scalable views and query engine`

Goal: make 90k+ row operational views usable.

Engineering guidance:

- Backend query service owns filter, sort, group, search, pagination, and
  visible-field projection.
- Frontend asks for a view page; it must not rebuild backend query behavior.
- Use `ValueResolver` query values.
- Add cursor pagination and hot-field indexing based on measured query paths.
- Optimize measured hotspots, not imagined ones.
- Hidden fields must not leak through query responses.

Required tests:

- 90k-row filtered view opens without loading all records.
- Hidden fields do not leak.
- Locked view blocks config edits.
- Personal view is only owner-editable.
- k6 read-heavy view test.
- `make pre-commit`.

## Phase 6: Migration-Grade Import UX And Table State

Branch: `phase-06-import-migration-ux`

PR title: `Phase 6: Add migration-grade import UX and table state`

Goal: make Airtable migration usable as a product workflow, not merely a CSV
parser. Imported operational tables must be readable, scrollable,
URL-addressable, explainable, and recoverable.

Research and migration notes:

- Airtable's CSV import flow is not a blind upload. It guides users through
  upload, table selection, merge settings, header detection, field mapping,
  sample preview, and an explicit create/update action.
- Airtable supports adding new records to an existing table and merging into
  existing records by a selected unique field such as an ID or email. Tabular
  should also add a third explicit mode: replace the current table schema/data
  after a destructive preview, import snapshot, and rollback plan.
- Airtable documents import limits around CSV size and row count. Tabular's
  internal target is larger because the questionnaire migration has 90k+ rows
  and ongoing weekly growth. Phase 6 makes the migration UX usable; the new
  Phase 7 production gate must move large imports to durable jobs before the app
  is trusted for production migration volume.
- The real questionnaire export is a hard requirement, not a toy fixture: it
  has 52 parsed rows, 163 columns, embedded newlines, repeated customer names,
  repeated customer IDs, duplicated Airtable headers, SLA/status/date fields,
  and link-looking columns. The planner must handle that shape cleanly before
  we trust it with the full migration.
- Research on messy CSVs and spreadsheet relationalization shows that files in
  the wild often need dialect detection, semantic column profiling, and
  normalization suggestions before they become useful relational tables. Use
  deterministic profiling first; reserve AI-assisted suggestions for Phase 12
  after permissions, audit, and preview/approval are strong.

Product guidance:

- The Import button must open a wizard, not fire an irreversible import.
- The wizard must show `Upload -> Profile -> Choose mode -> Map fields ->
  Preview -> Commit -> Report`.
- Import modes must be explicit:
  - `Create new table`: build a new table from the file and suggest the table
    name from the filename, headers, and detected entity.
  - `Append to current table`: map CSV columns into existing fields and
    optionally create new fields if the user has permission.
  - `Replace current table`: clear/rebuild the current table schema and rows
    after a destructive confirmation, import snapshot, and rollback path.
  - `Merge/update records`: select a unique key such as Airtable record ID,
    customer ID, Salesforce ID, email, or another unique field; preview creates,
    updates, unchanged rows, skipped rows, and duplicate-key rows.
- If a user imports into a starter table containing fields like `Name`,
  `Notes`, and `Status`, Tabular must ask whether to append/map or replace the
  table. It must not silently append 163 imported columns after starter fields.
- The imported table must become the active table after a successful create or
  replace import, and the active table/view must be encoded in the URL or a
  similarly durable route state. Refreshing the browser must return to the same
  table and view, not fall back to the first table in the base.
- Existing base URLs may continue to work, but deep links should support table
  and view state, for example `/base/:baseId?table=:tableId&view=:viewId` or a
  nested route. Pick the smallest route shape that fits Next.js and the current
  codebase.
- The grid must remain usable after a wide import:
  - one clear scroll owner for the data viewport
  - vertical scrolling through all loaded rows
  - horizontal scrolling through all imported columns
  - sticky field headers and row numbers
  - visible row count/import batch status
  - no clipped bottom rows because an outer wrapper uses `overflow-hidden`
  - no layout expansion that pushes the scroll area beyond the viewport
- After import commit, Tabular must reload the active view and show a report
  with row counts, field counts, skipped rows, warnings, and a `View imported
  records` action. Hidden fields, filters, pagination, or stale view state must
  never make a successful import look empty.
- Every import job should have an import batch ID/job ID so the user can filter
  imported records, inspect bad rows, retry a failed job, or roll back a recent
  import when the phase supports rollback.
- Table names must be editable inline from the table tab/header, with server
  validation for blank names, duplicate sibling table names, length, and
  permissions.
- Table deletion can be exposed only as a clear, confirmed action with current
  coarse edit permission. Fine-grained admin policy, soft delete, retention,
  restore, and audit hardening move to Phase 9.

Engineering guidance:

- Own this phase through an `ImportPlanner`, `ImportJobService`, and small
  table-state helpers. The UI should submit files/options and render
  plans/reports; it should not decide field types, write records, dedupe
  customers, create links, or hand-roll route persistence.
- Keep the import pipeline boring and testable:
  `parse -> profile -> infer -> map -> validate -> plan -> write -> report`.
- Build route-state helpers for active table/view selection. `BaseView` should
  not initialize active table only from `tables[0]` once durable route state
  exists.
- The grid scroll fix belongs at the layout boundary. Avoid sprinkling height
  hacks in individual cells. The table workspace should define a constrained
  viewport, and each view should own scroll behavior clearly.
- Add imported-table navigation as a product contract: after create/replace,
  update route state, select the imported table, load its default view, and
  preserve that state across refresh/back/forward.
- Field type inference must be header-aware and value-aware. Use confidence
  scores and reasons, then let the user override before commit.
- Inference candidates must cover:
  - text and long text
  - number, percent, currency, rating, and duration
  - checkbox/boolean, single select, and multi-select
  - date and date-time
  - URL, email, and phone
  - attachment-looking URLs as text/URL first, then attachment migration later
  - external IDs such as Airtable record ID, customer ID, Salesforce ID, and
    task/questionnaire IDs
  - linked record candidates when one column repeats and another table/entity
    can own the repeated values
- Do not infer formula, lookup, rollup, count, button, created-time, or
  modified-time fields directly from CSV without an explicit migration mapping
  and user approval. Imported computed outputs should usually land as static
  text/number/date fields until Phase 1/3 behavior can recreate them safely.
- Relationship inference must profile entity hints and repeated keys. For the
  questionnaire domain, detect candidates such as:
  - `Client`, `Client Name (Simple)`, `SecurityPal Customer ID`, `SF ID`, and
    customer start/end date as a possible `Customers` table.
  - `Questionnaire`, `Airtable Id`, status, SLA, due date, completion, and
    timeline fields as a possible `Questionnaires` table.
  - `Tasks`, task status, project lead, collaborators, and SLA task fields as a
    possible `Tasks` table or linked task fields.
- Relationship inference must propose a normalized import plan only when it can
  explain the evidence: entity name, unique key, dedupe count, link cardinality,
  fields assigned to each table, and sample records. The user approves the
  split; Tabular must never silently split one CSV into multiple tables.
- Normalized imports must write dimension/entity tables first, then workflow
  tables, then link fields/link rows. For example, create/dedupe `Customers` by
  customer ID or Salesforce ID, import `Questionnaires`, then link each
  questionnaire back to its customer.
- Preserve Airtable record IDs and source row numbers as metadata so parity
  checks, rollback, and audit can trace every migrated record.
- Large imports must become background jobs with chunked writes, progress,
  cancellation, retry-safe idempotency, and a durable report in Phase 7. Small
  imports may remain synchronous only if they use the same planner/report
  contract and cannot bypass the job safety rules.
- Import write paths must be transactional per chunk and must produce a clear
  failure mode: strict rollback, partial commit with skipped-row report, or
  cancelled job.
- Include questionnaire-shaped fixtures for the real migration domain. Keep the
  fixture small enough for unit tests and add a larger synthetic fixture for
  load/import-job testing.
- Add a migration parity report that includes source rows, imported rows,
  created/updated/skipped rows, duplicate headers, inferred field types,
  created select options, lossy coercions, link cardinality, computed-field
  fallbacks, and sample invalid rows.
- Use existing CSV parser, `ValueResolver`, field validation, query service,
  and Drizzle transaction patterns. Do not build a second validation path just
  for imports.

Required tests:

- Import planner handles a 163-column questionnaire-shaped CSV without blocking
  the UI path.
- `Create new table` creates fields, rows, a readable default view, and
  navigates to the created table.
- `Append to current table` maps existing fields and reports any created or
  skipped fields.
- `Replace current table` removes starter fields like `Name`, `Notes`, and
  `Status` only after explicit confirmation and rolls back on write failure.
- `Merge/update records` updates by selected key, creates unmatched rows, and
  reports duplicate/blank keys.
- Field type inference returns confidence and reasons for dates, statuses,
  numbers, booleans, URLs, customer IDs, Salesforce IDs, and long text.
- User overrides of inferred field types are honored by the write plan.
- Relationship inference proposes `Customers` plus `Questionnaires` links for a
  questionnaire fixture with repeated customer IDs, but does not split without
  approval.
- Link cardinality matches source after normalized import.
- Import report can filter or navigate to imported records.
- Imported wide table supports horizontal scrolling to the final imported field.
- Imported table supports vertical scrolling through all loaded records without
  clipped bottom rows.
- Refresh, back, and forward preserve active table and active view.
- Newly imported table remains selected after import commit and browser refresh.
- Inline table rename updates UI, server state, route state, and sibling table
  list without full-page confusion.
- Table delete requires confirmation and removes the table from navigation
  without leaving the base on a broken active table.
- `make pre-commit`.

## Phase 0-6 Production Audit Findings

This audit was added after inspecting upstream `main`, the eight open PR heads
for our work, and the code shipped through Phase 6. It exists so Phase 7 is
driven by concrete gaps, not guesswork.

Phase 0 missed or deferred:

- CI runs unit, logic, typecheck, and build, but not backend API verification,
  frontend browser verification, Docker smoke, production-start smoke, k6/load,
  or migration/import job checks.
- There is no typed production environment validation layer. Missing or weak
  `AUTH_SECRET`, `DATABASE_URL`, `REDIS_URL`, storage, proxy, and trusted-host
  values can fail late.
- `make pre-commit` is strong locally, but production-readiness gates are not
  separated into quick, full, load, smoke, and release gates.
- PR templates require OWASP notes, but there is no route inventory proving each
  route has authn, authz, validation, rate-limit classification, and tests.

Phase 1 missed or deferred:

- The value engine is a major improvement, but value parsing still needs
  fuzz/property tests for import/export/display/query round trips.
- The duration import bug showed that canonical normalization must be
  idempotent and unit-aware. Phase 7 must add regression fixtures around
  real Airtable values, not only toy samples.
- Error handling still returns plain strings from many service errors. A
  production app needs stable error codes and safe public messages.
- Formula/lookup/rollup correctness needs larger dependency, recompute, and
  parity fixtures before migration trust.

Phase 2 missed or deferred:

- Grid helpers are cleaner, but production grid behavior still needs keyboard,
  paste, undo/redo, selection, and pagination tests against server-paged views.
- Undo/redo is client-local and not yet tied to conflict detection, revisions,
  or multi-user edits.
- Large-grid browser performance needs measured budgets for 90k-row bases and
  very wide imports.
- Accessibility and focus behavior need a keyboard/screen-reader pass before
  the grid becomes the daily operational tool.

Phase 3 missed or deferred:

- Attachments are metadata-only. There is no real upload adapter, signed upload
  flow, storage lifecycle, malware scanning worker, quarantine, or retention.
- Field options are mostly JSON blobs. Production needs per-type option schemas
  and migration-safe validation.
- Required/unique rules are service-level checks. At scale they need stronger
  race-condition protection, measured query behavior, and clear conflict
  errors.
- Field/table deletes are hard-destructive and depend on cleanup behavior, not
  audit-backed soft-delete/restore.

Phase 4 missed or deferred:

- CSV parsing handles key Airtable quirks, but backend imports still need
  server-side row/column limits, dialect/encoding reporting, and large-file
  streaming or job-backed handling.
- CSV export must explicitly protect against spreadsheet formula injection and
  very large response memory pressure.
- JSON backup exists, but production needs restore verification, backup
  integrity checks, and operator runbooks.
- Import/export route tests need cross-tenant, role, hidden-field, and
  destructive-mode coverage for every path.

Phase 5 missed or deferred:

- Server-side view paging is in place, but sorted views still use offset
  cursors and computed/relationship-heavy views fall back to a bounded
  materialized scan.
- Hot-field indexes, query telemetry, explain-plan capture, slow-query logging,
  and 90k-row regression fixtures are not complete.
- Hidden fields are projected out of view payloads, but route-wide permission
  and export visibility tests still need expansion.
- k6 exists, but it is not part of a production-readiness gate with seeded large
  data and published thresholds.

Phase 6 missed or deferred:

- Migration UX is much better, but imports are still mostly synchronous service
  operations. Large imports need durable jobs, progress, cancellation,
  idempotency, retry, and durable reports.
- Replace import is transactional, but production still needs snapshots,
  rollback/restore, and audit before destructive table changes are trusted.
- Merge imports need stronger duplicate-key handling, idempotency, transaction
  boundaries, and rollback semantics.
- Relationship inference is advisory only. Normalized multi-table execution
  still needs approval, parity reporting, and link cardinality verification.
- Table rename/delete exists, but delete is still hard delete. Admin policy,
  soft delete, retention, restore, and audit move to Phase 9.
- Invalid or stale base/table/view route states need graceful product recovery
  instead of confusing empty or 404-looking states.

## Phase 7: Production Readiness, Reliability, And Safety Gate

Branch: `phase-07-production-readiness`

PR title: `Phase 7: Add production readiness and reliability gate`

Goal: turn the Phase 0-6 feature foundation into a production-safe baseline
before building public forms, deeper permissions, automations, interfaces, or
AI surfaces.

This phase is intentionally not a shiny feature phase. It is the senior
architect gate that makes Tabular boring in the best possible way: observable,
recoverable, secure by default, load-tested, and honest about failure modes.

Product guidance:

- The app must be safe to run against real questionnaire data without depending
  on developer knowledge or lucky manual steps.
- A production user should never wonder whether an import is still running,
  whether a destructive operation can be restored, whether a stale URL means
  the app crashed, or whether hidden data leaked through export/query payloads.
- Production readiness must be visible in the product: clear loading states,
  progress states, empty/error states, retry actions, import reports, and
  recovery paths.
- Keep the UI restrained and operational. This phase should reduce confusion,
  not add decorative surfaces.

Engineering guidance:

- Do not create a giant `production.ts` dumping ground. Add small owners:
  - `env` owner for validated runtime configuration.
  - `route-policy` or equivalent owner for route auth/rate-limit metadata.
  - `import-job` owner for durable import execution and reports.
  - `audit/event` owner for production safety events until Phase 9 deepens
    full audit.
  - `observability` owner for request IDs, structured logs, metrics, and
    health/readiness checks.
- Keep routes thin. Production checks must be route metadata plus shared
  services, not copied `if` statements.
- Use existing Next.js, Auth.js, Drizzle, BullMQ, Zod, and Makefile patterns
  before adding custom machinery.
- Do not write a custom queue, logger, metrics collector, CSV streamer, or
  validator if a proven dependency/local helper already solves the problem.
- Every hardening item needs a regression test or operational smoke check.

Required implementation:

- Production environment contract:
  - Add typed env validation for app, database, auth, Redis, storage, email,
    Slack/Google/Salesforce placeholders, and trusted URL/proxy settings.
  - Make dev login impossible in production unless a deliberately named
    local-only escape hatch is present and loudly rejected in CI/release smoke.
  - Add startup diagnostics that fail fast on missing production-critical
    secrets instead of failing during the first user action.
  - Split health into liveness and readiness. Readiness must check database,
    Redis/queue when enabled, and migration state.
- Route inventory and security matrix:
  - Generate or maintain a route inventory covering every `src/app/api/**`
    route.
  - Each route must declare authn, authz owner, validation schema, rate-limit
    action, side-effect level, and test coverage.
  - Add a verification script that fails when a new route is missing policy
    metadata.
  - Convert generic thrown errors that reach clients into safe public errors
    with stable codes and request IDs.
- Rate limiting and abuse controls:
  - Replace IP-only rate limiting with policy keyed by user, workspace, base,
    action, and IP fallback.
  - Add separate policies for reads, writes, imports, exports, auth, comments,
    automations, and destructive actions.
  - Preserve local/k6 testing ergonomics so 200-300 virtual users behind one
    client IP do not create false failures.
  - Add backend tests for NAT/proxy scenarios and production-on defaults.
- Durable import jobs:
  - Introduce import job records and reports for large or destructive imports.
  - Enqueue large imports through BullMQ or the existing worker infrastructure.
  - Track progress, processed rows, created/updated/skipped rows, bad rows,
    warnings, started/completed timestamps, actor, target table/base, and source
    filename/hash when available.
  - Add idempotency keys so refresh/retry does not duplicate imported rows.
  - Add cancellation and retry-safe failure states.
  - Keep small synchronous imports only as a wrapper around the same
    planner/report contract.
- Destructive-operation safety:
  - Add safety events for table delete, field delete, replace import, bulk
    import, export, and base/table rename.
  - Add lightweight snapshots or restore data for replace import and table
    delete where feasible.
  - Keep full soft-delete/admin/audit policy in Phase 9, but do not let Phase 7
    ship destructive behavior without traceability and recovery notes.
  - Block accidental double-submit for destructive actions at both UI and API
    levels.
- Data integrity and validation:
  - Add per-field option schemas so invalid field config cannot be saved by API,
    import mapping, or future form/interface builders.
  - Add duplicate sibling-name checks for base/table/field/view names where the
    product expects uniqueness or clear disambiguation.
  - Add optimistic concurrency or version checks for view config, field config,
    and record updates that are likely to conflict.
  - Add import/export round-trip tests for dates, durations, select options,
    duplicate headers, formula-looking text, and hidden fields.
  - Fix CSV export formula injection if any dangerous leading characters can
    reach spreadsheets unescaped.
- Scale and performance gates:
  - Add deterministic large-data fixtures for 90k records, wide tables, and
    questionnaire-shaped imports.
  - Add `make verify-load` and document k6 installation/fallback behavior.
  - Add thresholds for p95/p99 route latency, error rate, browser render time,
    memory, and view query modes.
  - Capture slow query telemetry for view reads, exports, imports, and record
    writes.
  - Add measured plans for hot-field JSONB indexes before creating indexes.
- CI/release gates:
  - Add a full CI job that runs typecheck, unit, logic, backend, frontend, and
    build with service containers.
  - Add a release smoke gate for `make prod-up`, migrations, health readiness,
    login, open base, import small CSV, export CSV, and shutdown.
  - Keep quick PR gates fast, but make the full gate easy to run and required
    before a production-tagged release.
- Observability:
  - Add request IDs to responses and logs.
  - Add structured logs for route errors, imports, exports, destructive actions,
    worker jobs, and slow queries.
  - Add metrics counters/timers for view queries, import jobs, automation queue,
    error rates, and rate-limit decisions.
  - Add an operator-facing worker/job health surface or JSON endpoint.
- Backup and recovery:
  - Add Makefile targets and docs for backup, restore, verify-restore, and
    emergency export.
  - Add a restore smoke test against a throwaway database or documented local
    flow.
  - Document rollback for every destructive production operation.
- UX reliability:
  - Add graceful stale base/table/view handling with a clear "not found or no
    access" state and navigation back to available bases.
  - Add consistent loading, empty, error, retry, and disabled states for imports,
    views, table tabs, field actions, and delete/replace flows.
  - Add browser checks for refresh/back/forward after import, deleted table,
    renamed table, stale route, and wide-grid scroll.

Required tests:

- Env validation rejects missing production secrets and weak `AUTH_SECRET`.
- Dev login is unavailable in production release smoke.
- Every API route appears in the route inventory with authn/authz/validation/
  rate-limit metadata.
- Cross-tenant read/write/export/import/delete checks cover every route family
  built through Phase 6.
- Client-safe errors include stable error codes and request IDs without leaking
  stack traces or raw database errors.
- Rate limits work by user/workspace/action and pass a 300-user NAT/proxy load
  scenario.
- Large questionnaire-shaped import enqueues a job, reports progress, supports
  cancellation, and resumes/retries without duplicate records.
- Replace import creates a recoverable snapshot or documented restore report.
- CSV export escapes spreadsheet-formula-leading characters.
- 90k-row seeded view passes backend and browser performance thresholds.
- k6 read/write/import smoke passes documented thresholds.
- Production Docker smoke passes: migrate, start, readiness, login, base open,
  import/export, worker health, shutdown.
- Stale table/view/base URLs recover gracefully.
- `make pre-commit`.
- `make verify-load`.
- `make prod-smoke` or equivalent release smoke target.

Out of scope:

- Fine-grained configurable permissions UI.
- Full audit log product surface.
- Public forms.
- Full attachment storage provider rollout.
- Full normalized multi-table Airtable import execution.
- AI-assisted import/schema generation.

## Phase 8: Forms And Capture

Branch: `phase-08-forms-capture`

PR title: `Phase 8: Add forms and capture workflows`

Goal: turn form view into a secure intake product.

Engineering guidance:

- Public form submission goes through a dedicated form service.
- Forms must reuse field validation and `ValueResolver`; no separate form-only
  field rules.
- Hidden fields are not security boundaries.
- Support public, password, domain, and authenticated share modes through
  explicit trust-boundary checks.
- Add anti-spam, rate-limit, submission audit trail, required fields, defaults,
  hidden fields, groups, descriptions, and conditional visibility.

Required tests:

- Public form creates record without workspace membership.
- Internal form cannot be used as public bypass.
- Hidden fields are not trusted for authorization.
- Required fields block submission.
- Form trigger fires once.
- `make pre-commit`.

## Phase 9: Permissions, Collaboration, And Audit

Branch: `phase-09-permissions-audit`

PR title: `Phase 9: Add permissions, collaboration, and audit`

Goal: make access control trustworthy.

Engineering guidance:

- Central permission service owns all authz decisions.
- API routes must call permission service and must not hand-roll role logic.
- Cover workspace, base, table, field, view, form, interface, and automation
  action permissions.
- Base create/delete and table create/delete/rename must go through the
  permission service. Start with owner/admin/creator policies, then make the
  policy configurable when admin controls arrive.
- Deleting bases and tables must be a soft-delete lifecycle first: confirm,
  snapshot/export when appropriate, mark deleted, hide from normal lists, allow
  restore within a retention window, then hard-delete by maintenance job.
- Destructive actions must be audit logged with actor, target, timestamp,
  source IP/user agent when available, row/field impact counts, and rollback or
  restore metadata.
- Harden invite/member flows, share links, export controls, field locks,
  comments, revisions, activity feed, and audit log.
- Rate limiting must account for user, workspace, base, and action, not only
  client IP.

Required tests:

- Cross-tenant access fails for every route family.
- Email-pinned invite rejects wrong email.
- Field lock blocks grid, API, form, and automation writes.
- Share links cannot mutate unless configured.
- Non-admin users cannot delete bases or tables.
- Soft-deleted tables and bases disappear from normal navigation and can be
  restored by an authorized user during retention.
- Delete/restore actions are written to the audit log.
- 300-user NAT/proxy rate-limit scenario is safe.
- `make pre-commit`.

## Phase 10: Automations Reliability

Branch: `phase-10-automations-reliability`

PR title: `Phase 10: Harden automations reliability`

Goal: make automations dependable for SLA and integration workflows.

Engineering guidance:

- External integrations go through an outbox.
- Scheduled runner must define missed-run semantics, idempotency keys, drift
  metrics, pause/resume, concurrency, and timezone behavior.
- Add retry, backoff, dead-letter, quotas, cancellation, revision history,
  secrets, and worker health visibility.
- Automation failures must persist useful errors and must not crash unrelated
  automations.

Required tests:

- Scheduled trigger does not duplicate after restart.
- Webhook validates and rate-limits payloads.
- Failed step persists error.
- Retry does not duplicate non-idempotent actions.
- Queue depth and run lag are visible.
- `make pre-commit`.

## Phase 11: Interfaces And App Builder

Branch: `phase-11-interfaces-app-builder`

PR title: `Phase 11: Add interfaces and app builder`

Goal: build role-specific apps on existing primitives.

Engineering guidance:

- Interfaces consume existing records, views, forms, permissions, and
  automations.
- Do not duplicate grid or form behavior.
- Add builder mode and end-user mode with explicit permission binding.
- Buttons/actions call existing automation services safely.
- Hidden and forbidden fields must remain hidden at the backend response layer.

Required tests:

- Interface respects backend permissions.
- End-user edits flow through record service.
- Buttons trigger automations safely.
- Hidden and forbidden fields remain hidden.
- `make pre-commit`.

## Phase 12: Platform, Sync, And AI-Ready Core

Branch: `phase-12-platform-ai-core`

PR title: `Phase 12: Add platform, sync, and AI-ready core`

Goal: expose Tabular safely to external tools and AI-native workflows.

Engineering guidance:

- API, MCP, sync, connectors, plugins, and AI must act as the current user, not
  as a superuser.
- AI mutations require preview and approval.
- AI/API/MCP actions must be audit logged.
- AI-assisted import/schema work must consume the Phase 6 import planner. It
  may propose field types, table splits, links, formulas, views, and cleanup
  rules, but it must return an editable plan and never write directly.
- AI should explain uncertainty and ask for approval on destructive or
  relationship-changing import decisions, especially table replacement,
  customer dedupe keys, and computed-field recreation.
- Add schema, field, view, form, and automation intent metadata only after
  permissions and audit are strong.
- Public API tokens need scoped access and test coverage for every endpoint.

Required tests:

- API scopes restrict every endpoint.
- MCP respects user permissions.
- AI cannot access forbidden data.
- Generated changes require approval.
- AI-generated import plans cannot replace tables, split tables, or create
  links without user approval and audit entries.
- Audit log captures AI/API actions.
- `make pre-commit`.

## Final Acceptance

Tabular is ready for internal Airtable replacement when:

- 90k+ operational rows work with server-side views.
- 200-300 concurrent users pass k6 and browser load gates.
- Questionnaire, task, and customer workflows are importable and testable.
- SLA automations and Slack/Sheets/Salesforce fanout are observable and
  retry-safe.
- Permissions, forms, views, imports, exports, and audit logs are
  production-grade.
- Code remains readable, service-owned, tested, and boring in the best possible
  way.
