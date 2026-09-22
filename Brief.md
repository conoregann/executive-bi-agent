# Executive BI Agent

## One-line brief

Build a production-style internal business intelligence agent for a fictional B2B SaaS company. It investigates executive questions across trusted metrics, operational data, and company knowledge, then returns concise answers with inspectable evidence and useful follow-up actions.

## Problem

Company information is distributed across billing, CRM, product usage, marketing, support, finance, operational systems, meeting transcripts, reports, and strategy documents. Executives depend on analysts for questions that should be answerable in minutes:

- Why did revenue fall last month?
- Which segments are driving churn?
- Why is conversion lower in Germany than in the UK?
- Which accounts are at risk of cancellation?
- Are we on track for the quarterly revenue target?
- What changed after the pricing launch?

The product must investigate rather than behave like unrestricted “ChatGPT over a database.” Responses should distinguish observed facts, calculations, hypotheses, and recommendations.

## Target experience

An executive asks a question in a web dashboard. The agent clarifies intent, plans an investigation, selects centrally defined metrics and controlled tools, queries approved analytics data, retrieves relevant company knowledge, compares results, states uncertainty, and returns an executive summary with evidence and next actions. Follow-up questions preserve investigation context.

## Example outcome

> Revenue declined 8.4% month over month. Enterprise churn contributed the largest share of the decline, while acquisition and checkout conversion also weakened. A payment-provider incident overlapped with the conversion drop, but this is a potential contributor rather than confirmed causation. The response links to the revenue metric, churn breakdown, payment incident, and sales review, and recommends reviewing the affected enterprise accounts.

## System boundaries

```text
Executive web app
        ↓
API and investigation orchestrator
        ├── semantic metrics and controlled analytics tools
        ├── safe exploratory SQL (secondary path)
        ├── company-knowledge retrieval
        └── evidence, charts, and observability
        ↓
PostgreSQL analytics database + synthetic source data/documents
```

Repository boundaries:

- `apps/web` — executive interface.
- `apps/api` — API and investigation orchestration.
- `apps/worker` — ingestion, indexing, and asynchronous analysis jobs.
- `packages/metrics` — metric definitions and query planning.
- `packages/schemas` — shared typed contracts.
- `packages/database` / `packages/analytics` — persistence and analytics access.
- `packages/retrieval` — document ingestion and knowledge search.
- `packages/ai` — model adapters and structured generation.
- `packages/connectors` — simulated source connectors.
- `packages/observability` — traces, query IDs, latency, and cost signals.
- `evals` — deterministic and model-assisted quality cases.

## Domain model

The fictional company should include enough cross-functional data to force meaningful investigations:

- Customers and subscriptions: plan, MRR, status, country, industry, company size, owner, and lifecycle dates.
- Product usage: customer, user, feature, event type, timestamp, and session.
- Sales and marketing: opportunities, campaigns, spend, leads, conversions, and attributed revenue.
- Support and payments: tickets, priority, resolution, CSAT, payment status, provider, and failure reason.
- Company knowledge: board reports, sales reviews, incident postmortems, pricing documents, customer escalations, meeting transcripts, and product launch reports.

All data is synthetic and must be labeled as such.

## Non-negotiable design decisions

### Semantic metrics first

Define revenue, MRR, churn, CAC, LTV, active customer, conversion, retention, and ARPU centrally. Each metric needs a definition, grain, time semantics, dimensions, filters, owner, freshness, and validation cases. The model selects metrics; it does not invent their meaning.

### Controlled tools before free-form SQL

Expose bounded capabilities such as `getMetric`, `compareMetric`, `breakdownMetric`, `getAccountHealth`, `getSupportTickets`, `searchCompanyKnowledge`, and `createChart`. Text-to-SQL may support genuinely exploratory questions, but generated SQL must be read-only, schema-approved, validated, limited, timed out, and executed with a read-only database role.

### Evidence with every material claim

Evidence should include source type, source identifier, query or document reference, relevant time range, freshness, and evidence strength. The agent must say when evidence is missing, conflicting, stale, or only correlational.

### Evaluation is part of the feature

Each meaningful capability needs cases for correctness, ambiguity, safety, groundedness, permissions, and failure behavior. Track answer quality separately from latency and cost.

## Capability roadmap

Deliver each capability as a complete, merge-ready system outcome. The roadmap
orders dependencies; it does not require teams to manually split work into
artificial delivery slices. Prefer repeatable automation, typed boundaries, and
evaluation over process overhead.

1. Establish metric, evidence, and safety contracts with deterministic
   synthetic analytics data.
2. Provide trusted MRR analysis, including comparisons, movements, breakdowns,
   and chart-ready results.
3. Provide company-knowledge retrieval and hybrid evidence.
4. Provide investigation planning and follow-up context.
5. Provide safe exploratory SQL, permissions, observability, and review workflows.
6. Provide the executive web experience and deployment once the core path is reliable.

## Success criteria

An executive can ask a cross-functional business question and receive an answer that is faster than a manual analyst workflow, consistent with defined metrics, grounded in inspectable evidence, safe with respect to permissions and database execution, explicit about uncertainty, and useful for a decision or next investigation.

Keep durable contracts in `docs/` and repeatable acceptance cases in `evals/`.
Avoid duplicate or speculative documentation; this file remains a concise
orientation document.
