Here is the complete, production-grade **`docs/SPEC.md`**. 

This document serves as the authoritative technical blueprint for the system: defining the business model, database schemas, metric definitions, agent tool contracts, SQL safety policies, and evaluation standards without fluff or speculative prose.

***

# Executive BI Agent — System & Domain Specification

**Status:** Canonical System Specification  
**Domain:** Enterprise B2B SaaS Business Intelligence & Decision Support  
**Target Organization:** ApexCloud Technologies (Fictional mid-market B2B SaaS: $28.9M ARR, 1,400+ enterprise/mid-market accounts)

---

## 1. System Topology & Data Flow

```text
                       ┌─────────────────────────┐
                       │   Executive Dashboard   │
                       │   Next.js 15 / Recharts │
                       └────────────┬────────────┘
                                    │ HTTP / SSE
                                    ▼
                       ┌─────────────────────────┐
                       │       NestJS API        │
                       │ Investigation Engine    │
                       └──────┬───────────┬──────┘
                              │           │
                 ┌────────────┴───┐   ┌───┴────────────┐
                 ▼                ▼   ▼                ▼
         ┌──────────────┐ ┌───────────────┐   ┌────────────────┐
         │ Semantic     │ │ Knowledge     │   │ Safe Exploratory│
         │ Metrics Tool │ │ RAG (pgvector)│   │ Text-to-SQL    │
         └──────┬───────┘ └───────┬───────┘   └────────┬───────┘
                │                 │                    │
                ▼                 ▼                    ▼
     ┌────────────────────────────────────────────────────────┐
     │           PostgreSQL 16 Analytics Database            │
     │   (raw.*  ──dbt──>  staging.*  ──dbt──>  analytics.*)   │
     └────────────────────────────────────────────────────────┘
```

### High-Level Investigation Pipeline
1. **Intent Extraction:** Map natural language question to target metrics, dimensions, time window, and domain context.
2. **Investigation Plan:** Generate a structured, verifiable plan (metric query $\to$ movement decomposition $\to$ document search $\to$ hypothesis testing).
3. **Execution:** Execute deterministic tool calls (`packages/metrics`), vector retrieval (`packages/retrieval`), and optional static-checked SQL.
4. **Synthesis & Evidence Linking:** Aggregate outputs into findings, where every numerical assertion links to a `query_id` and every contextual claim links to a `document_id`.
5. **Chart Generation:** Emit a typed Recharts-compatible visualization payload.

---

## 2. Monorepo Layout & Package Responsibilities

| Path | Responsibility | Invariant |
| :--- | :--- | :--- |
| `apps/web` | Executive Next.js interface, chat/investigation feed, Recharts visualizer | Presentation and state streaming only. Zero direct database or LLM queries. |
| `apps/api` | NestJS application, REST/SSE endpoints, auth, orchestrator entrypoint | Enforces rate limits, authorization, and tenant context. |
| `apps/worker` | BullMQ worker for heavy async investigations, dbt runs, and ingestion | Offloads long-running investigations (>5s). |
| `packages/metrics` | Semantic metric definitions, compiler, and analytical execution engine | Deterministic code only. Zero model inference inside metric math. |
| `packages/database` | Migrations, seed fixtures, PostgreSQL connection pools, read-only clients | Strict role-based isolation (read-only client for AI queries). |
| `packages/retrieval`| Chunking, metadata extraction, OpenAI/local embeddings, pgvector store | Hybrid search (semantic + metadata filters). |
| `packages/ai` | Model adapters, structured outputs, prompt templates, investigation planner | Provider-agnostic abstractions using shared Zod schemas. |
| `packages/schemas` | Canonical Zod schemas and TypeScript interfaces for the entire monorepo | Single source of typed truth across all apps and packages. |
| `packages/observability` | OpenTelemetry hooks, Langfuse tracing, query performance tracking | Logs query IDs, latency, token spend, and tool execution trees. |
| `evals/` | Deterministic acceptance tests and benchmark evaluations (100+ cases) | Validates metric correctness, SQL safety, and groundedness. |
| `data/` | Synthetic data generators (CRM, billing, events, support) and raw seeds | All generated records are strictly synthetic and labeled as such. |

