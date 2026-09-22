# Project documentation

Documentation is the source of truth for the system’s business language, boundaries, and testable behavior. Read contracts in this order before implementing a capability:

1. [Project brief](../Brief.md)
2. [Company context](discovery/company-context.md)
3. [Executive question contract](discovery/question-contract.md)
4. [Semantic metric catalog](metrics/metric-catalog.md)
5. [Metric query contract](metrics/query-contract.md)
6. [Trusted MRR service contract](architecture/trusted-mrr-service-contract.md)
7. [Investigation contract](architecture/investigation-contract.md)
8. [Evidence contract](architecture/evidence-contract.md)

Evaluation cases live in `evals/` and are acceptance criteria, not optional
examples. The executable MRR slice is evaluated by
[`evals/analytics/trusted-mrr-service.md`](../evals/analytics/trusted-mrr-service.md).
