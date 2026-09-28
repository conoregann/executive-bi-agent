# Customer churn follow-up contract

A completed `mrr_decline` investigation may create one bounded
`customer_churn_rate` follow-up. Its request has only `investigationId` and the
literal action `get_customer_churn_rate`. Authentication uses the parent token
before reservation. The child inherits the exact month and permitted customer
IDs; request overrides are invalid. The child reserves a one-step plan, executes
the deterministic metric once, and retains a separate token, record and evidence.

The response is `completed` with an answer only when two complete snapshots and
valid linked evidence exist. An unavailable month or invalid evidence retains a
`blocked` record without an answer. A zero starting cohort is completed with a
`null` rate and explicit warning. The answer returns numerator, denominator,
rate, two query IDs, a calculation ID and inspectable evidence. Retained reads
check scope, formula, cohort counts, rate and evidence links without querying
analytics. The parent remains unchanged; other tokens cannot read the child.
