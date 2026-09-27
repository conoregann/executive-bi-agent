# Database package

The initial analytics path is intentionally SQL-first and runs in local PostgreSQL. Docker initialization SQL lives in `infra/postgres/init` because it owns the local service lifecycle. The read-only subscription-month adapter lives in `packages/analytics` and accepts an injected PostgreSQL query client. Investigation persistence uses the separate `app` schema through the parameterized adapter in `apps/api`; this package currently has no runtime client.

## Start locally

```bash
cp .env.example .env
pnpm db:up
psql "postgresql://executive_bi:executive_bi_local_only@localhost:5433/executive_bi"
```

Initialization scripts run only when the Docker volume is first created. To reload fixtures, deliberately remove the named `postgres_data` volume, then start the service again.

For an existing local synthetic volume, run `pnpm db:migrate` and then
`pnpm db:verify` to add and validate the current analytics views and
investigation table. Set `DATABASE_URL` from `.env.example` before starting
the API. The [API contract](../../docs/architecture/api-mrr-decline-contract.md)
defines the token-protected persistence boundary.
