# PostgreSQL runtime acceptance

The synthetic runtime uses the [API contract](../../docs/architecture/api-mrr-decline-contract.md).

- August 2026 scoped to `cust_acme`: PostgreSQL-backed investigation completes;
  chart values match the JSON-backed test API. Source freshness is retained.
- A new API instance with the same persistence database retrieves the same
  authenticated record, answer, and chart evidence.
- Analytics credentials cannot read `raw.source_snapshots` or `app.investigations`
  or mutate analytics views. The connection defaults to read-only transactions.
- Analytics query failure produces a blocked or unavailable outcome with no
  credential leakage and no JSON metric fallback.

Executable coverage: `apps/api/test/postgres-live.integration.test.mjs` and
`apps/api/test/postgres-runtime.test.mjs`. Live coverage requires both database URLs.
