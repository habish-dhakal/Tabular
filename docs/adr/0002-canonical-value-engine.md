# ADR 0002: Canonical Value Engine

Status: accepted

## Context

Tabular field values were being interpreted in several places: cell coercion,
formula references, lookup/rollup enrichment, view filtering/sorting, automation
tokens, and grid display. That makes behavior drift likely as Airtable-grade
features are added.

## Decision

`ValueResolver` is the canonical owner for field value semantics. It resolves
these forms from the same implementation path:

- raw
- normalized
- display
- query
- computed
- export
- import
- automation token

API services, query helpers, formula computation, lookup/rollup enrichment, and
automation interpolation must call the resolver instead of adding local
field-type switches. A single field-type switch inside the resolver is
acceptable; repeated switches outside it are not.

## Security And Privacy Considerations

Consistent value resolution reduces accidental data leaks through hidden computed
paths, exports, automations, and future AI/API surfaces. Public or integration
paths must still perform permission checks before asking the resolver for a
value.

## Testing Strategy

Unit tests cover formula filtering, lookup sorting, rollup conditions, link
query/token values, cycle detection, and stable auto-number fallback behavior.
The existing logic, backend, and frontend suites remain the broader regression
gate.

## Consequences And Rollback

This centralizes behavior without changing the database schema. If a regression
appears, callers can be moved back behind the old wrappers temporarily, but new
field/value behavior should continue to land in `ValueResolver`.
