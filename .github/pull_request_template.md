## Summary

Briefly explain what this phase adds.

## Why

Explain which Airtable/Tabular gap this closes.

## Key Changes

- Main service/API/UI changes
- New interfaces or contracts
- Migrations/config changes if any
- Owning service or pure helper for the new behavior
- Existing framework/helper reused instead of custom code where possible

## Tests

- [ ] Tests written first where practical
- [ ] `make pre-commit`
- [ ] Unit tests
- [ ] API/backend checks
- [ ] Frontend/e2e checks
- [ ] Full suite or phase-specific load checks

## Checklist

- [ ] Acceptance criteria documented
- [ ] Canonical phase plan entry followed
- [ ] TDD used where practical
- [ ] Owning service named
- [ ] Validation path named
- [ ] Authz path named
- [ ] Authz reviewed
- [ ] Validation reviewed
- [ ] OWASP/ASVS notes included
- [ ] Rollback notes included
- [ ] Out-of-scope work named
- [ ] No duplicate business logic added across API/UI/import/forms/automations
- [ ] No custom 50-line implementation where existing framework/helper code would suffice

## Risk

Known risks and rollback notes.

## Out Of Scope

What intentionally waits for later phases.
