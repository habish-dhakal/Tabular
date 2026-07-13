# Developer Workflow

## Branches

Do not implement directly on `main`. Start each phase from the latest upstream
main and use the phase branch name exactly:

```bash
git fetch origin main
git switch -c phase-00-engineering-spine origin/main
```

If upstream changes during a phase:

```bash
git fetch origin main
git rebase origin/main
make pre-commit
git push --force-with-lease fork phase-XX-name
```

## Command Surface

Use the Makefile first:

```bash
make help
make up
make down
make restart
make verify-unit
make verify-logic
make verify-backend
make verify-frontend
make pre-commit
```

`make pre-commit` is the local gate before committing a phase. Backend and
frontend verification expect the app to be running on `http://localhost:3100`.

## Canonical Plan

Follow [the phase-by-phase implementation plan](phase-by-phase-implementation-plan.md)
before starting phase work. That plan is the source of truth for branch names,
phase boundaries, required tests, and coding rules.

## TDD Loop

1. Write the smallest failing test that proves the behavior.
2. Implement the simplest service-owned change that makes it pass.
3. Run the targeted test.
4. Run the phase-specific tests.
5. Run `make pre-commit`.

Clean code here means readable ownership, not abstraction theater. If five lines
make the contract obvious, do not write fifty.

## Architectural Bar

Treat every phase as if a senior software architect with 20+ years of
production experience will review the code for clarity, service ownership,
security posture, rollback safety, and future maintenance. Keep behavior boring
in the best possible way: centralized where it must be consistent, small where
it can stay local, and tested at the lowest useful level before larger suites.

Use existing local services, framework APIs, and proven helpers before adding
custom code. Do not write a 50-line custom implementation when 2-5 clear lines
using the existing stack will do. API routes stay thin, services own behavior,
UI components delegate business rules, and DB writes go through service-owned
validation and permission checks.

Shared concepts must have one implementation path. Values, permissions, imports,
forms, automations, views, and attachments must not grow duplicate logic across
API routes, UI components, scripts, and background workers.

## Review Standard

Every PR should make these easy to answer:

- What user or operator capability changed?
- Which service owns the behavior?
- Which inputs are validated and where?
- Which permission check protects the action?
- Which OWASP/ASVS concern is relevant?
- What breaks if this is rolled back?
- What is deliberately out of scope?
