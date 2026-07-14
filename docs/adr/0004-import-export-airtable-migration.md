# ADR 0004: Import, Export, And Airtable Migration

## Status

Accepted.

## Context

Tabular needs safe data movement before it can replace Airtable for operational questionnaire workflows. The first migration target is a base with roughly 90k existing records and weekly growth from 200-300 new questionnaires. The import path must catch invalid rows before writes, support strict rollback semantics, allow partial progress when explicitly chosen, and preserve enough source identity to rebuild linked records after all rows exist.

## Decision

Phase 4 separates import/export into four ownership layers:

- CSV parsing and serialization live in `src/lib/csv.ts`.
- Import planning, type inference, validation reporting, and Airtable migration planning live in `src/lib/import-export.ts`.
- Database writes and export reads live in `src/server/services/import-export.ts`.
- UI components only collect CSV text, display preview/report output, and call API routes.

CSV import supports preview, strict commit, and partial commit. Strict mode writes nothing when preview validation finds invalid rows, and rolls back created fields/records if a later write fails. Partial mode imports valid rows and reports skipped rows. New CSV fields are inferred conservatively and direct writes still go through the shared field behavior validation path.

CSV export can target a full table or a specific view. View exports respect hidden fields, field order, filters, and sorts. JSON backup export returns the base, tables, fields, views, records, and link edges.

The Airtable import plan preserves Airtable record ids in a dedicated `__airtableRecordId` field, imports tables and scalar fields before records, recreates linked records after all rows exist, and produces a computed-field parity report for formulas, lookups, rollups, and counts.

## Consequences

- Import UI stays small and does not duplicate business logic.
- API routes remain thin: authenticate, authorize, validate input, call service, return response.
- Existing field behavior and value resolver paths remain the source of truth for validation and export values.
- Large import jobs still need queue-backed execution and progress polling in a later hardening pass.
- Airtable migration execution is intentionally staged after the planning contract is testable.

## Security Notes

- Import/export routes require table or base access before touching data.
- CSV input is parsed as data, not evaluated.
- Export output is scoped by backend access checks and view visibility.
- Future public import/upload support must add file size limits, malware scanning hooks for attachments, and rate limits per user/workspace/action.
