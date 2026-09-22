# Executive question contract

## Goal

Convert an executive’s natural-language question into a bounded, reviewable investigation request. The agent may infer a safe default only when the interpretation is unambiguous; otherwise it asks a focused clarifying question.

## Required request fields

| Field | Description | Example |
| --- | --- | --- |
| `question` | Original user wording | “Why did MRR fall in August?” |
| `metric` | Canonical metric identifier | `mrr` |
| `period` | Closed reporting period | `2026-08` |
| `comparison` | Baseline or target | `previous_period` |
| `grain` | Requested output grain | `month` |
| `dimensions` | Requested breakdowns | `region`, `plan` |
| `scope_filters` | Explicit filters | `plan = enterprise` |
| `response_mode` | Summary, breakdown, or investigation | `investigation` |

The structured request is internal. The product should show the resolved period, filters, and comparison in the response so a user can catch an incorrect interpretation.

## Defaults and clarification

| Situation | Behavior |
| --- | --- |
| A month is named without a year | Ask for the year unless the active investigation has one unambiguous year. |
| “Last month” | Resolve using the request timestamp and state the resolved month. |
| No comparison for “change”, “fall”, or “increase” | Use the immediately previous comparable period and state it. |
| No dimension for “which segment” | Ask which segmentation is intended; do not silently choose one. |
| Unknown metric term | Ask for clarification or offer known metric names. |
| Request needs inaccessible data | Refuse the unavailable portion and explain the available evidence. |

## Investigation output contract

Every investigation response contains these ordered sections:

1. **Answer** — direct quantified conclusion and resolved scope.
2. **Drivers** — ranked decompositions or comparisons with values.
3. **Context** — supporting CRM, support, or knowledge findings labeled as fact or hypothesis.
4. **Limitations** — missing data, freshness, ambiguity, or correlation caveats.
5. **Evidence** — inspectable metric/query and document references.
6. **Recommended next step** — bounded follow-up, never an autonomous action.

The answer must not assert causality from a time correlation alone.
