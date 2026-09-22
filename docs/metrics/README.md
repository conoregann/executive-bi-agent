# Semantic metrics

Metrics are product contracts, not prompt text. Each metric defines its grain, time semantics, filters, dimensions, calculation, freshness, owner, and validation cases before it is exposed to the agent.

- [Metric catalog](metric-catalog.md) — canonical definitions and reconciliation rules.
- [Metric query contract](query-contract.md) — typed request and result boundary.

The agent chooses a catalog metric and valid dimensions; the analytics layer owns the deterministic query implementation.
