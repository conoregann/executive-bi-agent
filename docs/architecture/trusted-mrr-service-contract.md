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

| Operation                    | Required input                                                          | Output                                                                                                    |
| ---------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `get_mrr`                    | one complete UTC month, optional allowed filters                        | MRR in cents and metric-query evidence                                                                    |
| `compare_mrr`                | current and previous complete UTC months, same filters                  | both values, absolute/percent change, calculation evidence                                                |
| `get_mrr_movement`           | current and immediately preceding UTC month, optional allowed filters   | new, expansion, contraction, churned MRR and reconciliation status                                        |
| `get_customer_mrr_movement`  | current and immediately preceding UTC month, optional filters and limit | ranked changed customers and movement classification                                                      |
| `breakdown_mrr`              | one complete UTC month, one allowed dimension, optional allowed filters | ranked MRR rows and explicit reconciliation status                                                        |
| `create_mrr_breakdown_chart` | valid `breakdown_mrr` input                                             | chart-ready bar specification referencing breakdown evidence                                              |
| `get_customer_churn_rate`    | current complete UTC month and optional allowed filters                 | churned and starting customer counts, nullable rate, two snapshot queries and linked calculation evidence |

The implementation deliberately excludes multiple simultaneous groupings,
free-form SQL, partial months, and comparison periods other than the immediately
preceding month. Those additions require their own catalog and evaluation
updates.

Customer movement rows aggregate subscriptions before classification. Unchanged
customers are omitted. Rows sort by MRR change ascending (largest loss first),
then canonical customer ID; `limit` defaults to 10 and cannot exceed 100. A
customer row returns prior MRR, current MRR, signed change, and exactly one of
`new`, `expansion`, `contraction`, or `churn`. The operation carries the same
filter scope and metric-query evidence as other MRR operations.

### Country comparison

`compareCountryMrr` accepts the same strict month/filter input as `compareMrr`.
It reuses `breakdownMrr` for the preceding and current months with `country`
grouping. The union of country rows supplies zero only for a country absent from
a complete month's breakdown. Missing months never become zeros. Signed deltas
are current country MRR minus previous country MRR, ordered ascending, then
country. No customer movement classification is attached to country totals.

Both months' unassigned MRR is included in one explicit `null` country row when
needed. Previous/current totals and all row deltas must reconcile; calculation
evidence references both returned country queries. Missing dimension evidence
has warning integrity. The existing analytics adapters reject malformed blank
dimensions; controlled repositories that represent missing dimensions exercise
this metric warning path. No adapter validation is relaxed by this operation.

## Input validation

- A month is exactly `YYYY-MM-01` and represents the first UTC day of a
  calendar month.
- The comparison month must be the month immediately before the current month.
- Filters may use only `plan`, `country`, `region`, `industry`,
  `company_size`, or an explicit non-empty customer ID list.
- Filter values are exact scalar matches; filter objects, SQL fragments, and
  unknown keys are rejected.
- A breakdown accepts exactly one catalog dimension: `plan`, `country`,
  `region`, `industry`, or `companySize`.
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

For an MRR breakdown, rows with no value for the requested dimension are not
silently assigned to a segment. Their MRR is returned as an explicit
`unassignedMrrEurCents` value, the breakdown evidence integrity is `warning`, and the
named rows must not be presented as a fully reconciled decomposition. A
chart specification may only reference rows and evidence returned by the
breakdown operation.

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

## Customer contributions to country MRR

### Customer churn rate

`getCustomerChurnRate` accepts the strict month/filter request. The previous month
is derived from the requested month. It sums active subscription MRR by customer
in each complete monthly snapshot. Starting customers have positive previous
MRR; churned customers have positive previous MRR and zero current MRR, including
customers absent from the current snapshot. A missing snapshot returns
`data_unavailable`. With no starting customers, the rate is `null` and the
result warns `zero_customer_churn_denominator`. The two query evidence items
carry the customer cohort IDs and counts at the inherited scope; calculation
evidence links both queries and the formula. A retained answer must validate
those links, counts, scope and rate before presenting the result.

`getCustomerCountryContributions` accepts `month`, an explicit `country` (or
`null` for unassigned MRR), and optional inherited `filters.customerIds` only.
Unknown keys, other filters, limits and malformed requests are rejected before
repository reads. Both complete months must exist before country filtering;
a customer absent from a complete country snapshot contributes zero for that
month, while an unavailable month returns `data_unavailable`.

Active subscriptions are summed per customer within the selected country for
each month. Signed contribution is current minus previous country MRR. Country
transfers therefore contribute to country movement without lifecycle labels.
Rows include unchanged customers, sort by signed change ascending then customer
ID, and reconcile exactly to both country totals and their delta. The five
largest negative rows are also returned as `largestLosses`.
`positiveOffsetsEurCents` sums all positive contributions;
`remainingNetMovementEurCents` is the delta less those offsets and displayed
losses. It includes undisplayed losses. All rows remain retained; presentation
truncation never truncates the reconciliation. Two customer-country query
snapshots and linked calculation evidence support every value. No contextual
retrieval or causal inference runs.

## Retained revenue waterfall

`createRetainedMrrWaterfall` accepts a retained MRR movement and its evidence ID.
It emits previous MRR, new, expansion, contraction, churn and current MRR with
integer-cent start/end positions. Missing, unsafe, negative source components or
non-reconciliation return no chart. Geometry is calculated centrally and does
not query analytics or execute a model. The answer cites the retained movement.
