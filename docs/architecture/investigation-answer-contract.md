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

## Country follow-up answers

The existing authenticated answer route also presents completed
`mrr_country_follow_up` records as `countryFollowUpAnswerSchema`. It returns
parent/child IDs, exact customer scope, the trusted comparison, limitations,
inspectable evidence and `sourceEvidenceIds` (previous-country query,
current-country query, calculation). Each comparison row supplies country,
previous MRR, current MRR and signed change in EUR cents, ranked by change
ascending, then country. `null` country explicitly means unassigned MRR.
Totals include that row and reconcile exactly to both retained parent totals.

The country comparison is also the chart payload: the UI uses its trusted
signed changes and rows for chart labels and the table. Every chart/table value
cites the retained calculation and its two query inputs. No percentage share,
churn/acquisition classification, contextual explanation or causal claim is
added. Country migration can change totals even with unchanged customer MRR.

Reads verify evidence identity, exact scope, consecutive months, query rows,
input references, integrity and parent totals. Missing, malformed, mismatched
or blocked evidence returns `422 answer_unavailable`; it cannot yield a partial
executive comparison. Reads run no tools and preserve parent and child records.

## Scope

This feature presents the existing synthetic MRR capability. Natural-language
question resolution, new metrics, causal inference, generated prose, additional chart types,
streaming, and production tenant authorization remain separate capabilities.

## Customer drill-down answers

Completed `mrr_customer_follow_up` records return
`customerFollowUpAnswerSchema`: parent/child IDs, inherited customer scope,
`contributions`, limitations, evidence and three `sourceEvidenceIds` (previous
customer-country query, current query, calculation). Contributions include the
selected country, consecutive months, prior/current totals, signed delta, full
ranked customer rows, up to five `largestLosses`, positive offsets and remaining
net movement. All amounts are safe integer EUR cents. Every displayed numerical
claim cites the calculation with links to both query inputs.

Reads reject duplicate IDs/customers, altered query rows or scope, missing input
links, invalid integrity, wrong months, changed parent totals, incorrect ranking
or unreconciled offsets/remainder. The copied country provenance is validated as
well. Only trusted retained values are presented; no tools run. Transfers mean
country contributions, without churn/acquisition labels or business causes.

The optional `waterfall` accompanies the existing plan chart. It contains six
integer-cent rows derived centrally from retained reconciled MRR movement, with a
required inspectable calculation-evidence reference. It adds no model-generated
numerical series and is omitted when retained movement cannot produce valid
geometry. Both charts appear before the recommended next step in the answer.