---

## 3. Synthetic Domain Data Model

The data warehouse lives in PostgreSQL across three layers: `raw` (ingested JSON/records), `staging` (cleaned, normalized), and `analytics` (star schemas and dimensional marts).

```
raw.*  ──[dbt / SQL transformations]──>  staging.*  ──>  analytics.*
```

### 3.1 Relational Schemas (`staging.*` & `analytics.*`)

#### `customers`
```sql
CREATE TABLE staging.customers (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    industry VARCHAR(100) NOT NULL, -- 'Fintech', 'Healthcare', 'Ecommerce', 'B2B SaaS'
    country VARCHAR(3) NOT NULL,    -- 'DEU', 'GBR', 'USA', 'FRA', etc.
    company_size VARCHAR(50) NOT NULL, -- '1-50', '51-200', '201-1000', '1000+'
    plan VARCHAR(50) NOT NULL,        -- 'Starter', 'Growth', 'Enterprise'
    account_owner VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);
```

#### `subscriptions`
```sql
CREATE TABLE staging.subscriptions (
    id UUID PRIMARY KEY,
    customer_id UUID REFERENCES staging.customers(id),
    plan VARCHAR(50) NOT NULL,
    mrr NUMERIC(12, 2) NOT NULL,
    status VARCHAR(50) NOT NULL,      -- 'active', 'cancelled', 'past_due', 'trialing'
    billing_interval VARCHAR(20) NOT NULL, -- 'month', 'year'
    start_date DATE NOT NULL,
    cancelled_at TIMESTAMPTZ,
    cancellation_reason VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL
);
```

#### `product_events`
```sql
CREATE TABLE staging.product_events (
    id UUID PRIMARY KEY,
    customer_id UUID REFERENCES staging.customers(id),
    user_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL, -- 'login', 'export_report', 'api_call', 'dashboard_view'
    feature VARCHAR(100) NOT NULL,    -- 'reporting', 'integrations', 'user_management'
    session_id UUID NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_events_customer_ts ON staging.product_events(customer_id, timestamp);
```

#### `opportunities` (CRM)
```sql
CREATE TABLE staging.opportunities (
    id UUID PRIMARY KEY,
    account_id UUID REFERENCES staging.customers(id),
    owner_id VARCHAR(100) NOT NULL,
    stage VARCHAR(50) NOT NULL,       -- 'Prospecting', 'Qualified', 'Proposal', 'Closed Won', 'Closed Lost'
    amount NUMERIC(12, 2) NOT NULL,
    probability NUMERIC(3, 2) NOT NULL,
    loss_reason VARCHAR(255),        -- 'Pricing', 'Competitor', 'Missing Feature', 'Budget Frozen'
    created_at TIMESTAMPTZ NOT NULL,
    closed_at TIMESTAMPTZ
);
```

#### `support_tickets`
```sql
CREATE TABLE staging.support_tickets (
    id UUID PRIMARY KEY,
    customer_id UUID REFERENCES staging.customers(id),
    category VARCHAR(100) NOT NULL,   -- 'Billing', 'Bug', 'Feature Request', 'Performance'
    priority VARCHAR(20) NOT NULL,    -- 'P1-Critical', 'P2-High', 'P3-Normal', 'P4-Low'
    status VARCHAR(50) NOT NULL,      -- 'open', 'in_progress', 'resolved', 'escalated'
    opened_at TIMESTAMPTZ NOT NULL,
    resolved_at TIMESTAMPTZ,
    csat INTEGER CHECK (csat BETWEEN 1 AND 5)
);
```

