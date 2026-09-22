# Contributing

## Branches and commits

- Start a branch from `main` for a distinct reviewable outcome. Keep working on
  that branch until the outcome is complete; do not create a new branch for
  every small vertical slice.
- Use `feat/<short-name>`, `fix/<short-name>`, or `chore/<short-name>`.
- Make small, coherent Conventional Commits as milestones within the branch.
  Each commit should be understandable and safe to review, but does not need to
  be a separately merged feature.
- Do not rewrite history or overwrite unrelated working-tree changes.

## Efficient contribution loop

1. Define the intended outcome and read only the relevant contract and
   evaluation.
2. Update a contract or evaluation when behavior or acceptance criteria change.
3. Implement coherent increments toward the outcome, including representative
   tests and meaningful failure cases where applicable; commit stable
   milestones regularly.
4. Run targeted checks while iterating; run the repository checks before review.
5. Review the final diff for scope, safety, evidence, and documentation drift.

## Validation

1. Read the narrowest relevant contract and update it only if behavior,
   semantics, safety, or acceptance criteria change.
2. Implement the related increments needed to complete the branch outcome.
3. Add the relevant test; add an evaluation for user-facing or safety-critical
   behavior.
4. Run `pnpm format:check`, `pnpm check`, and `pnpm test`.
5. Remove stale code or documentation, then commit the reviewable outcome or
   milestone.
