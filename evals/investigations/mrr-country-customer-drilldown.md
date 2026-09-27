# Country MRR customer drill-down acceptance

All fixtures are synthetic. Contracts:
[investigations](../../docs/architecture/investigation-contract.md),
[trusted metrics](../../docs/architecture/trusted-mrr-service-contract.md),
[answers](../../docs/architecture/investigation-answer-contract.md).

| Case   | Input or condition                                                                        | Expected outcome                                                                                                                                                            |
| ------ | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CCD-01 | Completed synthetic country comparison, select DE                                         | Prior/current customer totals and delta equal the retained DE row; cited five largest negative contributions, positive offsets and remainder reconcile.                     |
| CCD-02 | Scope restricted to cust_acme                                                             | Exact month/customer scope inherited; no other customers appear. Overrides rejected before reservation/tools.                                                               |
| CCD-03 | Missing/wrong token, unknown parent, root parent, blocked parent or customer child parent | No reservation or tools; 401/404 or invalid_parent as appropriate. Only country → customer nesting is supported.                                                            |
| CCD-04 | Country absent from retained rows                                                         | Invalid request, no child or tools. Explicit null selects only retained unassigned MRR.                                                                                     |
| CCD-05 | Synthetic customer transfers DE → GB, MRR unchanged                                       | DE loses and GB gains that MRR; no churn/acquisition classification or causal claim.                                                                                        |
| CCD-06 | Multiple subscriptions per customer                                                       | Sum active country subscriptions before calculating contribution.                                                                                                           |
| CCD-07 | Seven tied losses of 100 cents, gain of 50 cents                                          | Stable ID order, five displayed losses, offsets 50, remainder -200, total -650; full rows retained.                                                                         |
| CCD-08 | Previous/current month unavailable, query failure or changed country totals               | Retained blocked child, separate token, no answer; parent unchanged. Never substitute zero for missing months.                                                              |
| CCD-09 | Tampered scope, query row, calculation input, rank, offset, total or country snapshot     | Answer unavailable; no unsupported numerical claim.                                                                                                                         |
| CCD-10 | Restart API with persistence and unavailable analytics                                    | Child record, answer and citations remain readable with child token; root/country tokens cannot read it. Existing record kinds remain readable. No DB schema change needed. |
| CCD-11 | Mobile browser: MRR → country → Show accounts → citation                                  | Accessible table and loading/error/empty states; correct child-token evidence, no browser token persistence, parent answer remains visible.                                 |
