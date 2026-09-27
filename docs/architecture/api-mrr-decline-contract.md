# MRR-decline API contract

## Scope

The development API exposes one integration boundary over the deterministic
MRR, company-knowledge, and MRR-decline investigation services. It reads the local synthetic PostgreSQL analytics views and labeled knowledge
fixtures in `data/synthetic`; it is not a production data-source adapter.

## Question resolution

`POST /v1/investigations/resolve-question` resolves bounded MRR-decline wording
without running tools or reserving an investigation. See the
[question contract](../discovery/question-contract.md) for inputs, typed outcomes,
UTC date rules and unsupported scope. Resolved months feed the endpoint below;
customer permissions remain explicit structured input.

## Endpoint

`POST /v1/investigations/mrr-decline` requires `application/json` and accepts:

```json
{
  "investigationId": "august-decline",
  "month": "2026-08-01",
  "permittedCustomerIds": ["cust_acme"]
}
```

`investigationId` is an opaque identifier, `month` is a first-of-month UTC
calendar value, and `permittedCustomerIds` is optional but must contain 1–50
unique IDs when provided. Unknown fields are rejected before the investigation
runs.

Successful responses return the immutable investigation record, its ordered
five-step plan, evidence IDs, drivers, warnings, and a one-time 43-character
bearer access token. Store the token securely: it is not recoverable from the
server. A completed investigation
returns `201`; an evidence-blocked investigation returns `422`; invalid input
returns a contract-valid `400`; and a reused investigation ID returns `409`.

The local API requires `DATABASE_URL` pointing to a PostgreSQL database with
`infra/postgres/init/02-investigations.sql` applied. `pnpm db:migrate` applies
the additive migration to an existing local volume. The app stores the plan
before any tools run, then atomically stores the terminal record and full
evidence items. A reserved but non-terminal ID cannot be reused or read.

Read routes require `Authorization: Bearer <accessToken>`:

- `GET /v1/investigations/:investigationId` returns the terminal record.
- `GET /v1/investigations/:investigationId/answer` returns the cited executive
  answer for completed investigations, or `422` when required evidence is
  insufficient. See the [answer contract](investigation-answer-contract.md).
- `GET /v1/investigations/:investigationId/evidence/:evidenceId` returns one
  source-backed evidence item, including scope, freshness, integrity and
  supporting values or excerpt.
- `POST /v1/investigations/:investigationId/follow-up-context` accepts JSON
  `{ "month": "2026-08-01", "permittedCustomerIds": ["cust_acme"] }` and
  returns the completed record only when month and customer scope exactly
  match the stored request. It does not run tools.

### Executable country follow-ups

`POST /v1/investigations/:investigationId/country-follow-ups` authenticates with
the completed MRR-decline parent's bearer token and accepts exactly one input
mode, plus a new opaque child `investigationId`:

```json
{
  "investigationId": "august-countries",
  "action": "breakdown_mrr_by_country"
}
```

Alternatively, provide `question: "Break that down by country"` instead of
`action`. Matching is case-insensitive, trims outer whitespace and permits one
terminal period, exclamation mark or question mark. Unmatched wording returns
`422 unsupported`; no constraints are discarded. Unknown fields or both/neither
input modes return `400 invalid_request`. No caller-provided month or scope is
accepted. Authentication failures use the existing `401`/`404` outcomes.
Non-completed parents, child parents or insufficient parent evidence return
`422 invalid_parent`. Reused child IDs return `409 conflict`.

Success returns `201 completed`, or `422 blocked`, with `record`, `accessToken`
and `warnings`, validated by `countryFollowUpResponseSchema`. The child record
includes `parentInvestigationId`, kind `mrr_country_follow_up`, inherited scope,
its two-step plan, evidence IDs, warnings and terminal state. Existing record,
answer and evidence GET routes accept the child's token. Parent and child tokens
are not interchangeable. Records use the existing JSON persistence table; no
migration is required.

Missing tokens return `401`; unknown IDs, missing evidence, and invalid tokens
return indistinguishable `404` responses. Scope mismatch returns `403` only
after valid token authentication. JSON request bodies are limited to 16 KiB.

The boundary preserves the investigation contract: it never calculates metrics
outside `packages/metrics`, broadens document scope, exposes raw synthetic
records, or turns contextual documents into causal claims.

The running API requires `ANALYTICS_DATABASE_URL` using the dedicated
`executive_bi_analytics` role, separate from writable `DATABASE_URL` persistence.
This local synthetic role can select only the two approved analytics views,
defaults to read-only transactions, and has a five-second statement timeout.
Run `pnpm db:migrate` for an existing volume. Analytics tool failures produce a retained blocked investigation (`422`);
persistence failures return a sanitized `503`. There is no JSON metric fallback. Retained evidence
remains readable independently of the analytics connection.
