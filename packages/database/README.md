# Database package

The initial analytics path is intentionally SQL-first and runs in local PostgreSQL. Docker initialization SQL lives in `infra/postgres/init` because it owns the local service lifecycle; this package will contain the typed application database client when the API capability begins.

## Start locally

```bash
cp .env.example .env
pnpm db:up
psql "postgresql://executive_bi:executive_bi_local_only@localhost:5433/executive_bi"
```

Initialization scripts run only when the Docker volume is first created. To reload fixtures, deliberately remove the named `postgres_data` volume, then start the service again.
