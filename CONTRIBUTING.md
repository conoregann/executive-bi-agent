# Contributing

## Branches

Create short-lived branches from `main` using `feat/<short-name>`, `fix/<short-name>`, or `chore/<short-name>`.

## Commits

Prefer conventional commits such as `feat(metrics): define mrr contract` or `chore(repo): add workspace scaffold`. Keep commits small, focused, and runnable.

## Delivery loop

1. Read the narrowest relevant contract and update it only if behavior,
   semantics, safety, or acceptance criteria change.
2. Implement one complete vertical slice.
3. Add the relevant test; add an evaluation for user-facing or safety-critical
   behavior.
4. Run `pnpm format:check`, `pnpm check`, and `pnpm test`.
5. Remove stale code or documentation, then commit the reviewable slice.
