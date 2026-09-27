# Executive MRR web interface

## Scope

`apps/web` is a React/Vite interface for the existing structured synthetic
MRR-decline API. It resolves bounded natural-language MRR-decline questions
through the [question resolver](../discovery/question-contract.md); it calculates no
metrics. Routes are explicit API paths; there is no filesystem URL routing.

The form accepts a reporting month and an optional comma-separated list of at
most 50 unique customer IDs. Empty scope means the full synthetic dataset, not
production permission discovery. August 2026 supports comparison against July;
missing comparison evidence produces a blocked outcome. Each submission uses a
new investigation identifier.

An optional question field and “Resolve question” action populate the reporting
month and display the previous-period interpretation. Resolution runs no
investigation tools and preserves the explicit customer scope. Clarification,
unsupported wording, and service failures are visible and allow editing/retry.
The user reviews the structured fields and selects “Investigate MRR” to execute.
The structured form remains available independently.

## Answers and evidence

The interface validates responses with shared schemas and presents the answer,
drivers, context, limitations, evidence, and recommended next step in order.
It shows the resolved month, previous-month comparison, and customer scope.
Every supplied claim citation opens the authenticated evidence route. Evidence
shows source references, scope, freshness, integrity, and supporting content.
Document excerpts are rendered as text and cannot execute markup.

Bearer tokens live only in page memory. They never enter URLs or browser
storage. Reloading clears access; a new submission clears the previous result.
Only the latest evidence request may update the evidence panel. Reads use
`no-store`; the API also marks responses `no-store`.

## Visualization and retained investigation trail

Completed answers show a current-month MRR-by-plan bar chart with EUR labels,
resolved scope, an accessible value table, and an authenticated source citation.
The browser formats trusted cents and scales bars; it calculates no metric.
Incomplete breakdowns label unassigned MRR separately and cannot imply complete
coverage. Missing chart evidence shows an unavailable message without hiding the
executive answer. Empty named rows show an explicit no-plan-data outcome.

A keyboard-operable “How this answer was generated” disclosure shows the
recorded five-step plan, terminal outcome, and supporting cited evidence. It is
a retained plan, not execution timing or live progress. It uses the creation
response's validated record and the answer's cited evidence; opening it runs no
tools. New submissions and reloads clear the prior trail with the answer.

## Country comparison follow-up

Completed parent answers offer “Break down by country” and a dedicated
“Follow-up question” field accepting the bounded country phrase. Both execute
against the stored parent scope, independently of edits to the new-investigation
form. Loading, unsupported wording, blocked results and service failures are
announced and permit retry. A blocked child shows its retained identifier and
warnings; it does not display invented values.

The child displays previous/current month labels, exact customer scope, a chart
of signed country-total changes (largest loss first), and an accessible table of
previous MRR, current MRR and change. Missing dimensions show an explicit
unassigned-country row and limitation. Row and total citations open the child's
retained calculation; its input queries and parent total snapshots are also
inspectable. Separate page-memory tokens protect parent and child citations.
The parent answer and trail remain visible and unchanged. Reload/new parent
submission clears child access with parent access; server records remain retained.
Country migration is explicitly distinguished from churn and acquisition.

## Deployment boundary and failures

Local Vite development proxies `/v1/investigations` to the fixed separate Node API
at `http://127.0.0.1:3001`. Production hosting must serve the built assets and
proxy that same prefix to the API; Vite's development server is not a production
backend. No upstream destination is accepted from browser input.

Submission and evidence loading states are announced. Invalid form scope,
blocked evidence, unavailable services, and failed evidence reads have visible
outcomes that allow retry. Inputs and citations support keyboard use and narrow
screens. Synthetic data labeling remains visible.

General natural-language resolution, new metrics, additional chart types, SSE streaming, production
identity/tenant authorization, and NestJS migration remain planned scope.
