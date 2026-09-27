# Synthetic executive web acceptance cases

Contract: [Executive web](../../docs/architecture/executive-web-contract.md).
Executable coverage: `apps/web/test/browser.test.mjs`.

| Case   | Input / fixture                   | Expected outcome                                                                                                          |
| ------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| WEB-01 | Synthetic August 2026, full scope | Six ordered answer sections; supplied EUR -1700.00 delta; inspectable citations.                                          |
| WEB-02 | Open metric citation              | Authenticated evidence details; no token in URL or browser storage. Missing token returns 401, invalid token returns 404. |
| WEB-03 | Duplicate customer IDs            | Visible validation error; no investigation submitted.                                                                     |
| WEB-04 | July 2026 without June comparison | Blocked outcome; no executive answer invented.                                                                            |
| WEB-05 | August scoped to `cust_acme`      | Resolved scope retains exactly that customer; mobile layout and keyboard citation access work.                            |
| WEB-06 | Service 503 or evidence 404       | Recoverable visible error; no stale evidence displayed.                                                                   |
| WEB-07 | Reload after completion           | Answer and in-memory access token cleared.                                                                                |

WEB-08: Malformed answer responses fail closed with a readable error. Markup in
document evidence renders as plain text and cannot execute. Opening a citation
moves keyboard focus to the evidence detail heading.

WEB-09: Synthetic August scoped to `cust_riviera` shows EUR 300.00 in the
MRR-by-plan table, with exactly that resolved customer scope and no full-company
values. Chart citation opens its protected query evidence. The recorded-plan
disclosure opens with Enter, lists five steps and the terminal outcome, and
allows citation inspection without additional tool execution or mobile overflow.

WEB-10: Synthetic warning breakdown evidence with unassigned MRR shows the
incomplete label and separately cited unassigned value. Missing chart evidence
shows an unavailable message while retaining a valid executive answer.

WEB-11: Missing, invalid, wrong-period, malformed, duplicate-plan, or broadened
chart source evidence must not produce a chart. Rows must match retained query
values; incoherent reconciliation suppresses the chart. Reads are repeatable,
and the chart and provenance survive PostgreSQL persistence across API instances.
Executable coverage: schema contract, investigations package, API answer and live
PostgreSQL tests, plus browser tests.
