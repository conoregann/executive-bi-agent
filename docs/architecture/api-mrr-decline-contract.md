# MRR-decline API contract

## Scope

The development API exposes one integration boundary over the deterministic
MRR, company-knowledge, and MRR-decline investigation services. It loads only
the explicitly labeled synthetic fixtures in `data/synthetic`; it is not a
production data-source adapter.

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
- `GET /v1/investigations/:investigationId/evidence/:evidenceId` returns one
  source-backed evidence item, including scope, freshness, integrity and
  supporting values or excerpt.
- `POST /v1/investigations/:investigationId/follow-up-context` accepts JSON
  `{ "month": "2026-08-01", "permittedCustomerIds": ["cust_acme"] }` and
  returns the completed record only when month and customer scope exactly
  match the stored request. It does not run tools.

Missing tokens return `401`; unknown IDs, missing evidence, and invalid tokens
return indistinguishable `404` responses. Scope mismatch returns `403` only
after valid token authentication. JSON request bodies are limited to 16 KiB.

The boundary preserves the investigation contract: it never calculates metrics
outside `packages/metrics`, broadens document scope, exposes raw synthetic
records, or turns contextual documents into causal claims.
