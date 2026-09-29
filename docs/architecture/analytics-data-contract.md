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

`raw` retains source semantics, including one captured reporting-dimension row per customer and month in `raw.customer_month_dimensions`. `staging` joins each subscription snapshot to its matching customer-month dimensions and derives region from that period's country. The mutable `raw.customers` record supplies identity and current account details, not historical reporting dimensions. `analytics` owns metric-ready grains; tools may read only this schema in the first implementation. The composite foreign key prevents a subscription snapshot without period dimensions.

## Initial dataset

The fixtures cover June through August 2026 and are designed to make the MRR movement contract testable:

| Month       |    MRR | Scenario                                                        |
| ----------- | -----: | --------------------------------------------------------------- |
| June 2026   | €4,800 | Berlin has two subscriptions on Starter in GB; Nordic is active |
| July 2026   | €4,200 | Starting point                                                  |
| August 2026 | €2,500 | €600 new, €200 expansion, €100 contraction, €2,400 churn        |

The movement reconciles in cents:

```text
250000 = 420000 + 60000 + 20000 - 10000 - 240000
```

Supporting synthetic support and knowledge records provide dated context for the churned customer. They are not evidence of a causal relationship.

`data/synthetic/subscription-month-2026.json` and
`analytics.subscription_month` contain the same sixteen subscription-month rows,
including customer IDs, dimensions, cancellation timestamps, and MRR cents.
`analytics.subscription_month_freshness` carries the same source freshness as
the JSON fixture. The read-only PostgreSQL repository in `packages/analytics`
uses fixed queries against these two approved views, binds the requested month,
and validates returned rows before metrics consume them.

## Local operation

```bash
cp .env.example .env
pnpm db:up
pnpm db:verify
```

The PostgreSQL image executes `infra/postgres/init/01-schema.sql` and `02-seed.sql` only on first volume initialization. `infra/postgres/verify.sql` asserts fixture parity, MRR reconciliation, segment transfer behavior, reactivation, and historical stability after a current-record edit.

For an existing local synthetic volume, run `pnpm db:migrate` before
`pnpm db:verify`. The migration backfills the known synthetic customer-month
dimensions explicitly, adds June's bounded scenario, and preserves existing
July–August subscription rows. Verification also checks every PostgreSQL
subscription-month row against the mounted JSON fixture. Existing volumes with
additional subscription months need matching customer-month dimensions before
the foreign key can be installed.

Berlin's June Starter/GB and July Growth/DE snapshots retain their own dimensions
even if its current customer record changes. Its €900 customer MRR is unchanged
across the transfer, so the country and plan breakdowns move €900 between
segments while customer movement remains `none`. Nordic's June active, July
inactive, and August active snapshots demonstrate reactivation. The current
zero-to-positive movement definition labels August as `new`; it does not yet
distinguish reactivation from first acquisition.

To deliberately reseed local data, stop the service and remove the named Docker volume, then run `pnpm db:up`. Do not use that operation for real environments.

## Evolution rules

- Add source data as `raw` tables first; do not write directly to `analytics`.
- A transformed model must declare its grain, source dependencies, and validation query.
- Preserve stable IDs across fixtures and knowledge metadata.
- Add a verification assertion whenever a metric-changing transformation is added.
- Data in this repository remains synthetic; no real credentials or company records belong here.

## Synthetic operational history

`data/synthetic/generate-operations.mjs` reproducibly generates CRM account events,
support events and monthly active-user summaries for June–August 2026. The fixture
is `operations-2026.json`, explicitly labelled synthetic. The additive migration
loads stable record IDs into `raw.operational_records`, conforms source/customer/
month fields in staging, and exposes `analytics.operational_records` to the
existing read-only role. Migration updates only these synthetic fixture records.
Verification checks complete JSON parity and reader permissions. Operational
usage deltas are current minus previous observed active-user counts; either
missing observation produces null, never zero. No account-health score is inferred.
