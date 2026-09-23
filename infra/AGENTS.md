# Infrastructure Guide

`infra/` owns the local synthetic PostgreSQL lifecycle. Treat SQL here as a
schema and fixture contract, not an application query layer.

- Keep raw, staging, and analytics layers distinct. Expose metric-ready views
  only through the documented analytics boundary.
- Use explicit constraints and deterministic seeds. Preserve the existing
  customer-level MRR movement semantics and exact reconciliation checks.
- Do not add production endpoints, real credentials, destructive reset commands,
  or a path that grants generated SQL write access.
- Keep initialization idempotent where PostgreSQL permits it; document any
  first-volume-only behavior in the nearest README.

Run `pnpm db:verify` after edits to initialization SQL, verification SQL, or
seed-dependent schema. Update the relevant architecture contract if a durable
schema boundary changes.
