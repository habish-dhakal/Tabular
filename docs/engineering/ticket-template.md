# Implementation Ticket Template

## Title

`Phase XX: concise behavior name`

## Context

Explain the product gap, user workflow, and the existing code path to study
first. Link the relevant ADR when the work touches values, permissions, imports,
forms, automations, views/query, attachments, or AI boundaries.

## User Outcome

State the visible outcome in one or two sentences.

## Acceptance Criteria

- [ ] Behavior works through the intended API/UI path.
- [ ] Edge cases are named and handled.
- [ ] Error messages are safe and useful.
- [ ] Existing behavior remains compatible or migration notes are included.

## Test-First Plan

- [ ] Unit test written before implementation.
- [ ] API or integration test added when route/service behavior changes.
- [ ] Browser/e2e test added when user workflow changes.
- [ ] Load or fixture test added when scale is part of the work.

## Technical Notes

Name the service, component, route, or migration that should own the change.
Favor the smallest clear implementation. Do not duplicate field/value,
permission, validation, import, or automation logic in separate paths.

## Security And Validation

- [ ] Authz reviewed.
- [ ] Input validation reviewed.
- [ ] OWASP/ASVS notes included.
- [ ] Tenant boundary reviewed.
- [ ] Audit/logging needs reviewed.

## Rollback

Describe how to disable, revert, or safely migrate away from the change.

## Out Of Scope

List tempting adjacent work that should wait for another ticket or phase.

## Done

- [ ] `make pre-commit` passes.
- [ ] Phase-specific gates pass.
- [ ] PR body includes summary, risk, tests, and rollback notes.
