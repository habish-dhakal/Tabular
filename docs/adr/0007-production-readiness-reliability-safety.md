# ADR 0007: Production Readiness, Reliability, And Safety Gate

## Status

Accepted.

## Context

Phases 0-6 moved Tabular from a demo Airtable-style foundation toward a real
operational product: engineering gates, value semantics, grid behavior, field
contracts, import/export, server-side views, and migration-grade import UX.

That work also exposed production gaps that should be closed before public forms,
deeper permissions, automations, interfaces, or AI are built on top:

- CI does not yet run the full backend/browser/product gate.
- Runtime configuration is not validated as a first-class contract.
- Imports can still run synchronously for shapes that should become durable jobs.
- Destructive operations can hard-delete or replace data without production-grade
  snapshots, restore paths, or audit-backed traceability.
- Rate limiting is still too coarse for real users behind NAT/proxies.
- View scale has bounded fallbacks but needs measured query telemetry, load
  thresholds, and release gates.
- Some errors reaching clients are raw service strings instead of stable safe
  errors with request IDs.
- Attachments, field options, import/export limits, stale route states, and
  backup/restore flows need production guardrails.

The new Phase 7 is therefore a production gate, not a feature phase.

## Decision

Insert Phase 7 before forms and renumber later phases:

- Phase 7 becomes Production Readiness, Reliability, And Safety Gate.
- Forms move to Phase 8.
- Permissions, Collaboration, And Audit move to Phase 9.
- Automations move to Phase 10.
- Interfaces move to Phase 11.
- Platform, Sync, And AI-Ready Core moves to Phase 12.

Phase 7 owns cross-cutting production contracts that protect the Phase 0-6
foundation:

- Typed environment validation and startup diagnostics.
- Liveness/readiness health checks.
- Route inventory with authn, authz, validation, rate-limit, side-effect, and
  test metadata.
- Safe public error responses with stable codes and request IDs.
- User/workspace/action-aware rate limiting.
- Durable import jobs for large or destructive imports.
- Production safety events for destructive and high-risk operations.
- Backup, restore, and release smoke workflows.
- Observability for routes, jobs, workers, imports, exports, and slow queries.
- Large-data and load gates for 90k-row operational views.
- Stale route and UX recovery states.

Phase 7 must not become a dumping ground. The implementation should add small,
reviewable owners:

- `env` for runtime configuration.
- `route-policy` for route security metadata.
- `import-job` for durable import execution and reports.
- `observability` for logs, metrics, request IDs, and health.
- `production-safety` or equivalent for lightweight traceability before the full
  audit product arrives in Phase 9.

## Security And Privacy Considerations

- Dev login must be unavailable in production release smoke.
- Client-visible errors must not leak stack traces, SQL details, secrets, or raw
  provider payloads.
- Import/export/delete/replace routes need route-level side-effect
  classification and stronger rate limits.
- Destructive operations require traceability and recovery notes before full
  Phase 9 audit/soft-delete work.
- Cross-tenant tests must cover every route family built through Phase 6.
- Export and import paths must protect against CSV formula injection, accidental
  large payloads, and hidden-field leaks.

## Testing Strategy

Phase 7 is accepted only when these gates exist and pass:

- `make pre-commit`
- full CI with unit, logic, backend, frontend, typecheck, and build
- production Docker/release smoke
- large-data view and import regression fixtures
- k6 load smoke with documented thresholds
- route inventory verification
- production env validation tests
- stale route recovery browser tests
- backup/restore smoke or documented executable flow

## Consequences And Rollback Notes

The roadmap becomes longer by one phase, but the later feature phases become
safer and easier to review. Public forms, permissions, automations, platform
APIs, and AI will sit on a production baseline instead of inheriting fragile
demo assumptions.

Rollback is straightforward because Phase 7 should add guardrails and contracts,
not change product domain semantics. If a hardening item is too large, split it
by behavior, for example:

- `phase-07a-production-env-and-route-policy`
- `phase-07b-import-jobs-and-recovery`
- `phase-07c-load-observability-and-release-gates`
