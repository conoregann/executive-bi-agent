# AGENTS.md

## Mission

Build a production-style Executive BI Agent for a fictional B2B SaaS company. The system must answer business questions with trusted metrics, controlled data access, relevant company knowledge, explicit evidence, and useful next actions.

The repository is intentionally contract-first. Before adding runtime complexity, make the business language, system boundaries, and evaluation expectations inspectable in Markdown.

## Find the right context

- Read `Brief.md`, the nearest `AGENTS.md`, and only the contract or evaluation
  that governs the change. Do not load or restate unrelated documentation.
- Use `docs/` for durable product and architecture decisions; use `evals/` for
  executable acceptance cases. Link instead of duplicating definitions.
- Keep deployable code in `apps/`, shared capabilities in `packages/`, and
  synthetic fixtures in `data/`.

## Delivery model

- Work on the current feature branch until its defined outcome is complete.
  Create a new branch only for isolation, a separate release, or an independent
  reviewable outcome—not for every small slice.
- Use small, coherent commits as checkpoints inside a branch. A branch may
  contain several related vertical slices when they deliver one capability.
- Prefer the narrowest end-to-end behavior over speculative scaffolding. Do not
  add providers, infrastructure, vector databases, or model dependencies until
  a concrete path needs them.

## Implementation rules

- Define semantic metrics centrally; never infer revenue, MRR, churn, CAC, LTV,
  retention, or conversion from model text.
- Treat generated SQL as untrusted: use approved schemas, read-only access,
  validation, timeouts, and row limits.
- Keep structured analytics and knowledge retrieval separate. Join them through
  evidence, and expose source, scope, freshness, and strength for material
  claims.
- Prefer typed, deterministic tools and schemas. State uncertainty, missing
  evidence, and correlation plainly.
- Label all fixtures as synthetic. Never imply access to real company systems.

## Efficient work loop

1. Identify the outcome, boundary, and smallest relevant contract.
2. Update a contract or evaluation only when behavior, semantics, or acceptance
   criteria change; avoid documentation-only churn.
3. Implement and test the smallest complete increment, including a meaningful
   failure or evidence case when applicable.
4. Run the narrowest relevant checks first, then `pnpm format:check`,
   `pnpm check`, and `pnpm test` before handoff when available.
5. Review the diff for scope, permissions, evidence, and misleading claims.
6. Commit meaningful milestones with Conventional Commits. Preserve unrelated
   working-tree changes and never rewrite history without explicit approval.

## Definition of done

A change is complete when its outcome, behavior, validation, and limitations
are clear; relevant checks pass (or an environmental blocker is recorded); and
the diff is ready for review.
