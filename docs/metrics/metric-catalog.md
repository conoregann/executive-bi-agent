# Semantic metric catalog

## Conventions

- All monetary values are EUR, stored and calculated in minor units, then formatted for display.
- Calendar reporting is UTC. A `month` is the first UTC day of the reporting month.
- A metric query always specifies a closed period, optional filters, and an explicit comparison when a change is requested.
- Dimensions are taken from the customer record as it existed at the start of the reporting period unless the metric says otherwise.
- All initial-release metrics are calculated from `analytics.subscription_month` or a documented derivative. Raw tables are not a public metric interface.

## Source model contract

`analytics.subscription_month` has one row per `subscription_id` and reporting `month` with:

| Field                                                   | Meaning                                                              |
| ------------------------------------------------------- | -------------------------------------------------------------------- |
| `customer_id`                                           | Canonical customer identifier                                        |
| `subscription_id`                                       | Subscription lifecycle identifier                                    |
| `month`                                                 | First UTC day of the reporting month                                 |
| `mrr_eur_cents`                                         | End-of-month contracted MRR in EUR cents; zero when inactive         |
| `is_active_at_month_end`                                | Whether the subscription is active at the final instant of the month |
| `cancelled_at`                                          | Cancellation timestamp, if any                                       |
| `plan`, `country`, `region`, `industry`, `company_size` | Conformed reporting dimensions                                       |

Only subscriptions with `is_active_at_month_end = true` contribute to end-of-month MRR. A customer can have multiple active subscriptions; customer MRR is their sum.

## Metrics

### `mrr`

| Attribute          | Contract                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------- |
| Definition         | End-of-period monthly recurring revenue from active subscriptions.                        |
| Formula            | `SUM(mrr_eur_cents WHERE is_active_at_month_end)`                                         |
| Grain              | Calendar month; may be grouped by approved customer dimensions.                           |
| Allowed dimensions | `plan`, `country`, `region`, `industry`, `company_size`                                   |
| Filters            | Any allowed dimension and explicit customer ID list.                                      |
| Excludes           | One-time charges, taxes, refunds, payment attempts, pipeline, and inactive subscriptions. |
| Freshness target   | Complete by 08:00 UTC on the following day for synthetic data.                            |
| Owner              | Finance Analytics.                                                                        |

### `mrr_change`

| Attribute  | Contract                                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------------------------- |
| Definition | Absolute and percentage change in MRR between a current and comparison month.                                         |
| Formula    | `current_mrr - comparison_mrr`; percentage is `change / comparison_mrr` when comparison MRR is non-zero.              |
| Grain      | A pair of calendar months at the same filter scope.                                                                   |
| Output     | `current_value`, `comparison_value`, `absolute_change`, `percent_change`; percentage is `null` when baseline is zero. |
| Owner      | Finance Analytics.                                                                                                    |

### `new_mrr`

| Attribute  | Contract                                                                                                 |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| Definition | Current-month MRR from customers with zero MRR in the prior month and positive MRR in the current month. |
| Formula    | Sum current customer MRR where `prior_customer_mrr = 0` and `current_customer_mrr > 0`.                  |
| Grain      | Calendar month; customer-level classification before aggregation.                                        |
| Excludes   | MRR from an existing customer that adds another subscription.                                            |
| Owner      | Finance Analytics.                                                                                       |

### `expansion_mrr`

| Attribute  | Contract                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------- |
| Definition | Positive MRR increase from customers active in both months.                                     |
| Formula    | Sum `current_customer_mrr - prior_customer_mrr` where both are positive and current is greater. |
| Grain      | Calendar month; customer-level classification before aggregation.                               |
| Owner      | Finance Analytics.                                                                              |

### `contraction_mrr`

| Attribute  | Contract                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Definition | Absolute MRR reduction from customers active in both months.                                                                    |
| Formula    | Sum `prior_customer_mrr - current_customer_mrr` where both are positive and current is lower. Report as a positive loss amount. |
| Grain      | Calendar month; customer-level classification before aggregation.                                                               |
| Owner      | Finance Analytics.                                                                                                              |

### `churned_mrr`

| Attribute  | Contract                                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| Definition | Prior-month MRR from customers with positive prior MRR and zero current MRR.                                            |
| Formula    | Sum prior customer MRR where `prior_customer_mrr > 0` and `current_customer_mrr = 0`. Report as a positive loss amount. |
| Grain      | Calendar month; customer-level classification before aggregation.                                                       |
| Excludes   | A subscription cancellation when the customer retains another active subscription.                                      |
| Owner      | Finance Analytics.                                                                                                      |

### `customer_churn_rate`

| Attribute  | Contract                                                                           |
| ---------- | ---------------------------------------------------------------------------------- |
| Definition | Share of customers with positive prior-month MRR that have zero current-month MRR. |
| Formula    | `count(churned customers) / count(customers with prior-month MRR > 0)`             |
| Grain      | Calendar month.                                                                    |
| Output     | Decimal ratio plus numerator and denominator.                                      |
| Caveat     | This is logo churn, not MRR churn.                                                 |
| Owner      | Finance Analytics.                                                                 |

### `gross_revenue_retention`

| Attribute  | Contract                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------ |
| Definition | Prior-period customer MRR retained after churn and contraction, excluding expansion and new MRR. |
| Formula    | `(starting_mrr - churned_mrr - contraction_mrr) / starting_mrr`                                  |
| Grain      | Calendar month.                                                                                  |
| Output     | Decimal ratio; `null` if starting MRR is zero.                                                   |
| Owner      | Finance Analytics.                                                                               |

### `net_revenue_retention`

| Attribute  | Contract                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------- |
| Definition | Prior-period customer MRR retained after churn, contraction, and expansion, excluding new MRR. |
| Formula    | `(starting_mrr - churned_mrr - contraction_mrr + expansion_mrr) / starting_mrr`                |
| Grain      | Calendar month.                                                                                |
| Output     | Decimal ratio; it may exceed 1.0.                                                              |
| Owner      | Finance Analytics.                                                                             |

### `active_customers`

| Attribute  | Contract                                             |
| ---------- | ---------------------------------------------------- |
| Definition | Distinct customers with positive end-of-month MRR.   |
| Formula    | `COUNT(DISTINCT customer_id WHERE customer_mrr > 0)` |
| Grain      | Calendar month.                                      |
| Owner      | Finance Analytics.                                   |

### `checkout_conversion_rate`

| Attribute          | Contract                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| Definition         | Completed checkout sessions divided by checkout-started sessions in a period.                           |
| Formula            | `count(distinct session_id with checkout_completed) / count(distinct session_id with checkout_started)` |
| Grain              | Calendar day or month.                                                                                  |
| Allowed dimensions | `country`, `region`, `plan` when known at session start.                                                |
| Excludes           | Sessions without a valid `session_id`; retries are deduplicated by session.                             |
| Owner              | Growth Analytics.                                                                                       |

## MRR movement reconciliation

At a whole-company, unfiltered monthly scope:

```text
current MRR = prior MRR + new MRR + expansion MRR - contraction MRR - churned MRR
```

If this does not reconcile, the result is invalid and must not be presented. A dimension breakdown can fail to reconcile only when the dimension is unavailable for some contributing customer; that missing segment must be explicit.

## Metric lifecycle

Only metrics in this catalog are exposed by controlled analytics tools. A new metric requires its definition, source model, owner, tests, example query, and evaluation case before release.
