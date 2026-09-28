# Architecture

The current implementation provides a controlled synthetic MRR investigation path: a question becomes a plan, the plan selects trusted metrics and tools, tools return inspectable evidence, and the response cites that evidence. Runtime choices follow the domain contracts rather than precede them.

- [Investigation contract](investigation-contract.md) — lifecycle, executable
  MRR-decline plan, bounded follow-up context, tools, budgets, and synthesis
  rules.
- [Evidence contract](evidence-contract.md) — provenance, claim classes, strength, and citation behavior.
- [Analytics data contract](analytics-data-contract.md) — local PostgreSQL layers, synthetic fixtures, and verification.
- [Company-knowledge retrieval contract](company-knowledge-retrieval-contract.md) — scoped, deterministic document retrieval and evidence.

The initial architecture deliberately excludes exploratory SQL and external integrations until their safety and evaluation contracts exist.

## Runtime contracts

- [Trusted MRR service contract](trusted-mrr-service-contract.md) — the first
  controlled, evidence-bearing analytics capability.
- [Investigation contract](investigation-contract.md) — the executable MRR
  decline plan and bounded follow-up context.
- [MRR-decline API contract](api-mrr-decline-contract.md) — the narrow
  synthetic-data integration boundary.

- [Evidence-backed answer contract](investigation-answer-contract.md) — deterministic
  executive presentation of persisted investigations and inspectable citations.

- [Executive web interface](executive-web-contract.md) — structured synthetic MRR submissions and authenticated citation inspection.

- [Cross-source revenue investigation](cross-source-investigation-contract.md) — scoped operational evidence, optional model guidance, retained provenance and failure handling.
