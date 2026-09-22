# Agent workspace guidance

This directory contains project-specific guidance for agent-assisted work. It complements the root `AGENTS.md`; it does not replace it.

## How to use this guidance

- Apply the narrowest relevant instruction file for the task.
- Treat `Brief.md` and `docs/` as the product and architecture source of truth.
- Keep guidance procedural and stable. Put changing product facts in project documentation instead.
- If instructions conflict, the root `AGENTS.md` and direct user request take precedence.

## Prompt engineering rules

- State the user question, time range, grain, dimensions, and expected output explicitly.
- Make tool inputs typed and bounded; avoid prompts that ask a model to "figure out" unrestricted database access.
- Require uncertainty and missing evidence to be stated plainly.
- Distinguish observed facts, calculated results, hypotheses, and recommendations.
- Include adversarial cases in evaluations: ambiguous time periods, unavailable data, conflicting sources, permission failures, and unsafe SQL.

## Change discipline

Use one focused branch and one coherent commit series per slice. Update the corresponding contract or evaluation before expanding implementation scope.
