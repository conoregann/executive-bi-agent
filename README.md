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

Build in outcome-sized, end-to-end increments. Keep one branch open for the
full capability across related changes, sessions, tests, and fixes; use regular
reviewable commits as checkpoints. Create a new branch only for a separate
outcome or intentionally isolated work, not for each prompt or small slice.
Keep contracts concise and update them only when a durable boundary, metric
definition, safety rule, or acceptance criterion changes. See
[AGENTS.md](AGENTS.md) for the delivery standard.

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

Use outcome-sized branches from `main` for meaningful capabilities. Keep the
branch open until the capability is complete and ready for review or merge,
including follow-up fixes and documentation. Implement related increments with
focused tests and useful, independently reviewable Conventional Commits; do
not create a new branch for every prompt, session, commit, or small slice. Use
`feat/<short-name>`, `fix/<short-name>`, and `chore/<short-name>` branch names.
