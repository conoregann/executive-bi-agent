# Cross-source revenue investigation

This synthetic capability extends a completed MRR investigation or customer
contribution drill-down. Required MRR comparison and reconciliation are validated
from retained evidence before contextual tools run. No new metric, generated SQL,
account-health score, or causal conclusion is exposed.

`POST /v1/investigations/:id/cross-source-follow-ups` requires the parent's bearer
token and a new `investigationId`. Its strict `question` accepts:

- `Investigate revenue losses across sources`
- `Did those accounts have support escalations or declining usage?`
- `What evidence supports a pricing-related explanation?`

Month and permissions inherit exactly. Operational customer scope narrows to the
retained largest losses, at most five. Other questions and scope overrides are
rejected before tools; changed scope requires a new investigation. Cross-source
children cannot parent further investigations. Each child has its own token,
plan, terminal record and self-contained immutable parent evidence snapshot.
Authenticated record, answer and evidence reads survive restart without source
queries or model execution. The parent is unchanged.

Operational records are explicitly synthetic. A reproducible generator covers
June–August 2026 for the stable subscription customer IDs. Source grain is one
CRM event, support event or monthly usage summary per record ID. Money remains
in the metric package; usage counts are source observations. Fixed PostgreSQL
queries read `analytics.operational_records`, derived through staging from raw
records, using the existing dedicated read-only connection, its five-second
statement timeout, bound customer/date parameters and a 500-row ceiling. Invalid
or truncated results are unavailable, without fixture fallback. Missing records
mean missing coverage, not evidence that no event occurred.

The optional OpenAI Responses adapter uses structured outputs with `store:false`.
Set both `OPENAI_API_KEY` and `OPENAI_INVESTIGATION_MODEL` to enable it; otherwise
approved deterministic source selection remains usable and is labelled disabled.
An injected adapter supports deterministic tests. The model proposes only source
names and hypothesis categories with evidence references. The application checks
unique tools against question-specific approvals, caps contextual tools at four
(including knowledge), and enforces a thirty-second contextual deadline. No model
selects customers, dates, SQL, numerical values or permissions. Approved plans are
reserved before source execution. Malformed or failed planning retains a blocked
child; failed synthesis retains observed evidence with an explicit limitation.

Synthesis accepts only tentative pricing, support or usage hypotheses backed by
matching operational facts. Unknown citations, stale evidence and unsupported
categories are rejected. Numerical observations and documents are displayed from
structured source results and cited excerpts. Retrieved content is untrusted
input. Coverage, freshness, conflicts and unconfirmed causality remain visible,
even when the model omits them. Missing contextual evidence does not replace or
block valid retained metrics.

The synthetic counterexamples include declining usage without churn, churn with
no retrieved support history, a stale CRM/usage source, missing account events,
and budget-freeze CRM context conflicting with a pricing narrative. The dataset
is intentionally small; it is not the full fictional company's account history.
