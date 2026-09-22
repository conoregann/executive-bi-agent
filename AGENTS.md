# Executive BI Agent Guide

## Operating posture

Think before changing code: read the affected interface, implementation, tests,
and only the contract that governs the behavior. State an assumption when the
request leaves a material architectural choice open.

Deliver a secure, testable, outcome-sized body of work. Prefer direct
implementation, simplification, and deletion over speculative layers,
scaffolding, or prose. A branch may contain several related increments when
together they complete a meaningful business capability; do not split work
into tiny branches solely to make slices small. Do not add unrelated work,
refactor broadly, or introduce dependencies without a concrete need.

Documentation is a tool, not a gate. Update it only when a durable public
contract, metric meaning, safety boundary, architecture decision, or acceptance
criterion changes. Keep it short, link to the canonical source, and remove
stale or duplicated guidance. Do not create documentation-only work to precede
an otherwise clear implementation.

## Non-negotiable system rules

- Metrics are centrally defined and deterministic. Never infer MRR, revenue,
  churn, CAC, LTV, retention, or conversion from model text.
- Treat generated SQL as hostile input: approved schemas only, read-only
  access, validation, timeout, and row limit. Never execute a write statement.
- Keep structured analytics and knowledge retrieval separate; connect them
  through inspectable evidence.
- Material claims need source, scope, freshness, and integrity. Label missing,
  stale, conflicting, or correlational evidence plainly.
- All fixtures and synthetic data must be labeled synthetic. Do not imply
  access to real customer systems or data.
- Prefer typed, bounded, deterministic tools to unrestricted model behavior.
- Add or update a targeted test whenever behavior, an invariant, or a safety
  rule changes. Add an evaluation when user-facing investigation behavior
  changes.
- Do not introduce infrastructure, providers, vector stores, or model
  dependencies until a completed slice requires them.

## Layout boundaries

| Path        | Responsibility                                                                |
| ----------- | ----------------------------------------------------------------------------- |
| `apps/`     | Deployable web, API, and worker surfaces.                                     |
| `packages/` | Shared domain capabilities and typed contracts.                               |
| `data/`     | Synthetic source data and seeds only.                                         |
| `evals/`    | Repeatable acceptance cases for user-facing or safety-critical behavior.      |
| `docs/`     | Concise canonical contracts and decisions; no duplicate implementation notes. |
| `infra/`    | Infrastructure only when a shipped slice needs it.                            |

## Delivery loop

1. Identify the requested outcome and the narrowest governing contract.
2. Update that contract only if the requested change alters it.
3. Implement coherent increments toward the outcome, including relevant
   failure paths; commit each stable milestone with a Conventional Commit.
4. Run targeted checks while iterating, then `pnpm format:check`, `pnpm check`,
   and `pnpm test` before handoff when available.
5. Review the diff for scope, correctness, security, evidence, and stale code
   or prose that can be removed.
6. Commit a coherent, independently reviewable change using Conventional
   Commits.

## Git and handoff

- Base work on `main`; use `feat/<short-name>`, `fix/<short-name>`, or
  `chore/<short-name>` branches.
- Keep a branch open until its defined outcome is complete. Use regular,
  reviewable commits to record progress; commits are milestones, not a reason
  to create a new branch.
- Preserve unrelated working-tree changes. Never rewrite history or discard
  work without explicit approval.
- Before handoff, run `git diff --check`, report relevant validation, and name
  any environmental blocker.

## Definition of done

A change is done when the requested outcome works, relevant invariants and
safety boundaries hold, focused and repository validation pass, and the diff
is appropriately scoped, clear, and ready to merge.
