# Contributing

## Branches and commits

- Start one branch from `main` for a distinct reviewable outcome. Keep working
  on that branch across sessions until the outcome is complete; do not create a
  new branch for a prompt, task list item, commit, or small vertical slice.
- Use `feat/<short-name>`, `fix/<short-name>`, or `chore/<short-name>`.
- Make coherent Conventional Commits as useful checkpoints within the branch.
  Commits should be understandable and safe to review, but do not need to be
  separately merged features. Commit when a change is stable, recoverable, or
  useful to review—not merely because a subtask ended.
- Start a new branch only when the work is a separate outcome, needs isolated
  experimentation, or must be released or reviewed independently.
- Do not rewrite history or overwrite unrelated working-tree changes.

## Efficient contribution loop

1. Define the intended outcome and read only the relevant contract and
   evaluation.
2. Update a contract or evaluation when behavior or acceptance criteria change.
3. Implement coherent increments toward the outcome, including representative
   tests and meaningful failure cases where applicable; commit stable
   checkpoints regularly while staying on the same branch.
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
   next stable checkpoint. Keep the branch open if the defined outcome still
   has required work remaining.
