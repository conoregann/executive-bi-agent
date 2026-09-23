# Investigations Package Guide

Own the investigation state machine and tool ordering, not metric computation or
document retrieval. Read `docs/architecture/investigation-contract.md`,
`docs/architecture/evidence-contract.md`, and
`docs/discovery/question-contract.md` before editing.

- Resolve and retain the requested period, filters, and permitted customer scope.
  Follow-ups must not silently broaden that scope.
- Call typed metric operations before customer movement and bounded knowledge
  retrieval. Never bypass an invalid metric result with contextual explanation.
- Preserve tool evidence in the result. Numerical conclusions need metric or
  calculation evidence; contextual statements need document evidence.
- Stop as `blocked` when a required metric is unavailable or unreconciled.
  Describe correlations as unconfirmed unless causal evidence exists.
- Return the ordered response contract: answer, drivers, context, limitations,
  evidence, and a bounded next step.

Cover successful, blocked, and follow-up-scope behavior in package tests.
