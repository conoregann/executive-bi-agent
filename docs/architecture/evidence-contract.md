# Evidence contract

## Principle

Every material statement in an executive answer must be traceable to one or more evidence items. Evidence is immutable for the duration of an investigation and is stored separately from generated prose.

## Evidence item

| Field | Requirement |
| --- | --- |
| `evidence_id` | Immutable, opaque identifier. |
| `type` | `metric_query`, `record`, `document_chunk`, or `calculation`. |
| `source` | Human-readable system or dataset name. |
| `source_ref` | Query, record, document, or chunk identifier. |
| `observed_at` | When the source fact occurred, if applicable. |
| `retrieved_at` | When this item was retrieved. |
| `scope` | Period, filters, permissions, and grain used. |
| `content` | Minimal supporting values or excerpt; no unrelated sensitive content. |
| `freshness` | Source freshness timestamp and expectation. |
| `integrity` | `valid`, `warning`, or `invalid`. |

`calculation` evidence names its input evidence IDs and formula. It may not hide a transformation inside generated narrative.

## Claim classes

| Class | Example | Required support |
| --- | --- | --- |
| Observed metric fact | “August MRR was €1.2m.” | Valid metric query. |
| Derived comparison | “MRR fell 8.4% month over month.” | Two metric values plus calculation evidence. |
| Driver | “Enterprise churn accounted for 61% of the decrease.” | Reconciled movement data plus calculation evidence. |
| Context | “A payment incident occurred August 14–16.” | Dated incident record or document chunk. |
| Hypothesis | “The incident may have contributed to conversion decline.” | Relevant facts plus explicit uncertainty; never causal wording. |
| Recommendation | “Review the 12 affected accounts.” | Evidence-backed scope and a human owner. |

## Evidence strength

| Strength | Meaning |
| --- | --- |
| `high` | Direct, valid, fresh, and reconciled evidence supports the claim. |
| `medium` | Relevant direct evidence exists but has material coverage, freshness, or reconciliation caveats. |
| `low` | Indirect or correlational evidence only; present as a hypothesis. |
| `insufficient` | No defensible claim may be made. |

Strength is assessed per claim, not per answer. A metric result with incomplete dimensions can be high confidence for the total and medium confidence for the breakdown.

## Citation display

Each answer shows compact citations near the statement they support. A citation opens a detail view containing the source reference, resolved scope, freshness, and values or excerpt. Sensitive record fields must be redacted according to the active permission scope before display.

## Invalid evidence

Do not use evidence when it is outside the permitted scope, fails integrity checks, is for the wrong period/grain, or has an unresolved reconciliation error. The response should say that evidence was unavailable rather than disclose why a protected source cannot be read.
