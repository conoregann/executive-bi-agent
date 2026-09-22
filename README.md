# Executive BI Agent

Production-style executive business intelligence agent for a fictional B2B SaaS
company. It combines trusted metrics, controlled analytics queries, company
knowledge retrieval, and evidence-backed investigations.

## Repository layout

- `apps/` — deployable surfaces: web, API, and worker.
- `packages/` — shared domain capabilities and contracts.
- `data/` — synthetic source data and seed fixtures.
- `evals/` — evaluation cases for metrics, SQL, retrieval, and investigations.
- `docs/` — discovery, architecture, metric definitions, and deliverables.
- `infra/` — infrastructure definitions when deployment needs justify them.

Build in outcome-sized, end-to-end increments. A branch may include several
related changes that complete a meaningful business capability, with regular
reviewable commits along the way. Keep contracts concise and update them only
when a durable boundary, metric definition, safety rule, or acceptance
criterion changes. See [AGENTS.md](AGENTS.md) for the delivery standard.

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

Use outcome-sized branches from `main` for meaningful capabilities. Implement
related increments with focused tests and regular, independently reviewable
Conventional Commits; do not create a new branch for every small slice. Use
`feat/<short-name>`, `fix/<short-name>`, and `chore/<short-name>` branch names.
