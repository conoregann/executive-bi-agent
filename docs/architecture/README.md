# Architecture

The first implementation target is a controlled investigation path: a question becomes a plan, the plan selects trusted metrics and tools, tools return inspectable evidence, and the response cites that evidence. Runtime choices follow the domain contracts rather than precede them.

- [Investigation contract](investigation-contract.md) — lifecycle, plan, tools, budgets, and synthesis rules.
- [Evidence contract](evidence-contract.md) — provenance, claim classes, strength, and citation behavior.
- [Analytics data contract](analytics-data-contract.md) — local PostgreSQL layers, synthetic fixtures, and verification.
- [Company-knowledge retrieval contract](company-knowledge-retrieval-contract.md) — scoped, deterministic document retrieval and evidence.

The initial architecture deliberately excludes exploratory SQL and external integrations until their safety and evaluation contracts exist.

## Runtime contracts

- [Trusted MRR service contract](trusted-mrr-service-contract.md) — the first
  controlled, evidence-bearing analytics capability.
- [Investigation contract](investigation-contract.md) — the executable MRR
  decline plan and bounded follow-up context.
