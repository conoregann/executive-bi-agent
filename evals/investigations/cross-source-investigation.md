# Synthetic cross-source acceptance benchmark

Contract: [cross-source investigations](../../docs/architecture/cross-source-investigation-contract.md).

Run `pnpm eval:cross-source` after building the workspace. It executes 45 synthetic
cases against the API and retained-answer boundaries: malformed plans and
synthesis, unknown citations, permissions, customer/date overrides, unsupported
questions, missing sources, contradictory CRM context, stale coverage, malicious
source instructions, restart reads, valid support hypotheses and the thirty-second
model deadline. Every case specifies an executable assertion and stable ID.

The JSON output separates deterministic contract results and measured harness
latency from live model quality and cost. The adapter is injected or disabled;
provider quality and cost remain `not_measured`. Passing this suite does not
establish model reasoning quality or production latency.

Package/API tests additionally verify PostgreSQL fixture parity, read-only role
isolation, retained cross-source reads with analytics unavailable, deterministic
usage deltas and waterfall reconciliation. The browser case completes MRR →
country → German accounts → scoped operational context and protected citations
at mobile width. No source coincidence is presented as a proven cause.
