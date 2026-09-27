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
contains the six ordered answer fields below, plus an optional `chart`:

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

## MRR chart

The optional `chart` is a bar payload copied from retained MRR-by-plan query
rows. It carries the reporting month, exact permitted customer IDs,
`sourceEvidenceId`, `reconciles`, `unassignedMrrEurCents`, and `data` rows with
`dimensionValue` and `mrrEurCents`. Its source is included in the answer's
inspectable evidence list. The chart is a current-month composition, not a
movement decomposition.

The source must match the month, customer filters, and plan grouping. Rows must
have unique nonempty plan names and nonnegative safe integer EUR cents.
Retained grouped and unassigned values must reconcile to the measured current
MRR; validation performs no new metric calculation for presentation. Valid
complete evidence shows a complete breakdown. Warning evidence with unassigned
MRR shows named rows with an explicit incomplete-breakdown limitation and the
unassigned value. Missing, malformed, invalid, or mismatched chart evidence
omits the chart and adds a limitation while retaining an otherwise valid answer.
Reads reuse immutable evidence and run no additional tools.

## Scope

This feature presents the existing synthetic MRR capability. Natural-language
question resolution, new metrics, causal inference, generated prose, additional chart types,
streaming, and production tenant authorization remain separate capabilities.
