# Bounded natural-language MRR input

Contract: [question resolution](../../docs/discovery/question-contract.md).
Executable coverage: API resolver/HTTP tests and web browser tests.

- **NL-01:** “Why did MRR fall in August 2026?” resolves to `2026-08-01`,
  MRR investigation, previous-period comparison. Resolution creates no record,
  token, metric value, or evidence. Explicit `cust_acme` scope survives review
  and submission; the resulting synthetic answer includes inspectable citations.
- **NL-02:** “Why did MRR fall in August?” asks for the year without execution.
  Invalid ISO months also require clarification.
- **NL-03:** At `2026-01-01T00:00:00Z`, “Why did MRR drop last month?”
  resolves to `2025-12-01`; the server UTC calendar controls the default.
- **NL-04:** ARR, quarterly questions, country/customer filters in prose,
  custom comparisons, follow-ups, and appended SQL/instructions return unsupported.
  Never silently discard a filter, broaden customer scope, or execute SQL.
- **NL-05:** Blank, oversized, and unknown-field request bodies return `400`.
  The UI allows question edits after clarification and requires explicit
  investigation submission after resolution.
