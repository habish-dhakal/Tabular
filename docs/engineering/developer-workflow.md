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

## Review Standard

Every PR should make these easy to answer:

- What user or operator capability changed?
- Which service owns the behavior?
- Which inputs are validated and where?
- Which permission check protects the action?
- Which OWASP/ASVS concern is relevant?
- What breaks if this is rolled back?
- What is deliberately out of scope?
