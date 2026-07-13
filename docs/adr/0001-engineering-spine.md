# ADR 0001: Engineering Spine And Local Gates

Status: accepted

## Context

Tabular is moving toward an Airtable-grade product through multiple large phases:
values, grid, fields, import/export, query scale, forms, permissions,
automations, interfaces, and platform/AI surfaces. Those phases will be built by
humans and agents over time, so the repo needs a small set of repeatable habits
before feature work grows.

## Decision

The Makefile is the official command surface for local development. Developers
use `make help` to discover commands, `make up/down/restart` for local
infrastructure, and `make pre-commit` as the local gate before committing.

Vitest is the unit-test framework for TDD-friendly service/helper coverage. The
existing verification scripts remain in place, but they are not a replacement
for focused unit tests written alongside new behavior.

Every PR must include acceptance criteria, test evidence, authz notes,
validation notes, OWASP/ASVS notes, rollback notes, and clear out-of-scope
boundaries. Every major product contract gets an ADR before implementation.

## Security And Privacy Considerations

Security-sensitive behavior must be service-owned and testable. API routes
should call shared permission and validation services instead of hand-rolling
role checks or input parsing. Public routes, integrations, imports, exports, and
future AI actions must document their trust boundary before code lands.

## Testing Strategy

Use the smallest meaningful failing test first, usually a Vitest unit test for
pure service behavior. Then add integration, API, browser, and load tests where
the phase risk requires them. `make pre-commit` is the full local gate.

## Consequences And Rollback

This adds a little process and dependency weight, but it keeps the later phases
reviewable. If a gate becomes too slow or flaky, fix the gate or split it into a
documented target; do not quietly bypass it.
