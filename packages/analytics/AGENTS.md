# Analytics Package Guide

Own the deterministic, read-only adapter for metric-ready subscription-month
data. The contract is `docs/architecture/analytics-data-contract.md`.

- Validate snapshots before exposing them: canonical month values, ISO freshness,
  unique `(month, subscription)` rows, non-negative integer cents, and coherent
  active-status/MRR pairs.
- Preserve source precision: money is integer EUR cents; do not round or coerce
  malformed values.
- Return immutable data and do not calculate business metrics here. Metric
  classification belongs in `packages/metrics`.
- Keep the adapter local and deterministic; no database client, model, or hidden
  fallback data source belongs here.

Update the package test whenever a source-data invariant changes.
