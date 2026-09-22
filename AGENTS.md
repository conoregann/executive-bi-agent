# AGENTS.md

## Mission

Build a production-style Executive BI Agent for a fictional B2B SaaS company. The system must answer business questions with trusted metrics, controlled data access, relevant company knowledge, explicit evidence, and useful next actions.

The repository is intentionally contract-first. Before adding runtime complexity, make the business language, system boundaries, and evaluation expectations inspectable in Markdown.

## Repository map

- `Brief.md` — product brief and intended capability surface.
- `docs/` — durable project contracts and decisions.
- `apps/` — deployable applications: web, API, and worker.
- `packages/` — shared domain capabilities and contracts.
- `data/` — synthetic source data and seeds only.
- `evals/` — repeatable quality cases for metrics, SQL, retrieval, and investigations.
- `infra/` — infrastructure definitions when justified.
- `.agents/` — scoped operating guidance for agent work.

## Operating principles

1. Read the relevant Markdown contract before changing code or data.
2. Prefer a small vertical slice over scaffolding broad abstractions.
3. Define semantic metrics centrally; never let a model invent definitions for revenue, MRR, churn, CAC, LTV, retention, or conversion.
4. Treat generated SQL as untrusted input. Enforce read-only access, approved schemas, timeouts, row limits, and validation before execution.
5. Separate structured analytics from company-knowledge retrieval, then join them through inspectable evidence.
6. Every material answer should expose its source, query or document reference, freshness, and evidence strength where applicable.
7. Synthetic data must be clearly labeled and must not imply access to real company systems.
8. Prefer deterministic tools and schemas over free-form agent behavior.
9. Add or update an evaluation with each meaningful capability.
10. Do not add infrastructure, providers, vector databases, or model dependencies until a concrete slice needs them.

## Standard work loop

1. Update the relevant contract in `docs/` or `evals/`.
2. Implement the narrowest end-to-end behavior.
3. Add representative tests or evaluation cases, including failure cases.
4. Run `pnpm format:check`, `pnpm check`, and `pnpm test` when dependencies are available.
5. Review the diff for scope, evidence handling, permissions, and misleading claims.
6. Commit one coherent change using Conventional Commits.

## Git conventions

- Base work on `main`.
- Use `feat/<short-name>`, `fix/<short-name>`, or `chore/<short-name>` branches.
- Keep commits small and independently understandable.
- Examples: `docs(metrics): define mrr contract`, `feat(analytics): add revenue breakdown`, `fix(sql): reject write statements`.
- Do not rewrite history or discard unrelated work.

## Definition of done

A change is complete when its contract, implementation, validation, and limitations are clear; relevant checks pass or their environmental blocker is recorded; and the diff is ready for review.
