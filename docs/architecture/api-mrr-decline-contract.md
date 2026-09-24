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
  "permittedCustomerIds": ["cust_churn"]
}
```

`investigationId` is an opaque identifier, `month` is a first-of-month UTC
calendar value, and `permittedCustomerIds` is optional but non-empty when
provided. Unknown fields are rejected before the investigation runs.

Successful responses return the immutable investigation record, its ordered
five-step plan, evidence IDs, drivers, and warnings. A completed investigation
returns `201`; an evidence-blocked investigation returns `422`; invalid input
returns a contract-valid `400`; and a reused investigation ID returns `409`.

The boundary preserves the investigation contract: it never calculates metrics
outside `packages/metrics`, broadens document scope, exposes raw synthetic
records, or turns contextual documents into causal claims.
