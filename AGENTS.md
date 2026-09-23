# AGENTS.md — Executive BI Agent

Behavioral guidelines, non-negotiable system invariants, and project execution standards.

**Tradeoff:** These guidelines bias toward caution and correctness over speed. For trivial tasks, use judgment.

---

## 1. Core Operating Rules

### 1. Think Before Coding
**Don’t assume. Don’t hide confusion. Surface tradeoffs.**
- Read the governing contracts (`packages/schemas`, `docs/SPEC.md`), affected code, and tests before editing.
- State your assumptions explicitly. If an architectural or modeling choice is open, ask before building.
- If multiple interpretations exist, present them—do not pick silently.
- If a simpler approach exists, say so. Push back when warranted.

### 2. Simplicity First
**Minimum code that solves the problem. Nothing speculative.**
- Build only what was asked. No speculative abstractions or unrequested configurability.
- Do not introduce new dependencies, vector stores, or infrastructure until an active feature strictly requires them.
- *Senior engineer test:* If you write 200 lines and it could be 50, rewrite it.

### 3. Surgical Changes
**Touch only what you must. Clean up only your own mess.**
- Do not "improve" adjacent code, comments, or formatting. Match existing style.
- Do not refactor components that are not broken.
- When your changes orphan imports, variables, or functions, remove them. Leave pre-existing dead code untouched (mention it instead).
- Every changed line must trace directly to the requested feature.

### 4. Goal-Driven Execution
**Define success criteria. Loop until verified.**
- Convert tasks into verifiable goals before modifying implementation:
  - *"Fix metric query"* $\to$ write a test reproducing the discrepancy, then make it pass.
  - *"Add API endpoint"* $\to$ write a contract/schema test first, then implement.
- For multi-step tasks, state a brief plan:
  ```
  1. [Step] → verify: [check]
  2. [Step] → verify: [check]
  3. [Step] → verify: [check]
  ```

---

## 2. Project Overview & Layout Boundaries

This repository is a production-style Executive BI Agent for a fictional B2B SaaS company ($28.9M ARR). It investigates business questions across structured metrics and unstructured knowledge using deterministic semantic metrics, knowledge RAG, and safe exploratory text-to-SQL.

Canonical system specs and data schemas live in **`docs/SPEC.md`**.

| Path | Responsibility | Invariant |
| :--- | :--- | :--- |
| `apps/web` | Next.js 15 UI, Recharts rendering | Consumes NestJS API only. No direct DB or model access. |
| `apps/api` | NestJS API, investigation orchestration | Enforces auth, rate limits, and structured response validation. |
| `apps/worker` | BullMQ async jobs | Ingestion, heavy queries, and long-running investigations. |
| `packages/metrics` | Semantic metric catalog & query compiler | **Deterministic pure logic only.** No LLM inference inside metric math. |
| `packages/database` | PostgreSQL client, migrations, seeds | Strict separation of raw, staging, and analytics schemas. |
| `packages/retrieval`| Knowledge ingestion, pgvector search | Hybrid search over internal documents with strict metadata filtering. |
| `packages/ai` | Model adapters, prompts, tool contracts | Provider-independent structured outputs using shared Zod schemas. |
| `packages/schemas` | Shared typed contracts (Zod) | Single source of truth across web, API, worker, and packages. |
| `evals/` | Automated benchmark suite (100 cases) | Tests metric correctness, SQL safety, and groundedness. |
| `data/` | Synthetic data generators & seeds | Strictly synthetic data. No real PII or customer data. |
| `docs/` | Canonical specifications (`SPEC.md`) and ADRs | Concise documentation only. No duplicated code walkthroughs. |

---

## 3. Non-Negotiable Domain & Security Invariants

These rules override speed and convenience. Never bypass them:

1. **Deterministic Metrics Only:** Metrics (`mrr`, `arr`, `customer_churn_rate`, `mrr_churn_rate`, `nrr`, `cac`, `ltv`, `trial_conversion_rate`) are centrally defined in `packages/metrics`. **Never let an LLM infer or calculate metric values in prompt text.**
2. **Treat Generated SQL as Hostile Input:**
   - Execute strictly via a dedicated PostgreSQL read-only database role.
   - Run an AST check (using `pgsql-ast-parser` or equivalent) to hard-reject `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, `CREATE`, `GRANT`, `REVOKE`, or multiple statements.
   - Restrict execution to `staging.*` and `analytics.*` tables. Reject queries targeting `raw.*` or system catalogs.
   - Force statement timeouts (max 5s) and row limits (max 500 rows).
3. **Inspectable Citations:** Every material numerical claim must link to a structured `query_id`; every contextual claim must link to a retrieved `document_id`. Clearly distinguish observed facts, calculated deltas, hypotheses, and correlations.
4. **Tool-First Execution:** Direct the model to typed tools (`getMetric`, `compareMetric`, `decomposeMetricMovement`, `searchCompanyKnowledge`) before allowing fallback to exploratory SQL generation.
5. **Synthetic Data Labeling:** All fixtures, seeds, and test databases must be explicitly labeled `synthetic`.

---

## 4. Build, Test & Verification Commands

Always run targeted checks during implementation and full repository validation before completing work:

```bash
# Type checking
pnpm check

# Unit and integration testing
pnpm test

# Targeted test for active work
pnpm test:targeted <path/to/test>

# Linting and formatting
pnpm format:check

# Hygiene check
git diff --check
```

---

## 5. Feature Delivery, Branches & Commits

Work in complete feature scopes, using substantial branches and regular checkpoint commits for version control:

- **Substantial Feature Branches:**
  - Branch off `main` using `feat/<feature-name>`, `fix/<issue-name>`, or `chore/<task-name>`.
  - Scope branches to an **entire substantial feature or capability** (e.g., `feat/mrr-decomposition-tool`, `feat/knowledge-retrieval-pipeline`, `feat/sql-safety-ast-layer`).
  - Do not create micro-branches for individual files, prompts, or task list items. Keep the branch open across work sessions until the complete feature is fully implemented and tested.
- **Regular Commits for Version Control:**
  - Make frequent, atomic Conventional Commits within the branch (`feat: ...`, `test: ...`, `fix: ...`, `refactor: ...`).
  - Use commits as safe recovery points, rollback markers, and clear changelog entries as you progress through the feature.
- **Complete Features:**
  - A feature is only complete when its contract, business logic, edge-case handling, and automated tests are fully in place.
- **History Preservation:**
  - Never force-push or rewrite git history on shared branches. Preserve unrelated working tree changes.

---

## 6. Definition of Done

A task or feature branch is ready for review and merge only when:
- [ ] The feature is completely implemented according to `docs/SPEC.md`.
- [ ] Metric calculations and SQL execution strictly follow security invariants.
- [ ] Targeted tests pass and cover both happy paths and edge/failure cases.
- [ ] Repository checks pass cleanly: `pnpm check`, `pnpm test`, `pnpm format:check`.
- [ ] Diff is minimal, surgical, free of orphaned code, and verified with `git diff --check`.
- [ ] The final response summarizes the changes made, tests verified, and any newly exposed endpoints or tools.