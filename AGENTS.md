# AGENTS.md — Executive BI Agent

## Working rules

Proceed on clear user intent and carry authorized work through verified acceptance
criteria. Choose ordinary reversible implementation details independently. Ask
only when a material product, data-model, security, or architecture decision
blocks progress; explain the decision and continue independent work. State useful
assumptions and surface consequential alternatives before implementing them.

- Read the affected code, tests, shared schemas, and governing contract before
  editing. [Spec.md](Spec.md) separates current scope from intended architecture;
  [docs](docs/README.md) indexes focused contracts. Root rules apply everywhere;
  nested `AGENTS.md` files add local requirements.
- Prefer the simplest design that satisfies the request. No speculative
  abstractions, single-use frameworks, unrequested configurability, dependencies,
  or infrastructure. Push back when a simpler approach meets the goal.
- Make surgical changes, match existing style, and preserve user changes. Remove
  only dead code caused by your edits; mention unrelated issues without fixing
  them. Every changed line should support the requested capability.
- Define observable acceptance criteria before implementation. For a bug,
  reproduce the failure; for a public boundary, establish contract tests. Use a
  brief plan for multi-step work, with each step tied to verification. Skip
  ceremony for trivial changes.
- Preserve readable design, typed boundaries, useful failure outcomes, and
  accessible, understandable product behavior. Update durable contracts when
  their behavior changes; do not document routine implementation details.

## Capability delivery

Deliver small, complete, independently reviewable user-visible or operational
capabilities. Split large goals into useful vertical slices with explicit
acceptance criteria, contracts, behavior, failure handling, tests, and relevant
evaluations. A slice may expose a narrower supported scope; label remaining work
as planned and do not leave its promised path incomplete.

Use `feat/<capability>`, `fix/<issue>`, or `chore/<task>` branches from `main` for
new work. Inspect the current branch and working tree first; reuse a suitable
branch when continuing its capability. Keep a capability together across files
and sessions. Avoid file-level micro-branches and oversized roadmap branches;
separate independently reviewable slices when they can stand on their own.

Use atomic Conventional Commits as meaningful review or recovery checkpoints,
including before risky transitions. No commit quota: activity is not progress.
Open a PR when the slice satisfies its acceptance criteria; describe behavior,
validation, limitations, and deferred scope so it can be reviewed independently.
Never force-push or rewrite shared history. Preserve unrelated changes in commits
and PRs as well as in the working tree.

Progress means completed capabilities and verified acceptance criteria, not LOC,
commit counts, branch counts, or time spent.

## Non-Negotiable Domain & Security Invariants

These rules override speed and convenience. Never bypass them:

1. **Deterministic Metrics Only:** Metrics (`mrr`, `arr`, `customer_churn_rate`, `mrr_churn_rate`, `nrr`, `cac`, `ltv`, `trial_conversion_rate`) must be centrally defined and implemented in `packages/metrics` before exposure; the current executable scope is MRR. **Never let an LLM infer or calculate metric values in prompt text.**
2. **Treat Generated SQL as Hostile Input:**
   - Execute strictly via a dedicated PostgreSQL read-only database role.
   - Run an AST check (using `pgsql-ast-parser` or equivalent) to hard-reject `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, `CREATE`, `GRANT`, `REVOKE`, or multiple statements.
   - Restrict execution to `staging.*` and `analytics.*` tables. Reject queries targeting `raw.*` or system catalogs.
   - Force statement timeouts (max 5s) and row limits (max 500 rows).
3. **Inspectable Citations:** Every material numerical claim must link to a structured `query_id`; every contextual claim must link to a retrieved `document_id`. Clearly distinguish observed facts, calculated deltas, hypotheses, and correlations.
4. **Tool-First Execution:** Direct the model to typed tools (current MRR operations and scoped company-knowledge search) before allowing fallback to exploratory SQL generation.
5. **Privacy and Scope:** Preserve explicit customer permissions, confidential-document boundaries, immutable provenance, and bounded follow-up scope. Never broaden scope to fill missing evidence or imply causality from correlation.
6. **Synthetic Data Labeling:** All fixtures, seeds, and test databases must be explicitly labeled `synthetic`.

## Verification and completion

Right-size checks to the changed boundary and risk; never reduce safeguards to
save time. Run focused tests while implementing, including relevant happy paths,
edge cases, failures, evidence integrity, and permission isolation. Update
appropriate evaluations for new durable behavior or safety rules.

- Runtime changes: run affected package checks/tests first, then `pnpm check`,
  `pnpm test`, and `pnpm format:check` before marking the capability ready.
  Public contracts, cross-package changes, metrics, and security boundaries need
  coverage of affected consumers and integrations.
- Schema or seed changes: also run `pnpm db:verify` per local guides. Live
  PostgreSQL integration tests require `DATABASE_URL`; report skips explicitly.
- Documentation-only changes: run Prettier on changed Markdown, check local links
  and paths against the repository, and run `git diff --check`. Do not run
  application tests unless executable behavior or fixtures changed.
- Use existing package scripts for targeted checks, for example
  `pnpm --filter @executive-bi/metrics test`; there is no `test:targeted` script.
  Do not rerun passing checks without a new change or unresolved concern.

Before completion, review the diff for scope, contradictions, orphaned code, and
unsupported claims. Report what changed, acceptance criteria verified, exact
checks and results, skips or blockers, and new endpoints/tools if any. Never
claim an unrun check passed or treat a planned guarantee as implemented.
