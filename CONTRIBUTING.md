# Contributing

Follow [AGENTS.md](AGENTS.md) and the affected directory’s local guide for
capability scope, autonomy, safeguards, branches, commits, and completion.
See [README.md](README.md) for prerequisites and [docs](docs/README.md) for
contracts. Use pnpm; keep unrelated user changes out of your commits and PRs.

## Verification commands

```bash
pnpm install
pnpm --filter @executive-bi/metrics check
pnpm --filter @executive-bi/metrics test
pnpm check
pnpm test
pnpm format:check

git diff --check
```

Replace the example filter with the affected package. `format:check` checks
formatting; `pnpm exec prettier --write <changed-files>` applies it.
For Markdown-only work, check changed Markdown formatting and local links/paths;
application checks are unnecessary under the root guide.

For local PostgreSQL setup, migration, and verification, follow the
[database guide](packages/database/README.md). Set `DATABASE_URL` to exercise live
integration tests; otherwise those tests skip. Current [CI](.github/workflows/ci.yml)
runs formatting, type checks, database migration/verification, and tests with
PostgreSQL for pull requests. Report local skips and failures honestly.
