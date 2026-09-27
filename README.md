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
- `apps/web` — React/Vite interface styled with Tailwind CSS for investigations and protected evidence.
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

You can run the frontend now. Requirements: Node.js 22+, pnpm 10+, and
Docker Desktop running for the persistent API. From the repository root:

```bash
pnpm install
if [ ! -f .env ]; then cp .env.example .env; fi
pnpm db:up
# Wait for `docker compose ps` to report the database healthy.
pnpm db:migrate
pnpm db:verify
pnpm build
```

Keep these processes running in separate terminals from the repository root.
Terminal 1 starts the separate backend and loads the local database configuration:

```bash
set -a
source .env
set +a
pnpm --filter @executive-bi/api start
```

Terminal 2 starts the React/Vite frontend:

```bash
pnpm --filter @executive-bi/web dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173), or the URL Vite prints if
that port is occupied. The web server proxies requests to the API on port 3001;
keep the API on that port. Select **August 2026**, leave customer IDs empty for
the full synthetic dataset, or enter `cust_acme` for a scoped investigation.
Click **Investigate MRR**, then open any **Inspect** citation to view evidence.

The frontend can render without the API, but investigations require the API and
PostgreSQL. If the API reports `DATABASE_URL is required`, load `.env` in its
terminal as shown above. If it cannot connect to PostgreSQL, check
`pnpm db:logs` and confirm the port/credentials in `.env`. Allow PostgreSQL to
become healthy before running migrations; retry them if it is still starting.
Reloading the page clears the in-memory investigation token. All data is synthetic.
See [the database guide](packages/database/README.md) for database details.

Install Chromium before running browser acceptance tests:

```bash
pnpm --filter @executive-bi/web exec playwright install chromium
```

Build web assets with `pnpm --filter @executive-bi/web build`.
Production hosting needs a same-origin reverse proxy; see the
[web contract](docs/architecture/executive-web-contract.md).