#### `payments`
```sql
CREATE TABLE staging.payments (
    id UUID PRIMARY KEY,
    customer_id UUID REFERENCES staging.customers(id),
    amount NUMERIC(12, 2) NOT NULL,
    status VARCHAR(50) NOT NULL,      -- 'succeeded', 'failed', 'refunded'
    provider VARCHAR(50) NOT NULL,    -- 'Stripe', 'Adyen'
    failure_reason VARCHAR(255),     -- 'insufficient_funds', 'gateway_timeout', 'card_expired'
    created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_payments_status_ts ON staging.payments(status, created_at);
```

#### `campaign_performance` (Marketing)
```sql
CREATE TABLE staging.campaign_performance (
    id UUID PRIMARY KEY,
    campaign_name VARCHAR(150) NOT NULL,
    channel VARCHAR(50) NOT NULL,     -- 'Google Ads', 'LinkedIn', 'Organic', 'Webinar'
    spend NUMERIC(10, 2) NOT NULL,
    clicks INTEGER NOT NULL,
    leads INTEGER NOT NULL,
    conversions INTEGER NOT NULL,
    revenue NUMERIC(12, 2) NOT NULL,
    date DATE NOT NULL
);
```

---

### 3.2 Unstructured Knowledge Corpus (`packages/retrieval`)

