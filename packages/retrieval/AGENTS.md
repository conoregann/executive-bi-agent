# Retrieval Package Guide

Own bounded, inspectable retrieval of approved company knowledge. Read
`docs/architecture/company-knowledge-retrieval-contract.md` and
`docs/architecture/evidence-contract.md` first.

- Validate documents on indexing and validate every search request before use.
- Preserve customer scope exactly: a customer-scoped search may return only
  documents explicitly tagged for that customer.
- Return source excerpts, timestamps, freshness, and immutable `document_chunk`
  evidence. Do not generate findings, claims, summaries, or causal conclusions.
- Keep ranking deterministic and bounded. A no-hit result is a normal outcome;
  do not broaden scope or fabricate context.
- Do not log, expose, or weaken document confidentiality boundaries.

Add a test for scope isolation and evidence provenance for any retrieval change.
