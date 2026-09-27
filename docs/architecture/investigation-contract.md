# Investigation contract

## Purpose

An investigation turns a bounded executive question into a sequence of controlled actions and an evidence-backed answer. It is not a single model completion and it does not grant unrestricted system access.

## General design and executable scope

The general lifecycle and normalized plan fields below describe intended
question-driven orchestration. The current structured MRR API implements the
five-step plan and `completed`/`blocked` terminal records described below and
in the [API contract](api-mrr-decline-contract.md).

## State machine

```text
received → scoped → planned → gathering_evidence → synthesizing → completed
                          ↘ needs_clarification
                          ↘ blocked
                          ↘ failed
```

Only `completed` investigations may be presented as an answer. `blocked` explains which required evidence is unavailable; `failed` exposes a safe diagnostic identifier without leaking system details.

## Plan contract

Before tools run, the orchestrator persists a plan with:

| Field              | Requirement                                                  |
| ------------------ | ------------------------------------------------------------ |
| `investigation_id` | Immutable identifier for the full request.                   |
| `resolved_request` | The normalized executive-question contract.                  |
| `claims_to_test`   | Measurable questions, not predicted conclusions.             |
| `steps`            | Ordered controlled tool calls and expected evidence.         |
| `stop_conditions`  | Maximum steps, time, and explicit evidence sufficiency rule. |
| `permissions`      | The least-privilege scope applied to every step.             |

Example claims for “Why did MRR fall in August?” are: measure the change, reconcile MRR movements, identify the largest contributing segments/customers, and retrieve dated context for those drivers. “A pricing change caused churn” is not a valid initial claim because it presupposes a conclusion.

## Initial executable investigation

The first runnable investigation is `mrr_decline`. It accepts an explicit
calendar month and an optional permitted customer scope. It does not parse
natural language or resolve a missing year; the question boundary must provide
the normalized request first.

The deterministic plan runs, at most, these five steps in order:

1. Compare whole-company MRR with the immediately preceding month.
2. Reconcile MRR movements.
3. Rank the largest customer losses, limited to five customers.
4. Break down MRR by plan and report any missing-dimension warning.
5. Search company knowledge only within the ranked customer scope.

The capability completes with evidence and limitations when contextual search
returns no hits. It becomes `blocked` when required metric evidence is
unavailable or does not reconcile; it must not replace that evidence with a
document narrative.

## Follow-up context

The orchestrator retains an immutable investigation record keyed by
`investigation_id`: the resolved request, approved plan, terminal state,
warnings, and evidence references. A follow-up receives this record explicitly
from the caller; no model session memory is an authority for prior scope.

Follow-up handling may reuse the resolved month and permitted customer IDs, but
it may not broaden filters, customer scope, tool budget, or permissions. A
request that needs a different period, metric, or scope begins a new
investigation. Unknown or non-terminal investigation IDs are rejected without
running a tool.

The current executable API requires an exact month/customer-scope match and a
per-investigation bearer token. The token is issued once at creation and only
its SHA-256 hash is stored. The plan is reserved before tool execution;
terminal records and evidence are retained in PostgreSQL. See the
[API contract](api-mrr-decline-contract.md) for routes and responses.

## Executable country follow-up

A completed `mrr_decline` parent with usable retained comparison evidence may
execute `mrr_country_follow_up`. Authentication uses the parent's token before
any reservation or tools. The child inherits the exact month, previous-period
comparison and permitted customer IDs, including the original full-dataset
scope. Dates, filters and other metrics cannot be supplied as overrides.

The child reserves its own ID and two-step plan before querying country MRR for
the previous and current months. `packages/metrics` calculates signed country
deltas, sorts the largest losses first and reconciles both totals. Both totals
must also equal the parent's retained total queries. Unavailable analytics,
invalid evidence, or changed totals produce a retained `blocked` child, without
an answer. Missing dimension MRR remains an explicit unassigned row.

