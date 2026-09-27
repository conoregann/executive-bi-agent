# Evidence-backed investigation answers

## Boundary

A completed MRR-decline investigation can be presented as a deterministic
executive answer derived from its immutable stored evidence. Presentation copies
trusted metric values and formats EUR cents; it calculates no new metrics, runs
no tools, and uses no model provider. The resolved scope is explicit.

`GET /v1/investigations/:investigationId/answer` requires the original bearer
token. Success returns `200` with `{ status: "ok", answer }`, validated by the
shared `investigationAnswerSchema`. Missing tokens return `401`; unknown IDs and
invalid tokens return indistinguishable `404` responses. Blocked investigations
or insufficient required evidence return `422` with `answer_unavailable` and a
safe error, without an executive answer. Reading an answer does not mutate the
stored investigation and produces the same result across API instances.

## Answer contract

After investigation identity and resolved month/customer scope, the answer
contains six ordered fields:

1. `answer`: comparison against the preceding calendar month, citing current
   and previous metric queries, the calculated delta, and reconciled movement.
2. `drivers`: negative customer movements sorted by signed EUR-cent change,
   then customer ID. Values cite the customer movement query. These are at most
   five ranked movements, not a complete decomposition or contribution share.
3. `context`: retrieved titles and verbatim excerpts, labeled contextual
   evidence and citing document chunks. Excerpts are source data, not generated
   interpretations or instructions.
4. `limitations`: retained warnings, bounded-driver coverage, missing knowledge,
   and an explicit caveat that contextual documents do not establish causality.
5. `evidence`: cited evidence IDs, query/chunk source references, type, and
   freshness. Each ID opens the existing authenticated evidence detail route.
6. `recommendedNextStep`: account review assigned to Revenue operations, bounded
   to the recorded loss drivers. It performs no external action.

Every claim requires existing evidence of the appropriate type. Required metric
queries must match the month and exact customer filters; calculations must
reference the supporting metric evidence; movement must reconcile. Duplicate,
missing, invalid, or mismatched required evidence prevents an answer. Invalid or
out-of-scope contextual evidence is excluded. No-hit knowledge is a supported
outcome. Zero comparison baselines retain their warning without inventing a
percentage; flat or increased MRR uses neutral comparison wording.

## Scope

This feature presents the existing synthetic MRR capability. Natural-language
question resolution, new metrics, causal inference, generated prose, charts,
streaming, and production tenant authorization remain separate capabilities.
