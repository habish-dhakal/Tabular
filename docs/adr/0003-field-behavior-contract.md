# ADR 0003: Field Behavior Contract

Status: accepted

## Context

Tabular fields are user-created schema. A field can be edited from the grid, API,
forms, imports, automations, and later platform or AI flows. If each path
implements its own validation, required/default/unique rules, user assignment
checks, attachments, and computed-field restrictions will drift.

Phase 3 completes the production field primitives: user/collaborator, attachment,
count, duration, button, field descriptions, defaults, required, unique, and
lossy type-conversion preview.

## Decision

`src/lib/field-behavior.ts` is the shared behavior contract for writable field
rules. It owns:

- whether a field can store a direct cell value
- required and unique semantics
- default-value application
- normalized create/update cell payloads
- user-id extraction for membership validation
- type-conversion preview

`ValueResolver` remains the owner for field value coercion and computed/display
semantics. Record and field services call the field behavior contract instead of
duplicating rules in API routes or UI components.

API routes stay thin: authenticate, authorize, validate route shape, call a
service, and return the service result. UI components may preview and display
field options, but database writes must pass through service-owned validation.

Attachments are represented as metadata and validated before storage becomes a
real upload pipeline. Storage behavior lives behind an adapter with signed-read,
delete, and virus-scan hook seams so the product can later swap local/S3/GCS
storage without changing cell validation.

## Security And Privacy Considerations

User fields must reject non-workspace members on every write path. Attachment
metadata must validate MIME type, size, and blocked scan status before it is
stored. Computed and action-only fields must reject direct writes so API clients,
forms, imports, and automations cannot bypass intended behavior.

The contract supports OWASP/ASVS expectations by keeping validation centralized,
reviewable, and testable rather than split across UI and route handlers.

## Testing Strategy

Unit tests cover defaults, required/unique rules, computed write blocking, and
lossy conversion preview. The logic suite covers value coercion for user,
duration, and attachment types. The backend suite proves the same contract over
real API routes for membership validation, attachment validation, defaults,
required/unique enforcement, button write rejection, count resolution, and
conversion preview.

## Consequences And Rollback

This adds a small shared contract but removes scattered validation. If a field
behavior regression appears, prefer fixing `field-behavior.ts` or
`ValueResolver` and adding a focused unit test. Do not patch individual API,
form, import, automation, or grid paths with local one-off rules.
