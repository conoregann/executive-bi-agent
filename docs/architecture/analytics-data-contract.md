# Analytics data contract

## Purpose

The first analytics path is a deterministic local PostgreSQL dataset used to implement and verify the semantic metric catalog. It is deliberately small, synthetic, and inspectable.

## Layering

```text
Synthetic source fixtures
        ↓
raw.*                  source-shaped records
        ↓
staging.*              conformed customer dimensions and snapshots
        ↓
analytics.*            metric-ready subscription and movement views
```

`raw` retains source semantics. `staging` owns canonical customer joins and the country-to-region mapping. `analytics` owns metric-ready grains; tools may read only this schema in the first implementation.

## Initial dataset

The fixtures cover July and August 2026 and are designed to make the MRR movement contract testable:

| Month | MRR | Expected movement versus July |
| --- | ---: | --- |
| July 2026 | €4,200 | Starting point |
| August 2026 | €2,500 | €600 new, €200 expansion, €100 contraction, €2,400 churn |

The movement reconciles in cents:

```text
250000 = 420000 + 60000 + 20000 - 10000 - 240000
```

Supporting synthetic support and knowledge records provide dated context for the churned customer. They are not evidence of a causal relationship.

## Local operation

```bash
cp .env.example .env
pnpm db:up
pnpm db:verify
```

The PostgreSQL image executes `infra/postgres/init/01-schema.sql` and `02-seed.sql` only on first volume initialization. `infra/postgres/verify.sql` asserts the expected MRR values, reconciliation, and churn count.

To deliberately reseed local data, stop the service and remove the named Docker volume, then run `pnpm db:up`. Do not use that operation for real environments.

## Evolution rules

- Add source data as `raw` tables first; do not write directly to `analytics`.
- A transformed model must declare its grain, source dependencies, and validation query.
- Preserve stable IDs across fixtures and knowledge metadata.
- Add a verification assertion whenever a metric-changing transformation is added.
- Data in this repository remains synthetic; no real credentials or company records belong here.
