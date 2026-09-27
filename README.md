# Executive BI Agent

Production-style executive business intelligence agent for a fictional B2B SaaS
company. It combines trusted metrics, controlled analytics queries, company
knowledge retrieval, and evidence-backed investigations.

## Current scope

The implemented path is a Node.js HTTP API for structured synthetic MRR-decline
requests, deterministic metrics and scoped lexical knowledge retrieval,
PostgreSQL investigation/evidence persistence, and token-protected cited answers.
A React/Vite web interface supports this structured workflow. There is no worker,
model integration, or exploratory SQL execution yet.

- `apps/api` — the separate Node API, organized around the MRR capability.
- `apps/web` — React interface for investigations and protected evidence.
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

## Run the executive interface

Start PostgreSQL and apply migrations using [the database guide](packages/database/README.md).
Then set `DATABASE_URL` for the API and run in separate terminals:

```bash
pnpm build
pnpm --filter @executive-bi/api start
pnpm --filter @executive-bi/web dev
```

Open the Vite URL printed in the terminal. The web server proxies investigation
requests to the API on port 3001. Use August 2026 for the synthetic MRR comparison.
Install Chromium before running browser acceptance tests:

```bash
pnpm --filter @executive-bi/web exec playwright install chromium
```

Build web assets with `pnpm --filter @executive-bi/web build`.
Production hosting needs a same-origin reverse proxy; see the
[web contract](docs/architecture/executive-web-contract.md).
