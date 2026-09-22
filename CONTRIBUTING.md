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
3. Implement the smallest complete increment, including a representative test
   and a meaningful failure case where applicable.
4. Run targeted checks while iterating; run the repository checks before review.
5. Review the final diff for scope, safety, evidence, and documentation drift.

## Validation

Run these before handoff when dependencies are available:

```bash
pnpm format:check
pnpm check
pnpm test
```

Record any environmental blocker rather than claiming an unchecked change is
validated.
