# ADR 0005: Views, Query Engine, And Scale

## Status

Accepted.

## Context

Tabular is moving from demo-sized tables to operational Airtable replacement work. The questionnaire workflow has roughly 90k existing rows and steady weekly growth. A grid that downloads all records and then filters/sorts in React will fail this product shape: it leaks hidden cells into the browser payload, makes every view component duplicate query behavior, and turns large bases into memory problems.

## Decision

Phase 5 makes the backend the owner of view records:

- UI asks `GET /api/views/:viewId/records` for a bounded page.
- The view query service owns filter, sort, search, projection, pagination, and query metadata.
- Common scalar filters/search/sorts are pushed to Postgres against JSONB cells.
- Default position-ordered views use keyset cursors.
- Sorted views use cursor tokens backed by offsets until per-field indexes and sort cursors are introduced.
- Computed or relationship-heavy query rules use a bounded materialized fallback with an explicit warning.
- Hidden fields are projected out of record `cells` before the payload reaches the browser.
- Visible computed fields are resolved before projection so formulas, lookups, rollups, counts, and metadata fields still render.

View metadata stays in `views.config` for now:

- `visibility: "collaborative" | "personal"`
- `ownerId`
- `locked`
- `favorite`
- `section`

Personal views are stamped with the current user. Locked views reject later config edits through the route/service layer.

## Hot-Field Indexing Strategy

The first implementation keeps schema churn low. The next scale step is measured indexing:

- Track frequently filtered/sorted field ids per table/view.
- Promote hot scalar fields to generated expression indexes, for example JSONB text, numeric casts, dates, and single-select ids.
- Keep computed fields out of generated indexes until their dependencies and recompute semantics are explicit.
- Add query-plan telemetry before adding indexes, so we optimize measured pain rather than guessing.

## Security Notes

- Hidden fields are not treated as a permission boundary, but their cell values should not be sent in view-record payloads.
- API routes stay thin: auth, table access, validated query params, service call.
- Personal view ownership is server-stamped; clients cannot assign a personal view to another user.
- Locked view enforcement lives in the service, not in React.

## Consequences

- Grid/list view scale improves immediately because initial view loads are bounded.
- Existing kanban/calendar/gallery views consume the same server-owned records and no longer duplicate filter/sort behavior.
- Unsupported query combinations still work, but with a bounded fallback and a warning.
- Later Phase 5b work should add true sort-key cursors, query telemetry, hot-field indexes, and richer view management UI for favorites/sections/personal/locked controls.
