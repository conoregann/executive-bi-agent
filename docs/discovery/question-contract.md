# Executive question contract

## Goal

Convert an executive’s natural-language question into a bounded, reviewable investigation request. The agent may infer a safe default only when the interpretation is unambiguous; otherwise it asks a focused clarifying question.

## Implementation status

The current resolver supports a bounded English MRR-decline grammar:
“Why did MRR fall in August 2026?”, ISO months such as `2026-08`, and
“Why did MRR drop last month?”. `monthly recurring revenue` is an alias;
fall, drop, decline, decrease and their supported past forms are accepted.
Matching is case-insensitive. It does not use an LLM, calculate metrics, run SQL,
or execute investigation tools.

`POST /v1/investigations/resolve-question` accepts only `{ "question": "..." }`
with 1–1000 trimmed characters and the existing 16 KiB JSON limit. It returns
`200` with a typed `resolved`, `clarification_required`, or `unsupported` result;
malformed requests return `400`. A resolved result includes original trimmed
wording, `metric: mrr`, a first-of-month `month`, `comparison: previous_period`,
and `responseMode: investigation`. No record or access token is created.

Named months require an explicit year. “Last month” uses the server request-time
UTC calendar, including year rollover. No active-investigation year is inferred.
The resolver does not check data availability; the existing investigation returns
a retained blocked outcome when comparison evidence is missing.

All unmatched wording is rejected without silently dropping constraints. Other
metrics, dimensions, country/plan/customer filters in prose, custom comparisons,
quarters, and general conversational follow-ups remain unsupported. Customer scope stays
in the separate explicit form field. The web interface uses the structured
month/customer form directly and does not expose the optional resolver helper.
The resolver remains available to API clients. Question text is not persisted
as investigation evidence or used as authorization.

### Authenticated conversational follow-up

A completed MRR-decline investigation supports “Break that down by
country” and “Compare Germany with the UK” through the authenticated country-follow-up endpoint, with an optional
single terminal `.`, `!` or `?`, case-insensitive and outer whitespace trimmed.
It executes both months at the parent's exact customer scope. The standalone
question resolver remains for new investigations and does not infer parent
context. The web interface uses a named country action instead of a phrase field.
Additional dates, customer/country filters, other metrics, combined dimensions
and all unmatched wording return `unsupported` without running tools. Requests
needing a changed scope require a new investigation.

The general fields and rules below remain planned beyond this bounded slice.

## Required request fields

| Field           | Description                          | Example                       |
| --------------- | ------------------------------------ | ----------------------------- |
| `question`      | Original user wording                | “Why did MRR fall in August?” |
| `metric`        | Canonical metric identifier          | `mrr`                         |
| `period`        | Closed reporting period              | `2026-08`                     |
| `comparison`    | Baseline or target                   | `previous_period`             |
| `grain`         | Requested output grain               | `month`                       |
| `dimensions`    | Requested breakdowns                 | `region`, `plan`              |
| `scope_filters` | Explicit filters                     | `plan = enterprise`           |
| `response_mode` | Summary, breakdown, or investigation | `investigation`               |

The structured request is internal. The product should show the resolved period, filters, and comparison in the response so a user can catch an incorrect interpretation.

## Defaults and clarification

| Situation                                         | Behavior                                                                   |
| ------------------------------------------------- | -------------------------------------------------------------------------- |
| A month is named without a year                   | Ask for the year unless the active investigation has one unambiguous year. |
| “Last month”                                      | Resolve using the request timestamp and state the resolved month.          |
| No comparison for “change”, “fall”, or “increase” | Use the immediately previous comparable period and state it.               |
| No dimension for “which segment”                  | Ask which segmentation is intended; do not silently choose one.            |
| Unknown metric term                               | Ask for clarification or offer known metric names.                         |
| Request needs inaccessible data                   | Refuse the unavailable portion and explain the available evidence.         |

## Investigation output contract

Every investigation response contains these ordered sections:

1. **Answer** — direct quantified conclusion and resolved scope.
2. **Drivers** — ranked decompositions or comparisons with values.
3. **Context** — supporting CRM, support, or knowledge findings labeled as fact or hypothesis.
4. **Limitations** — missing data, freshness, ambiguity, or correlation caveats.
5. **Evidence** — inspectable metric/query and document references.
6. **Recommended next step** — bounded follow-up, never an autonomous action.

The answer must not assert causality from a time correlation alone.

The Germany/UK phrase executes the retained complete country comparison and shows
both countries within that table; it introduces no country permission filter.
The UI's country actions select a retained row for the bounded account drill-down.
Cross-source questions use dedicated actions specified in the
[cross-source contract](../architecture/cross-source-investigation-contract.md).
They do not add general conversational resolution or scope inference.
