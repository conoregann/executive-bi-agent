# Synthetic subscription-month source parity

Contract: [analytics data](../../docs/architecture/analytics-data-contract.md).

| ID           | Condition                                                                   | Expected outcome                                                                                                                                              |
| ------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `source-001` | Fresh local PostgreSQL seed and the labeled JSON fixture                    | All ten subscription-month rows, dimensions, cancellation timestamps, and freshness match exactly; July MRR is 420,000 cents and August MRR is 250,000 cents. |
| `source-002` | Existing local synthetic volume upgraded with `pnpm db:migrate`             | The migration is repeatable, preserves the existing MRR totals, and `pnpm db:verify` passes.                                                                  |
| `source-003` | PostgreSQL repository receives an invalid month or a malformed database row | An invalid month triggers no query; malformed or duplicate rows are rejected before metrics can use them.                                                     |
