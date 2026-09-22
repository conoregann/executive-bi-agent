# Project documentation

Documentation is the source of truth for the system’s business language,
boundaries, and testable behavior. Read the smallest relevant set of contracts;
do not load or duplicate unrelated documents. For a new capability, use this
order to find the governing contract:

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

Keep contracts concise and decision-focused: record definitions, boundaries,
invariants, and accepted failure behavior. Put implementation details in code
and repeatable examples in `evals/`.
