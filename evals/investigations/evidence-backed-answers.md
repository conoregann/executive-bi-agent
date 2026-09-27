# Evidence-backed answer acceptance cases

Contract: `docs/architecture/investigation-answer-contract.md`.
All fixtures are explicitly synthetic. Executable checks live in
`apps/api/test/investigation-answer.integration.test.mjs`, the shared schema
contract tests, the investigation package tests, and the PostgreSQL integration
test.

| Case      | Input or condition                                                       | Required outcome                                                                                                                     |
| --------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| ANSWER-01 | Synthetic August 2026, company scope                                     | July EUR 4,200.00, August EUR 2,500.00, delta EUR -1,700.00, with inspectable metric/calculation citations and six ordered sections. |
| ANSWER-02 | Only `cust_riviera` permitted                                            | EUR 400.00 to EUR 300.00, delta EUR -100.00; only that driver and review scope; no widened contextual search.                        |
| ANSWER-03 | Missing or wrong token; unknown investigation                            | 401 for missing token; indistinguishable 404 for wrong token or unknown ID.                                                          |
| ANSWER-04 | Required month unavailable; blocked record                               | 422 `answer_unavailable`; no numerical executive answer.                                                                             |
| ANSWER-05 | Invalid, duplicated, missing, wrong-period, or broadened metric evidence | Refuse synthesis; no context-based substitute for metrics.                                                                           |
| ANSWER-06 | Invalid, empty, or out-of-scope document excerpt                         | Exclude context and retain a missing-knowledge limitation; no fabricated narrative.                                                  |
| ANSWER-07 | Valid sales review excerpt                                               | Quote cited contextual source data and state causality is unconfirmed; never attribute the MRR change to the document.               |
| ANSWER-08 | Synthetic January 2026 growth from a zero December baseline              | Resolve December 2025 comparison; retain zero-denominator warning; no decline wording or invented percentage.                        |
| ANSWER-09 | Read repeatedly or through a second PostgreSQL-backed API instance       | Identical answers from persisted evidence, no additional tool execution or mutation.                                                 |
| ANSWER-10 | Missing, wrong-type, or dangling claim citation                          | Shared answer schema rejects the contract.                                                                                           |

ANSWER-11: An investigation named `answer` still returns its record at the
record route. An evidence ID named `answer` is resolved as evidence; it must not
return an executive answer.
