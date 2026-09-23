# Metrics Package Guide

This package is the authoritative deterministic implementation of the semantic
metric catalog. Read `docs/metrics/metric-catalog.md`,
`docs/metrics/query-contract.md`, and
`docs/architecture/trusted-mrr-service-contract.md` before changing it.

- Accept only documented request keys, calendar periods, filters, dimensions,
  and limits. Reject malformed or unknown input without querying the repository.
- Calculate money in integer EUR cents. Aggregate customer MRR across
  subscriptions before classifying new, expansion, contraction, or churn.
- A missing month is `data_unavailable`, never a zero substitute. A zero
  denominator produces `null` plus a warning.
- Movement must reconcile exactly. Invalid reconciliation evidence must remain
  invalid and must not be presented as a metric fact.
- Every successful result carries query evidence; derived values also carry
  calculation evidence linked to its inputs. Charts may reference only returned
  rows and evidence IDs.
- Never add model inference, prompt logic, or free-form SQL.

Add tests for happy path, validation, unavailable data, and evidence integrity
whenever metric behavior changes. Update `evals/metrics/` for a new metric rule.
