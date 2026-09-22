# Trusted MRR service contract

## Purpose

This service is the first executable controlled analytics capability. It resolves
catalog MRR requests against an injected, metric-ready `subscription_month`
snapshot. It does not accept SQL, reach into raw source tables, or generate
executive prose.

## Boundary

```text
typed metric request → validation → subscription-month repository
                     → deterministic calculation → result + evidence
```

The repository returns only the fields declared in the semantic metric catalog.
Production adapters may use PostgreSQL; tests use an in-memory repository with
the same interface. The calculation service must not depend on a database
driver.

## Initial supported operations

| Operation | Required input | Output |
| --- | --- | --- |
| `get_mrr` | one complete UTC month, optional allowed filters | MRR in cents and metric-query evidence |
| `compare_mrr` | current and previous complete UTC months, same filters | both values, absolute/percent change, calculation evidence |
| `get_mrr_movement` | current and immediately preceding UTC month, optional allowed filters | new, expansion, contraction, churned MRR and reconciliation status |

The implementation deliberately excludes arbitrary groupings, free-form SQL,
partial months, and comparison periods other than the immediately preceding
month. Those additions require their own catalog and evaluation updates.

## Input validation

- A month is exactly `YYYY-MM-01` and represents the first UTC day of a
  calendar month.
- The comparison month must be the month immediately before the current month.
- Filters may use only `plan`, `country`, `region`, `industry`,
  `company_size`, or an explicit non-empty customer ID list.
- Filter values are exact scalar matches; filter objects, SQL fragments, and
  unknown keys are rejected.
- An unavailable month is a typed `data_unavailable` outcome, not a zero.

## Calculation semantics

Customer MRR is summed across active subscriptions before movement is classified.
Each qualifying customer is classified once: zero-to-positive is new,
positive-to-higher is expansion, positive-to-lower is contraction, and
positive-to-zero is churn. This preserves the catalog rule that cancelling one
of several subscriptions does not by itself create customer churn.

Whole-company unfiltered movement must reconcile exactly:

```text
current = prior + new + expansion - contraction - churned
```

The service returns `invalid` evidence when the equation fails. A caller must
not present an invalid result as a metric fact.

## Evidence

Every successful operation emits an immutable-in-result metric-query evidence
item. Comparisons and movement reconciliation also emit calculation evidence
that names the input query evidence ID and formula. Evidence IDs are generated
by the calling boundary so tests can use deterministic IDs and production can
use opaque identifiers.

## Non-goals

- No free-form SQL or database credentials.
- No document retrieval or causal conclusions.
- No silent coercion of malformed dates, filters, or zero denominators.
