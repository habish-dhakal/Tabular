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

## Phase 4: Import, Export, And Airtable Data Movement

Branch: `phase-04-import-export`

PR title: `Phase 4: Add import/export and Airtable data movement`

Goal: safely move Airtable-shaped data into and out of Tabular without
surprising users, losing data, or forcing wide operational CSVs into the wrong
shape.

Research and migration notes:

- Airtable's CSV import flow is not a blind upload. It guides users through
  upload, table selection, merge settings, header detection, field mapping,
  sample preview, and an explicit create/update action.
- Airtable supports adding new records to an existing table and merging into
  existing records by a selected unique field such as an ID or email. Tabular
  should also add a third mode that Airtable does not make obvious enough:
  replace the current table schema/data after a destructive preview and
  rollback plan.
- Airtable documents import limits around CSV size and row count. Tabular's
  internal target is larger because the questionnaire migration has 90k+ rows
  and ongoing weekly growth, so Phase 4 must use import jobs instead of doing
  large writes in a request/response UI path.
- The real questionnaire export is a hard requirement, not a toy fixture: it
  has 52 parsed rows, 163 columns, embedded newlines, repeated customer names,
  repeated customer IDs, duplicated Airtable headers, SLA/status/date fields,
  and link-looking columns. The planner must handle that shape cleanly before
  we trust it with the full migration.
- Research on messy CSVs and spreadsheet relationalization shows that files in
  the wild often need dialect detection, semantic column profiling, and
  normalization suggestions before they become useful relational tables. Use
  deterministic profiling first; reserve AI-assisted suggestions for Phase 10
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
- After import commit, Tabular must reload the active view and show a report
  with row counts, field counts, skipped rows, warnings, and a `View imported
  records` action. Hidden fields, filters, or pagination must never make a
  successful import look empty.
- Every import job should have an import batch ID/job ID so the user can filter
  imported records, inspect bad rows, retry a failed job, or roll back a recent
  import when the phase supports rollback.
- Table names must be editable inline from the table tab/header, with server
  validation for blank names, duplicate sibling table names, length, and
  permissions.

Engineering guidance:

- Own this phase through an `ImportPlanner` and `ImportJobService`. The UI
  should submit files/options and render plans/reports; it should not decide
  field types, write records, dedupe customers, or create links.
- Keep the import pipeline boring and testable:
  `parse -> profile -> infer -> map -> validate -> plan -> write -> report`.
- Parsing must support duplicate headers by stable disambiguation, for example
  `Questionnaire Wizard?` and `Questionnaire Wizard? (2)`, while preserving
  both column values.
- Parsing must tolerate embedded newlines, quoted cells, empty trailing columns,
  common Airtable CSV quirks, and future dialect detection for delimiter/quote
  variations.
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
- Export must use the same value engine as imports and must defend against CSV
  formula injection by escaping dangerous spreadsheet-leading characters when
  exporting or previewing untrusted values.
- File upload validation must enforce size, extension/content hints, encoding,
  row/column limits, tenant ownership, authz, and rate limits. Never trust the
  browser-provided MIME type as the only guard.
- Large imports must run as background jobs with chunked writes, progress,
  cancellation, retry-safe idempotency, and a durable report. A request handler
  should enqueue work and return job status, not hold the full migration open.
- Import write paths must be transactional per chunk and must produce a clear
  failure mode: strict rollback, partial commit with skipped-row report, or
  cancelled job.
- Export by table/view must respect permissions, hidden fields, view filters,
  and field visibility.
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

- Uploaded Airtable CSV with duplicate headers preserves both columns and both
  values.
- Embedded newlines parse into the correct record count.
- Import planner handles a 163-column questionnaire-shaped CSV without blocking
  the UI path.
- `Create new table` creates fields, rows, and a readable default view.
- `Append to current table` maps existing fields and reports any created or
  skipped fields.
- `Replace current table` removes starter fields like `Name`, `Notes`, and
  `Status` only after explicit confirmation and rolls back on write failure.
- `Merge/update records` updates by selected key, creates unmatched rows, and
  reports duplicate/blank keys.
- Invalid rows report before write.
- Strict mode rolls back.
- Partial mode reports skipped rows.
- Field type inference returns confidence and reasons for dates, statuses,
  numbers, booleans, URLs, customer IDs, Salesforce IDs, and long text.
- User overrides of inferred field types are honored by the write plan.
- Relationship inference proposes `Customers` plus `Questionnaires` links for a
  questionnaire fixture with repeated customer IDs, but does not split without
  approval.
- Link cardinality matches source after normalized import.
- Import report can filter or navigate to imported records.
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

## Phase 6: Forms And Capture

Branch: `phase-06-forms-capture`

PR title: `Phase 6: Add forms and capture workflows`

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

## Phase 7: Permissions, Collaboration, And Audit

Branch: `phase-07-permissions-audit`

PR title: `Phase 7: Add permissions, collaboration, and audit`

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

## Phase 8: Automations Reliability

Branch: `phase-08-automations-reliability`

PR title: `Phase 8: Harden automations reliability`

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

## Phase 9: Interfaces And App Builder

Branch: `phase-09-interfaces-app-builder`

PR title: `Phase 9: Add interfaces and app builder`

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

## Phase 10: Platform, Sync, And AI-Ready Core

Branch: `phase-10-platform-ai-core`

PR title: `Phase 10: Add platform, sync, and AI-ready core`

Goal: expose Tabular safely to external tools and AI-native workflows.

Engineering guidance:

- API, MCP, sync, connectors, plugins, and AI must act as the current user, not
  as a superuser.
- AI mutations require preview and approval.
- AI/API/MCP actions must be audit logged.
- AI-assisted import/schema work must consume the Phase 4 import planner. It
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
