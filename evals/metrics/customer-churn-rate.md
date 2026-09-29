# Customer churn rate acceptance cases

All fixture data is synthetic.

| ID        | Input or condition                                                   | Expected outcome                                                                           |
| --------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| churn-001 | July–August 2026 fixture                                             | 1 churned / 4 starting customers = 0.25; two scoped query IDs and a linked calculation ID. |
| churn-002 | Customer retains one of two subscriptions                            | Customer is not churned.                                                                   |
| churn-003 | Starting customer absent entirely from current snapshot              | Customer is churned.                                                                       |
| churn-004 | Prior or current snapshot missing                                    | `data_unavailable`; no zero substitution or answer.                                        |
| churn-005 | Complete prior snapshot has no positive customer MRR                 | `null` rate and `zero_customer_churn_denominator` warning.                                 |
| churn-006 | Unknown keys, scope overrides, invalid month or non-parent token     | Reject before reservation or metric reads.                                                 |
| churn-007 | Tampered retained counts, rate, scope, query IDs or calculation link | No retained answer.                                                                        |
| churn-008 | Explicit inherited customer IDs                                      | Exact filter in both queries; no broader cohort or cross-token access.                     |
