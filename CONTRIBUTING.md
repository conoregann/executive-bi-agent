# Contributing

## Branches

Create short-lived branches from `main` using `feat/<short-name>`, `fix/<short-name>`, or `chore/<short-name>`.

## Commits

Prefer conventional commits such as `feat(metrics): define mrr contract` or `chore(repo): add workspace scaffold`. Keep commits small, focused, and runnable.

## Delivery loop

1. Write or update the relevant Markdown contract.
2. Implement one vertical slice.
3. Add an evaluation or test that demonstrates the behavior.
4. Run `pnpm check`, `pnpm test`, and `pnpm format:check`.
5. Commit the slice and open a reviewable change.
