# Executive MRR web interface

## Scope

`apps/web` is a React/Vite interface for the existing structured synthetic
MRR-decline API. It accepts structured month and customer inputs and calculates no
metrics. The bounded question resolver remains an API capability; it is not part
of the web form. Routes are explicit API paths; there is no filesystem URL routing.

The form accepts a reporting month and an optional comma-separated list of at
most 50 unique customer IDs. Empty scope means all customers granted to the signed-in user. June–August 2026 are available in the synthetic
dataset; May lacks source coverage and produces a blocked outcome. Each
submission uses a new investigation identifier.

The form has one investigation action. The redundant optional question helper
and country phrase input are not exposed. Follow-ups use named actions against
the retained parent scope.

## Answers and evidence

The interface validates responses with shared schemas and presents the answer,
drivers, plan breakdown, context, and recommended next step in a clear reading
order. Limitations, source inventory, and the retained plan use keyboard-operable
disclosures so they remain inspectable without crowding the result. The header
uses plain MRR language without company branding or a dataset badge. The request
panel sits to the left of a continuous result surface on desktop. A keyboard
operable control in the header hides the panel fully and restores it without clearing form
state; collapsed inputs are not focusable. On narrow screens the request comes
first. Thin rules separate result sections.
Fixture and source provenance remain in their records.
It shows the resolved month, previous-month comparison, and customer scope.
Claim citations use human-readable evidence descriptions and open the
authenticated evidence route. Evidence shows source references, scope,
freshness, integrity, and supporting content. Retrieved document excerpts use a
safe Markdown subset; raw HTML is never interpreted, and a copy control places
the verbatim Markdown excerpt on the clipboard.

A username and password sign-in obtains an eight-hour server session. The page supports sign-out; resolved customer scope is shown with each answer. Session and investigation bearer tokens live only in page memory. They never enter URLs or browser
storage. Reloading and sign-out clear access and recent history. The sidebar provides
searchable history for the latest 20 completed investigations in the current
page session. Reopening restores the retained answer, completed follow-up results,
and their separate evidence credentials without rerunning tools. A new submission
replaces the active result and leaves completed investigations in that session
history. History is not persisted to browser storage or available after reload.
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
tools. The trail follows the active answer, including when reopened from session history.

## Customer churn follow-up

A completed parent offers “Calculate customer churn”. The result presents the
inherited month and customer scope, “customers churned / starting customers”,
the formatted rate, warnings, and authenticated query/calculation citations.
The browser formats the trusted rate; it does not derive cohort counts. A
blocked child shows its retained identifier and warnings without a rate.
Completed results emphasize the trusted churn percentage, with the churned and
starting customer counts directly beside it for context. Evidence citations
name the period or calculation they open.

## Country comparison follow-up

Completed parent answers offer “Break down by country”. This executes
against the stored parent scope, independently of edits to the new-investigation
form. Loading, blocked results and service failures are
announced and permit retry. A blocked child shows its retained identifier and
warnings; it does not display invented values.

The child displays previous/current month labels, exact customer scope, and a
scrollable table of signed country-total changes (largest loss first), previous
MRR, and current MRR. Missing dimensions show an explicit
unassigned-country row and limitation. Row and total citations open the child's
retained calculation; its input queries and parent total snapshots are also
inspectable. Separate page-memory tokens protect parent and child citations.
The parent answer and trail remain visible and unchanged. Reload clears child access with parent access; a new submission retains completed
children only inside their parent session-history entry; server records remain retained.
Country migration is explicitly distinguished from churn and acquisition.

## Deployment boundary and failures

Local Vite development proxies `/v1/investigations` to the fixed separate Node API
at `http://127.0.0.1:3001`. Production hosting must serve the built assets and
proxy that same prefix to the API; Vite's development server is not a production
backend. No upstream destination is accepted from browser input.

Submission and evidence loading states are announced. Invalid form scope,
blocked evidence, unavailable services, and failed evidence reads have visible
outcomes that allow retry. Inputs and citations support keyboard use and narrow
screens. The interface does not expose a synthetic-data badge; the data and
evidence records retain their synthetic provenance.

General natural-language resolution, new metrics, additional chart types, SSE streaming, external identity providers and multi-tenant authorization, and NestJS migration remain planned scope.

## Customer drill-down

Each retained country row offers a keyboard-operable “Show accounts” action.
It uses the country child's token and inherited scope. The result shows the
five largest negative customer contributions with prior/current MRR and signed
change, aggregate positive offsets, remaining net movement and country totals.
Every numerical group has an authenticated citation; full customer rows and
parent provenance remain inspectable. Limitations explain transfers, truncation
and the absence of business-cause evidence. Empty losses have an explicit state.

Loading, blocked records and service failures are announced and permit retry.
Blocked children expose their retained identifier without numerical claims.
Tokens stay in separate page-memory references. A new country comparison clears the active customer result. A new investigation
keeps completed customer results with its history entry; reload clears all access; stored server
results remain available through their token-protected routes after restart.

## Cross-source workspace

Completed MRR answers show a reconciled revenue-movement waterfall with a
labeled EUR value axis, movement values, connecting balances, a value table, and
evidence inspection. Cross-source actions use the selected customer
drill-down when present, otherwise the initial MRR investigation. Busy status
and the retained approved plan identify the contextual investigation; execution
remains synchronous without streaming. CRM, support and usage sections show source
records, deterministic active-user deltas, coverage and freshness, document
excerpts, tentative model hypotheses and explicit limitations. Each contextual
child has a separate evidence token. Parent answers remain visible. See the
[cross-source contract](cross-source-investigation-contract.md).
The cross-source result explains the model's limited role: it may propose
approved context sources and tentative evidence-linked hypotheses, while the
application validates proposals and presents deterministic MRR values and the
retained customer scope.

## Presentation and disclosure

Neutral greys, consistent controls, and thin dividers organize the interface.
The reporting month, comparison, and customer scope are separate labeled fields.
Claims keep nearby “Sources” disclosures; chart values, operational records,
model execution details, source inventory, and the retained plan are expandable.
Hypotheses and their uncertainty remain visible with coverage warnings.
Copy controls sit on their own line below full-width document excerpts, copy
verbatim Markdown, and reset success or failure feedback after two seconds.
The trusted churn percentage is emphasized beside its cohort counts.
