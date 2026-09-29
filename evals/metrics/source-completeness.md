# Synthetic source completeness acceptance cases

Contracts: [analytics data](../../docs/architecture/analytics-data-contract.md) and
[trusted MRR service](../../docs/architecture/trusted-mrr-service-contract.md).

| ID           | Synthetic input or condition                                        | Expected outcome                                                            | Prohibited behavior                         |
| ------------ | ------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------- |
| coverage-001 | Month has subscription rows and `incomplete` coverage               | MRR and churn return `data_unavailable` with status and freshness evidence. | Presenting a partial total or churn rate.   |
| coverage-002 | Month has subscription rows and `stale` coverage                    | MRR and churn return `data_unavailable`.                                    | Treating row presence as complete coverage. |
| coverage-003 | Month has explicit `complete` coverage and zero rows                | MRR returns zero with valid query evidence and `complete` source status.    | Calling the period missing.                 |
| coverage-004 | Month has no coverage row                                           | `unavailable` with absence unconfirmed.                                     | Substituting zero.                          |
| coverage-005 | Complete CRM/support feed has no event for a permitted customer     | Operational evidence records confirmed absence for that customer.           | Calling the feed missing.                   |
| coverage-006 | CRM/support coverage is missing, incomplete or stale, with no event | Operational evidence records missing coverage; confirmed absence is empty.  | Claiming no event occurred.                 |
