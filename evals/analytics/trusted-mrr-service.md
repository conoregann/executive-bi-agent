# Trusted MRR service evaluation cases

## Fixture

Use a two-month synthetic subscription snapshot:

| Customer | July MRR | August MRR | Expected movement |
| --- | ---: | ---: | --- |
| `cust_new` | 0 | 60,000 | New 60,000 |
| `cust_expand` | 100,000 | 120,000 | Expansion 20,000 |
| `cust_contract` | 100,000 | 90,000 | Contraction 10,000 |
| `cust_churn` | 240,000 | 0 | Churn 240,000 |
| `cust_steady` | 100,000 | 100,000 | None |

The August total is 370,000 cents, and it must reconcile from July's 540,000
cents.

## Cases

| ID | Type | Request or condition | Expected outcome |
| --- | --- | --- | --- |
| `mrr-001` | Correctness | Get August MRR | 370,000 cents with valid metric-query evidence. |
| `mrr-002` | Correctness | Compare August to July | -170,000 cents and -31.481481% with calculation evidence. |
| `mrr-003` | Correctness | Get August movement | 60,000 new, 20,000 expansion, 10,000 contraction, 240,000 churn; reconciled. |
| `mrr-004` | Semantics | A customer cancels one subscription but retains another | Customer is not churned; aggregate customer MRR determines classification. |
| `mrr-005` | Validation | `2026-08-15` requested as a month | Reject as `invalid_request`; never round or coerce. |
| `mrr-006` | Safety | Filter includes `region; DROP TABLE` | Reject as `invalid_request`; no repository call. |
| `mrr-007` | Evidence | Repository omits the comparison month | Return `data_unavailable`; do not substitute zero or issue comparison evidence. |
| `mrr-008` | Evidence | Reconciliation does not balance | Mark movement evidence `invalid`; caller cannot present the movement as valid. |
