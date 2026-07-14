# ADR 0006: Migration-Grade Import UX And Table State

## Status

Accepted.

## Context

Phase 4 gave Tabular a safe import/export foundation. Phase 5 moved large views to
server-owned query pages. Phase 6 connects those foundations to real Airtable
migration work: wide CSV files, questionnaire-style operational data, table
creation from imports, append/replace/merge choices, refresh-safe table state,
and a grid that can inspect imported records without trapping the user.

The first real migration input included an Airtable-exported CSV with duplicate
header names and 163 columns. That exposed product gaps that are bigger than a
normal CSV upload:

- Airtable exports can contain duplicate visible field names.
- Users need to choose whether an import creates a clean table, appends rows,
  replaces an existing table, or merges into existing records.
- Starter fields such as Name, Notes, and Status must not silently pollute a
  newly imported schema.
- Field type inference must inspect headers and values, explain its confidence,
  and remain overrideable by the user.
- Customer/questionnaire data may contain relationship hints, but Tabular must
  not split a user's data into multiple tables without an explicit review step.
- Imported tables, selected views, and wide grids must survive refreshes and
  normal browser navigation.
- Rename and delete affordances are needed immediately, while full admin policy,
  audit, and soft-delete behavior belong to the later permissions/audit phase.

## Decision

Phase 6 introduces migration-grade import UX without moving business logic into
React. The ownership contract is:

- API routes stay thin: authenticate, authorize, validate, call a service, return
  a response.
- Import planning and field inference live in `src/lib/import-export.ts`.
- Import writes live in `src/server/services/import-export.ts`.
- UI components collect user choices, show previews/reports, and delegate the
  actual behavior to API/service contracts.
- Value parsing stays aligned with the value engine instead of creating a second
  CSV-only validation path.

Import has two separate concepts:

- Row error mode: `strict` or `partial`.
- Target mode: `create`, `append`, `replace`, or `merge`.

The target-mode rules are:

- `create` builds a new table with fields inferred from the import. It does not
  inherit the starter table fields.
- `append` adds compatible rows to the selected table and reports validation
  failures.
- `replace` requires an explicit confirmation flag and replaces the selected
  table schema/records with the import result.
- `merge` requires a selected match field and updates existing records when a
  source row matches; unmatched rows are inserted.

Wide imports use deterministic, header-and-sample-aware inference. The preview
returns the selected type, confidence, and reasons so users can review or
override the plan before writing data. Relationship detection is advisory only:
it may suggest that columns such as customer identifiers or names could become a
linked customer table, but execution of normalized multi-table imports waits for
a later reviewed migration workflow.

Base-level import endpoints own table-creation imports. Table-level import
endpoints remain for append, replace, and merge. This keeps the UI simple while
keeping write behavior service-owned.

Active table and view state is URL-addressable. `BaseView` reads and writes
`table` and `view` query parameters so refresh, back/forward navigation, and
direct links return the user to the same imported table or view. Grid scroll is
owned by the layout boundary: page and workspace containers use constrained flex
layouts, and the grid gets one clear scroll viewport for large row/column sets.

Inline table rename and confirmed table delete are accepted in Phase 6 as
product-critical migration tools. They use existing table APIs and remain simple
until Phase 8 centralizes field/table/base deletion policy, audit logging,
soft-delete retention, and admin-only controls.

## Security And Privacy Considerations

- Import endpoints require authenticated access to the target base or table.
- Destructive target modes require explicit confirmation in the request.
- Delete actions require user confirmation in the UI.
- The UI never decides authorization or validation outcomes.
- Imported CSV text is parsed as data and is never evaluated as code.
- Field inference is deterministic and explainable; it must not silently execute
  formulas, scripts, or relationship rewrites.
- Relationship suggestions are metadata only until a reviewed multi-table import
  flow exists.
- Later Phase 8 work must add centralized delete permissions, audit records,
  soft-delete retention, rate limits by user/workspace/action, and stronger
  admin controls.

## Testing Strategy

Phase 6 must keep these checks in the pre-commit gate:

- Import planner tests for duplicate headers, field type inference, merge
  candidates, and relationship suggestions.
- Backend verification for create, append, replace, and merge import modes.
- Frontend verification for route-preserved table/view selection, refresh
  behavior, import result navigation, and wide-grid scrolling.
- The full `make pre-commit` gate before commit and push.

## Consequences And Rollback Notes

The user-facing import path is safer and closer to Airtable migration reality:
wide CSVs can create clean tables, destructive modes are explicit, merge behavior
is reviewable, and users can navigate back to the imported table after refresh.

The tradeoff is that import jobs are still synchronous service operations in
this phase. Durable background import jobs, resumable progress, multi-table
normalization execution, and audit-backed destructive operations remain future
work. If Phase 6 needs to be rolled back, the base/table import endpoints and UI
wizard can be reverted without changing the Phase 4 CSV parser contract or the
Phase 5 view query service.