Stored in `analytics.company_documents` backed by `pgvector`:

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE analytics.company_documents (
    id UUID PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    document_type VARCHAR(50) NOT NULL, -- 'qbr_report', 'incident_postmortem', 'board_deck', 'pricing_memo', 'sales_transcript'
    department VARCHAR(50) NOT NULL,    -- 'Executive', 'Engineering', 'Sales', 'Product', 'Support'
    author VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    embedding VECTOR(1536) -- OpenAI text-embedding-3-small or equivalent
);
CREATE INDEX idx_docs_embedding ON analytics.company_documents USING ivfflat (embedding vector_cosine_ops);
```

#### Required Synthetic Seed Documents:
1. **`DOC-2026-Q3-INCIDENT-08`:** Incident Postmortem: Adyen Payment Gateway Latency Spike (August 14–16, 2026) causing checkout conversion drop in DACH region.
2. **`DOC-2026-STRAT-PRICING`:** Executive Memo: Tier Restructuring & Enterprise Add-on Unbundling (Effective July 1, 2026).
3. **`DOC-2026-SALES-Q3-TRANSCRIPT`:** Transcript: Sales Leadership Weekly (September 4, 2026) highlighting enterprise resistance to pricing changes in Germany.
4. **`DOC-2026-BOARD-Q2-REVIEW`:** Q2 2026 Board Review: Regional Expansion Analysis (UK vs Germany growth trajectories).
5. **`DOC-2026-SUPPORT-ESCALATIONS-AUG`:** August 2026 Support Operations Report: Spike in P1 tickets for large enterprise accounts following the v4.2 release.

---

## 4. Semantic Metrics Catalog

Metrics are statically defined in `packages/metrics`. **The LLM is forbidden from authoring SQL logic for these calculations.**

| Metric Key | Grain | Allowed Dimensions | Business Definition & Standard SQL Formula |
| :--- | :--- | :--- | :--- |
| `mrr` | Monthly | `country`, `plan`, `industry`, `company_size` | **Monthly Recurring Revenue:** Sum of normalized monthly value for all active subscriptions.<br>`SUM(CASE WHEN status = 'active' THEN (CASE WHEN billing_interval = 'year' THEN mrr/12.0 ELSE mrr END) ELSE 0 END)` |
| `arr` | Monthly | `country`, `plan`, `industry` | **Annual Run Rate:** `mrr * 12.0` |
| `net_new_mrr` | Monthly | `country`, `plan` | **Net MRR Movement:** `new_mrr + expansion_mrr - contraction_mrr - churned_mrr` |
| `customer_churn_rate` | Monthly | `plan`, `industry`, `country` | **Logo Churn:** `(Count of accounts cancelled in month T) / (Count of active accounts at start of month T)` |
| `mrr_churn_rate` | Monthly | `plan`, `industry`, `country` | **Revenue Churn:** `(MRR lost to cancellations in month T) / (Total MRR at start of month T)` |
| `nrr` | Cohort / Annual | `cohort_quarter`, `plan` | **Net Revenue Retention:** `(Ending MRR of cohort after 12 months) / (Starting MRR of same cohort)` |
| `cac` | Monthly | `channel`, `campaign` | **Customer Acquisition Cost:** `(Total Marketing Spend + Sales Direct Spend) / (Total New Paid Customers Acquired)` |
| `ltv` | Trailing 12M | `plan`, `industry` | **Customer Lifetime Value:** `(ARPU * Gross Margin %) / Customer Churn Rate` |
| `trial_conversion_rate`| Weekly / Monthly| `country`, `channel` | **Checkout/Trial Conversion:** `(Subscriptions transitioning to active) / (Total unique trials/checkouts started)` |
| `active_customers` | Monthly | `country`, `plan`, `industry` | **Active Logo Count:** `COUNT(DISTINCT customer_id) WHERE status = 'active'` |
| `arpu` | Monthly | `plan`, `industry` | **Average Revenue Per User:** `Total Active MRR / COUNT(DISTINCT active customers)` |

---

## 5. Agent Tool Interfaces & Execution Contracts

All tools consumed by the agent are strictly typed via Zod in `packages/schemas`.

### 5.1 Tool Registry

#### 1. `getMetric`
Fetches a single deterministic metric aggregated over a time range.
```typescript
export const GetMetricSchema = z.object({
  metric: z.enum(['mrr', 'arr', 'customer_churn_rate', 'mrr_churn_rate', 'nrr', 'cac', 'trial_conversion_rate', 'active_customers']),
  timeRange: z.object({
    start: z.string().describe("ISO date (YYYY-MM-DD)"),
    end: z.string().describe("ISO date (YYYY-MM-DD)"),
  }),
  grain: z.enum(['day', 'week', 'month', 'quarter', 'year']).default('month'),
  filters: z.record(z.string(), z.string()).optional()
});
```

#### 2. `compareMetric`
Compares a metric between two periods or across a dimension.
```typescript
export const CompareMetricSchema = z.object({
  metric: z.enum(['mrr', 'customer_churn_rate', 'nrr', 'trial_conversion_rate', 'cac']),
  basePeriod: z.object({ start: z.string(), end: z.string() }),
  targetPeriod: z.object({ start: z.string(), end: z.string() }),
  dimension: z.enum(['country', 'plan', 'industry', 'company_size']).optional()
});
```

#### 3. `decomposeMetricMovement`
Decomposes movements (e.g., August MRR vs July MRR) into watermarked drivers: New, Expansion, Contraction, Churn.
```typescript
export const DecomposeMetricMovementSchema = z.object({
  metric: z.literal('mrr'),
  period: z.string().describe("Target month in YYYY-MM format"),
  groupBy: z.enum(['plan', 'country', 'industry', 'account_owner']).optional()
});
```

#### 4. `searchCompanyKnowledge`
Performs vector + metadata hybrid retrieval over internal company artifacts.
```typescript
export const SearchCompanyKnowledgeSchema = z.object({
  query: z.string().describe("Semantic query string (e.g., 'Germany checkout payment degradation')"),
  departments: z.array(z.enum(['Executive', 'Engineering', 'Sales', 'Product', 'Support'])).optional(),
  dateRange: z.object({ start: z.string(), end: z.string() }).optional(),
  limit: z.number().int().min(1).max(10).default(5)
});
```

#### 5. `getAccountHealth`
Retrieves risk scores, open P1 support tickets, usage drops, and billing status for top-impact accounts.
```typescript
export const GetAccountHealthSchema = z.object({
  customerIds: z.array(z.string().uuid()).max(20),
  includeRecentTickets: z.boolean().default(true)
});
```

#### 6. `createChart`
Produces a verifiable chart configuration for the frontend renderer.
```typescript
export const CreateChartSchema = z.object({
  chartType: z.enum(['line', 'bar', 'stacked_bar', 'area', 'table']),
  title: z.string(),
  xAxisKey: z.string(),
  yAxisKeys: z.array(z.string()),
  data: z.array(z.record(z.string(), z.any()))
});
```

---

## 6. SQL Safety Layer (Secondary / Exploratory Path)

When questions fall outside defined semantic metrics, the agent may fall back to the text-to-SQL tool (`queryAnalytics`). Unrestricted execution is strictly prevented:

```
[Agent Generated SQL]
         │
         ▼
 1. AST Parser (pgsql-ast-parser)
         │   • Disallow non-SELECT statements
         │   • Disallow subqueries touching forbidden schemas
         ▼
 2. Schema Whitelist Guard
         │   • ALLOWED: staging.*, analytics.*
         │   • FORBIDDEN: raw.*, pg_catalog.*, information_schema.*, auth.*
         ▼
 3. Parameter & Limit Injection
         │   • Inject `SET statement_timeout = '5000ms'`
         │   • Enforce max `LIMIT 500`
         ▼
 4. Execution via Read-Only Role
         │   • PostgreSQL Role: `bi_agent_readonly` (NO INSERT/UPDATE/DELETE/GRANT)
         ▼
   [Database Results]
