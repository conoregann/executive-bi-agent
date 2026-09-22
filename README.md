# Executive BI Agent

Production-style executive business intelligence agent for a fictional B2B SaaS company. The system will combine trusted metrics, controlled analytics queries, company knowledge retrieval, and evidence-backed investigations.

## Repository layout

- `apps/` — deployable surfaces: web, API, and worker.
- `packages/` — shared domain capabilities and contracts.
- `data/` — synthetic source data and seed fixtures.
- `evals/` — evaluation cases for metrics, SQL, retrieval, and investigations.
- `docs/` — discovery, architecture, metric definitions, and deliverables.
- `infra/` — infrastructure definitions when deployment needs justify them.

The initial scaffold intentionally contains no business logic. The next step is to define the core domain and semantic metrics in Markdown before implementing the runtime.

## Local development

Requirements: Node.js 22+ and pnpm 10+.

```bash
pnpm install
pnpm check
pnpm test
```

## Development approach

Use small vertical slices: document the contract first, implement the narrowest useful path, add a representative evaluation, and keep each commit independently reviewable. Use `feat/<short-name>`, `fix/<short-name>`, and `chore/<short-name>` branches from `main`; use conventional commit messages.
