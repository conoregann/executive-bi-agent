# Executive BI Agent

Production-style executive business intelligence agent for a fictional B2B SaaS company. It is being built as small, inspectable vertical slices: centrally defined metrics, controlled analytics access, company-knowledge retrieval, and evidence-backed investigations.

## Repository layout

- `apps/` — deployable surfaces: web, API, and worker.
- `packages/` — shared domain capabilities and contracts.
- `data/` — synthetic source data and seed fixtures.
- `evals/` — evaluation cases for metrics, SQL, retrieval, and investigations.
- `docs/` — discovery, architecture, metric definitions, and deliverables.
- `infra/` — infrastructure definitions when deployment needs justify them.

## Current capability

The first executable slice is a deterministic, trusted MRR service in
[`packages/metrics`](packages/metrics/). It accepts typed requests for a
complete UTC month and approved filters, then returns structured values and
evidence for:

- end-of-month MRR;
- month-over-month MRR comparison; and
- new, expansion, contraction, and churned MRR movements with exact
  reconciliation.

The service validates requests before accessing its repository, aggregates MRR
at the customer level before classifying movement, and returns typed warnings
for unavailable snapshots and zero comparison denominators. It does not run
free-form SQL, retrieve knowledge, or produce executive prose.

Read the [metric catalog](docs/metrics/metric-catalog.md), [metric query
contract](docs/metrics/query-contract.md), and [trusted MRR service
contract](docs/architecture/trusted-mrr-service-contract.md) before extending
this capability.

## Local development

Requirements: Node.js 22+ and pnpm 10+.

```bash
pnpm install
pnpm format:check
pnpm check
pnpm test
```

To run the MRR service tests directly:

```bash
pnpm --filter @executive-bi/metrics test
```

The repository uses pnpm exclusively. Do not commit `package-lock.json`.

## Development approach

Use small vertical slices: document the contract first, implement the narrowest useful path, add a representative evaluation, and keep each commit independently reviewable. Use `feat/<short-name>`, `fix/<short-name>`, and `chore/<short-name>` branches from `main`; use conventional commit messages.

All fixtures and documents in this repository are synthetic. They must never be
represented as access to a real company system.