The child retains its own query/calculation evidence plus copies of the parent's
total queries under local evidence IDs. It has a separate bearer token and
immutable linked record; the parent remains unchanged. Retained child answers
and evidence are readable after restart without querying analytics or requiring
the parent token. Country children may become parents only for the bounded customer drill-down below.
Country movements mean changes in country totals, including country migration;
they do not classify churn, acquisition or causes.

## Tool design and implementation status

The table describes intended general tools. Current executable MRR operations
are listed in the [trusted service contract](trusted-mrr-service-contract.md),
and lexical retrieval in the [knowledge contract](company-knowledge-retrieval-contract.md).
Support-ticket/CRM tools and generic metric/chart bindings are not implemented.

## Intended general tools

| Tool                        | Purpose                                            | Output requirement                         |
| --------------------------- | -------------------------------------------------- | ------------------------------------------ |
| `get_metric`                | Retrieve a catalog metric at a stated scope.       | Metric result contract and query evidence. |
| `compare_metric`            | Compare equivalent periods or targets.             | Both scopes and calculation evidence.      |
| `breakdown_metric`          | Group a metric by an allowed dimension.            | Reconciliation or missing-segment warning. |
| `get_customer_mrr_movement` | Identify customer-level revenue movement.          | Customer IDs, values, and period.          |
| `get_support_tickets`       | Retrieve permission-scoped account support facts.  | Ticket identifiers and timestamps.         |
| `get_crm_context`           | Retrieve permission-scoped sales/account facts.    | Record identifiers and timestamps.         |
| `search_company_knowledge`  | Retrieve relevant document chunks.                 | Chunk evidence with metadata and scores.   |
| `create_chart_spec`         | Produce a chart-ready specification from evidence. | Data references, no invented series.       |

Tools return typed data and evidence objects. They do not return prose intended for an executive. Exploratory SQL is excluded until its separate safety contract and evaluation suite exist.

## Budgets and stop conditions

The general design budget is at most 8 tool calls, 60 seconds wall time, and
100 retrieved knowledge chunks before reranking. The executable MRR plan is
limited to five calls; the general wall-time/reranking budget is not an
implemented runtime guarantee. The orchestrator stops early when the metric is measured, its movement reconciles, supporting context has been searched, and no unresolved high-severity warning remains.

If required metric evidence is unavailable or fails to reconcile, the executable
MRR investigation is `blocked`. Non-blocking contextual gaps retain limitations;
no investigation may make extra speculative calls to find a convenient narrative.

## Synthesis rules

- Quantified claims require metric or record evidence.
- Contextual claims require a cited document or operational record.
- Rank drivers by a stated contribution calculation, not language-model confidence.
- Label a relationship as correlation unless causal evidence is explicitly present.
- State material data gaps and unresolved contradictions.
- Recommendations must be bounded, reversible when possible, and assigned to a human decision-maker.

## Executable customer drill-down

Only a completed `mrr_country_follow_up` can parent `mrr_customer_follow_up`.
The structured request supplies a new ID and a country present in the retained
comparison, including explicit `null` for unassigned MRR. Month and permitted
customer IDs are inherited exactly; overrides and unknown fields are rejected.
Authentication precedes reservation and execution. An invalid parent kind,
blocked parent or unknown country cannot reserve a child or run tools.

The child reserves its ID and one-step `get_customer_country_contributions`
plan before tools run. Missing or invalid retained country evidence produces a
retained blocked child without tools. Otherwise the deterministic contribution
operation runs once. Both returned totals and the delta must equal the selected
retained country row. Unavailable, malformed or changed evidence blocks the
child; there is no partial answer or scope broadening.

The child retains its own query and calculation evidence and a self-contained
snapshot of the parent record and evidence with local IDs and remapped input
links. A separate bearer token protects its record, answer and citations.
Retained reads validate both provenance chains and run no analytics tools;
they remain available after restart without analytics access or the parent
token. Parent records remain immutable. Customer drill-downs cannot become
parents; the supported maximum path is MRR → country → customers.
