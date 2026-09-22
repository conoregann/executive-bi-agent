# Agent skill guidance

These are project conventions for recurring agent tasks. They are not executable skills and should remain concise.

## Documentation-first skill

Use when defining product behavior, metrics, architecture, tools, or evaluation cases.

- Start from the smallest decision that needs to be made.
- Record definitions, assumptions, ownership, examples, and non-goals.
- Prefer tables and precise examples over aspirational prose.
- Link related contracts rather than copying them.

## Analytics implementation skill

Use when implementing metrics, queries, data models, or connectors.

- Preserve source-to-model lineage.
- Make grain and time semantics explicit.
- Keep raw, staging, and analytics concerns separate.
- Validate inputs and outputs at boundaries.
- Make queries inspectable and safe by default.

## Investigation-agent skill

Use when implementing orchestration, retrieval, or answer generation.

- Plan before executing.
- Use controlled tools before exploratory text-to-SQL.
- Return evidence objects alongside conclusions.
- Never present correlation as causation without qualification.
- Fail closed on missing permissions, unsafe queries, or insufficient evidence.

## Evaluation skill

Use whenever behavior changes.

- Add a happy path, an ambiguity case, and a safety or evidence failure case.
- Prefer fixture-backed, deterministic tests before model-based scoring.
- Track correctness, groundedness, latency, cost, and refusal quality as separate concerns.
