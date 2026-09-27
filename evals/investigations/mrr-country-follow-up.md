# Evidence-backed MRR country follow-ups

Contract: [Investigation](../../docs/architecture/investigation-contract.md),
[API](../../docs/architecture/api-mrr-decline-contract.md),
[answer](../../docs/architecture/investigation-answer-contract.md).
All fixtures and test databases are synthetic.

| ID         | Input / fixture                                                        | Required outcome                                                                                    | Prohibited behavior                                         |
| ---------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| COUNTRY-01 | Completed August 2026 parent; action or exact country phrase           | July/August country totals and deltas reconcile to parent; synthetic total change −170000 EUR cents | Current-month composition presented as explanation          |
| COUNTRY-02 | Parent restricted to `cust_acme`                                       | Exact inherited scope; delta −240000 EUR cents                                                      | Wider customer scope, date or filter overrides              |
| COUNTRY-03 | Wrong/missing parent token; parent token used on child or vice versa   | 401/404; no tools on failed authorization                                                           | Other investigation evidence disclosure                     |
| COUNTRY-04 | Complete months with missing country in injected controlled repository | Explicit unassigned-country row for both months and warning; totals reconcile                       | Missing MRR silently dropped or assigned to a named country |
| COUNTRY-05 | Missing analytics or source totals changed since parent                | Child reserved and retained as blocked; answer unavailable                                          | Invented values or contextual explanations                  |
| COUNTRY-06 | Restart API/store after completion                                     | Same child comparison and evidence; unchanged parent                                                | Analytics required to read retained results                 |
| COUNTRY-07 | Country phrase plus date/filter/other metric/combined grouping         | Unsupported without reservation/tool execution                                                      | Constraints silently dropped                                |
| COUNTRY-08 | Customer moves DE to GB with unchanged MRR                             | Signed country-total changes, no customer churn/acquisition labels                                  | Country loss called churn                                   |
| COUNTRY-09 | Wrong query scope/month, tampered rows/totals or input references      | Answer unavailable                                                                                  | Uninspectable chart/table values                            |
| COUNTRY-10 | Mobile UI action/phrase and citations                                  | Both-month table, ranked change chart, child token citations; visible unsupported outcome           | Token storage in URL/browser storage                        |

Coverage: metrics comparison tests, shared country-contract tests, investigation
country-answer tests, API country-follow-up and live PostgreSQL integration tests,
web client/browser tests. Live database cases require both database URLs.
