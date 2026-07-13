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

Goal: safely move Airtable-shaped data into and out of Tabular.

Engineering guidance:

- Separate parsing, validation, mapping, database writing, and reporting.
- Import UI must not contain import business logic.
- Preserve Airtable record IDs during migration.
- Import tables before links, then recreate linked records.
- Produce a parity report for formulas, lookups, rollups, links, skipped rows,
  and lossy mappings.
- Include questionnaire-shaped fixtures for the real migration domain.

Required tests:

- Invalid rows report before write.
- Strict mode rolls back.
- Partial mode reports skipped rows.
- Export respects permissions and view visibility.
- Link cardinality matches source.
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
- Harden invite/member flows, share links, export controls, field locks,
  comments, revisions, activity feed, and audit log.
- Rate limiting must account for user, workspace, base, and action, not only
  client IP.

Required tests:

- Cross-tenant access fails for every route family.
- Email-pinned invite rejects wrong email.
- Field lock blocks grid, API, form, and automation writes.
- Share links cannot mutate unless configured.
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
- Add schema, field, view, form, and automation intent metadata only after
  permissions and audit are strong.
- Public API tokens need scoped access and test coverage for every endpoint.

Required tests:

- API scopes restrict every endpoint.
- MCP respects user permissions.
- AI cannot access forbidden data.
- Generated changes require approval.
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
