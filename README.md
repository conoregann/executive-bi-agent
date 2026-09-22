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

Build in focused, end-to-end slices. Keep contracts concise and update them only
when a durable boundary, metric definition, safety rule, or acceptance criterion
changes. See [AGENTS.md](AGENTS.md) for the delivery standard.

## Local development

Requirements: Node.js 22+ and pnpm 10+.

```bash
pnpm install
pnpm check
pnpm test
```

## Development approach

Use small vertical slices: implement the narrowest useful path, test it, and
keep each commit independently reviewable. Use `feat/<short-name>`,
`fix/<short-name>`, and `chore/<short-name>` branches from `main` with
conventional commit messages.