```

### Static Rejection Invariants
The execution engine immediately rejects queries containing any of:
`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, `CREATE`, `GRANT`, `REVOKE`, `COPY`, `VACUUM`, `EXECUTE`, `PREPARE`, or multiple semicolons `;`.

---

## 7. Evidence, Citations & Synthesis Contract

The agent's output must adhere to a strict structured schema. Unverified freeform text is rejected.

### JSON Output Interface
```typescript
export interface InvestigationResult {
  investigationId: string;
  question: string;
  summary: string; // 2-3 sentence executive takeaway
  primaryDrivers: Array<{
    name: string;
    impact: string; // e.g. "-€82,400 MRR" or "-0.9% conversion"
    percentageOfTotalDelta?: number;
    evidenceRef: string; // Links to EvidenceItem.id
  }>;
  contextualEvents: Array<{
    event: string;
    date: string;
    correlationNote: string;
    evidenceRef: string; // Links to EvidenceItem.id
  }>;
  evidence: Array<{
    id: string; // e.g., "ev_qry_9182" or "ev_doc_0123"
    type: 'structured_query' | 'document_citation';
    source: string; // Table name, query ID, or Document Title
    timestamp: string;
    summary: string;
    rawPayload: Record<string, any>;
  }>;
  hypotheses: Array<{
    claim: string;
    confidence: 'high' | 'medium' | 'low';
    supportingEvidenceIds: string[];
  }>;
  recommendedActions: string[];
  visualization?: {
    type: 'line' | 'bar' | 'stacked_bar' | 'table';
    title: string;
    spec: Record<string, any>; // Recharts compatible
  };
}
```

---

## 8. Investigation State Machine

Every executive investigation runs through an inspectable state machine managed by the orchestrator:

```text
  [CREATED]
      │
      ▼
  [PLANNING] ─────────► (Emits Plan: metrics, tools, and docs to query)
      │
      ▼
  [EXECUTING] ────────► (Parallel/Sequential tool dispatch with latency traces)
      │
      ▼
  [ANALYZING] ────────► (Detects variances, correlates timestamps, validates math)
      │
      ▼
  [SYNTHESIZING] ─────► (Applies evidence links, formats charts, drafts actions)
      │
      ▼
  [COMPLETED]
```

