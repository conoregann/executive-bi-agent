# Executive BI Agent

Production-style executive business intelligence agent for a fictional B2B SaaS
company. It combines trusted metrics, controlled analytics queries, company
knowledge retrieval, and evidence-backed investigations.

## Current scope

The implemented path is a Node.js HTTP API for structured synthetic MRR-decline
requests, deterministic metrics and scoped lexical knowledge retrieval,
PostgreSQL investigation/evidence persistence, and token-protected cited answers.
There is no web app, worker, model integration, or exploratory SQL execution yet.

- `apps/api` — the current deployable API.
- `packages` — analytics, metrics, retrieval, investigations, and shared schemas;
  `packages/database` currently contains documentation only.
- `data/synthetic` — small labeled analytics and knowledge fixtures.
- `infra/postgres` — local database initialization, migration, and verification.
- `evals` — Markdown acceptance cases; executable checks are package/API tests.
- [Spec.md](Spec.md) — current inventory and clearly labeled future architecture.
- [Documentation](docs/README.md) — focused runtime and domain contracts.
- [CONTRIBUTING.md](CONTRIBUTING.md) — setup and verification workflow.
- [AGENTS.md](AGENTS.md) — governing policy and safety requirements.

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
