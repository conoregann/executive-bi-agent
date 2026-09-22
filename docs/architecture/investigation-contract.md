# Investigation contract

## Purpose

An investigation turns a bounded executive question into a sequence of controlled actions and an evidence-backed answer. It is not a single model completion and it does not grant unrestricted system access.

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

| Field | Requirement |
| --- | --- |
| `investigation_id` | Immutable identifier for the full request. |
| `resolved_request` | The normalized executive-question contract. |
| `claims_to_test` | Measurable questions, not predicted conclusions. |
| `steps` | Ordered controlled tool calls and expected evidence. |
| `stop_conditions` | Maximum steps, time, and explicit evidence sufficiency rule. |
| `permissions` | The least-privilege scope applied to every step. |

Example claims for “Why did MRR fall in August?” are: measure the change, reconcile MRR movements, identify the largest contributing segments/customers, and retrieve dated context for those drivers. “A pricing change caused churn” is not a valid initial claim because it presupposes a conclusion.

## Approved initial tools

| Tool | Purpose | Output requirement |
| --- | --- | --- |
| `get_metric` | Retrieve a catalog metric at a stated scope. | Metric result contract and query evidence. |
| `compare_metric` | Compare equivalent periods or targets. | Both scopes and calculation evidence. |
| `breakdown_metric` | Group a metric by an allowed dimension. | Reconciliation or missing-segment warning. |
| `get_customer_mrr_movement` | Identify customer-level revenue movement. | Customer IDs, values, and period. |
| `get_support_tickets` | Retrieve permission-scoped account support facts. | Ticket identifiers and timestamps. |
| `get_crm_context` | Retrieve permission-scoped sales/account facts. | Record identifiers and timestamps. |
| `search_company_knowledge` | Retrieve relevant document chunks. | Chunk evidence with metadata and scores. |
| `create_chart_spec` | Produce a chart-ready specification from evidence. | Data references, no invented series. |

Tools return typed data and evidence objects. They do not return prose intended for an executive. Exploratory SQL is excluded until its separate safety contract and evaluation suite exist.

## Budgets and stop conditions

The initial default budget is at most 8 tool calls, 60 seconds wall time, and 100 retrieved knowledge chunks before reranking. The orchestrator stops early when the metric is measured, its movement reconciles, supporting context has been searched, and no unresolved high-severity warning remains.

If evidence conflicts, is stale, or fails to reconcile, the investigation completes with that limitation; it must not make extra speculative calls just to find a convenient narrative.

## Synthesis rules

- Quantified claims require metric or record evidence.
- Contextual claims require a cited document or operational record.
- Rank drivers by a stated contribution calculation, not language-model confidence.
- Label a relationship as correlation unless causal evidence is explicitly present.
- State material data gaps and unresolved contradictions.
- Recommendations must be bounded, reversible when possible, and assigned to a human decision-maker.