### Handled Terminal Failure States:
- `INSUFFICIENT_DATA`: Data requested exists outside available dates or missing ingestion feeds.
- `SAFETY_VIOLATION`: Query flagged by AST parser or unauthorized permissions requested.
- `TIMEOUT`: Investigation exceeded 30s deadline.

---

## 9. Evaluation Framework & Benchmark Targets

The repository includes a dedicated benchmark suite under `evals/` containing 100 deterministic executive questions.

### Question Categories
1. **Direct Metric Queries (30%):** "What was MRR in Germany for August 2026?"
2. **Comparative Breakdowns (25%):** "Compare Enterprise churn in Q2 vs Q3 2026 by industry."
3. **Diagnostic Root-Cause (25%):** "Why did conversion drop between August 14 and 16?"
4. **Cross-Source Knowledge + Metrics (20%):** "Did accounts that churned after the July 1 pricing change submit support complaints?"

### Target Quality Gates
```text
┌────────────────────────────────────────────────┬──────────────┐
│ Metric                                         │ Target Gate  │
├────────────────────────────────────────────────┼──────────────┤
│ Metric Formula Correctness                     │ 100%         │
│ SQL Safety / Injection Prevention              │ 100%         │
│ Unsupported Claim Rate                         │ < 2.0%       │
│ Citation & Evidence Precision                  │ > 96.0%      │
│ Multi-step Root Cause Diagnostic Accuracy      │ > 90.0%      │
│ P95 Investigation Latency (Sync)               │ < 12.0s      │
│ P95 Investigation Latency (Async BullMQ Queue) │ < 30.0s      │
└────────────────────────────────────────────────┴──────────────┘
```

---

## 10. Capability Delivery Roadmap (Bulk Milestones)

Execution proceeds in complete functional milestones. Each milestone delivers code, configurations, schemas, and passing tests together.

```text
Milestone 1: Data Foundations & Metrics Core
      │
      ▼
Milestone 2: Knowledge Ingestion & Safe Query Services
      │
      ▼
Milestone 3: Investigation State Machine & Reasoning Engine
      │
      ▼
Milestone 4: Executive Web App & Live Visualization
      │
      ▼
Milestone 5: Benchmark Evaluation & Production Hardening
```

### Milestone 1: Data Foundations & Metrics Core
- Docker Compose setup (`PostgreSQL 16` + `pgvector` + `Redis`).
- Synthetic B2B SaaS data generators in `data/` and DB seed migrations.
- `packages/database` schemas (`raw`, `staging`, `analytics`).
- `packages/metrics`: Deterministic calculation engine for MRR, ARR, churn, NRR, CAC, and LTV.
- Automated tests verifying mathematical accuracy against seed fixtures.

### Milestone 2: Knowledge Ingestion & Safe Query Services
- `packages/retrieval`: Document ingestion pipeline, chunking, embeddings, and vector similarity search.
- Synthetic company corpus indexed (incident reports, QBRs, pricing strategy memos).
- `queryAnalytics` tool with AST safety parser, statement timeout, and row limits.

### Milestone 3: Investigation State Machine & Reasoning Engine
- `apps/api`: NestJS investigation orchestrator.
- Tool bindings: `getMetric`, `compareMetric`, `decomposeMetricMovement`, `searchCompanyKnowledge`.
- Multi-step reasoning pipeline with structured output, citation generation, and evidence binding.
- Unit and integration tests executing end-to-end question answering.

### Milestone 4: Executive Web App & Live Visualization
- `apps/web`: Next.js 15 interface with streaming SSE investigation progress.
- Collapsible *"How this answer was generated"* audit trail with inspectable SQL and document cards.
- Recharts visualizations for metric movements, cohort retention, and driver waterfalls.

### Milestone 5: Benchmark Evaluation & Production Hardening
- `evals/`: 100-question automated benchmark suite testing precision, groundedness, and latency.
- Langfuse / OpenTelemetry observability integration.
- RBAC permissions guardrails (e.g., regional or departmental data scoping).