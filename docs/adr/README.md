# Architecture Decision Records

Tabular uses ADRs for decisions that shape product behavior, security boundaries,
or long-lived implementation contracts. Keep them short, concrete, and useful to
a junior engineer opening the code six months later.

## Required Decision Areas

Create or update an ADR before implementing material behavior in these areas:

| Area | Why it needs an ADR |
| --- | --- |
| Values | Field values must resolve the same way in API, grid, forms, imports, exports, queries, and automations. |
| Field behavior | User-created fields need one contract for writable values, defaults, required/unique rules, attachments, and computed/action-only fields. |
| Import/export and Airtable migration | [ADR 0004](./0004-import-export-airtable-migration.md) owns CSV preview/commit/export and Airtable migration staging. |
| Permissions | Authz must be centralized and reviewable for OWASP/ASVS expectations. |
| Imports | Large Airtable migrations need explicit rollback, validation, and partial-write semantics. |
| Forms | Public capture routes have different trust boundaries than authenticated app routes. |
| Automations | SLA workflows need idempotency, retries, secrets, and observable failures. |
| Views/query | 90k+ row views require server-side contracts, pagination, projection, and indexing choices. |
| Attachments | Uploads need storage, validation, lifecycle, and malware-scan boundaries. |
| AI boundaries | AI/API/MCP actions must act as the current user, require preview for mutation, and be audited. |

## ADR Format

Use this shape:

1. Title
2. Status: proposed, accepted, superseded
3. Context
4. Decision
5. Security and privacy considerations
6. Testing strategy
7. Consequences and rollback notes

Prefer one boring, well-owned service contract over clever scattered logic.
