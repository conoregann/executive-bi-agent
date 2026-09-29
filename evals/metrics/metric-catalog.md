# Metric catalog acceptance criteria

## MRR movement reconciliation

Given a prior month and current month at company scope, the system must satisfy:

```text
current MRR = prior MRR + new MRR + expansion MRR - contraction MRR - churned MRR
```

The comparison is invalid if the equation does not balance exactly in cents.

## Customer-level movement classification

| Prior customer MRR | Current customer MRR | Expected classification        |
| -----------------: | -------------------: | ------------------------------ |
|                  0 |                50000 | New MRR of 50000 cents         |
|              50000 |                70000 | Expansion MRR of 20000 cents   |
|              70000 |                50000 | Contraction MRR of 20000 cents |
|              50000 |                    0 | Churned MRR of 50000 cents     |
|              50000 |                50000 | No movement                    |

## Churn semantics

A customer with one cancelled subscription and another active subscription is not a churned customer and contributes no `churned_mrr`. A cancellation is a subscription event; customer churn is determined from aggregate customer MRR.

## Historical dimension acceptance

All fixtures in these cases are synthetic.

| Case                                                                                 | Expected outcome                                                                                                    |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Change Berlin's current plan and country after June–August snapshots exist           | June remains Starter/GB and July–August remain Growth/DE in analytics and repository rows.                          |
| Compare June and July country segments                                               | Berlin's €900 moves from GB to DE, both months reconcile, and Berlin has no customer churn or acquisition movement. |
| Sum Berlin's two June subscriptions                                                  | One customer contributes €900, with one consistent set of customer-month dimensions.                                |
| Inspect Nordic across June, July, and August                                         | Active, inactive, active; August follows the current zero-to-positive `new` definition.                             |
| Supply conflicting plan or country on one customer's subscriptions in the same month | The repository rejects the snapshot before metrics consume it.                                                      |
| Request lifecycle movement or customer churn with a plan or country filter           | Reject before repository reads, with no lifecycle evidence for a segment transfer.                                  |

## Zero denominator behavior

When comparison MRR or starting MRR is zero, percentage change, GRR, and NRR return `null` with a warning. They must not return `0`, infinity, or a fabricated percentage.
