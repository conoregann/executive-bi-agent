# Metric query contract

## Purpose

The agent requests a typed metric operation; the analytics layer selects deterministic query templates. It must not compose raw SQL from model text for catalog metrics.

## Request shape

```json
{
  "metric": "mrr_change",
  "period": { "start": "2026-08-01", "end": "2026-08-31", "grain": "month" },
  "comparison": "previous_period",
  "groupBy": ["region"],
  "filters": [{ "field": "plan", "operator": "eq", "value": "enterprise" }],
  "limit": 10,
  "sort": [{ "field": "absolute_change", "direction": "asc" }]
}
```

## Validation rules

- `metric` must be a catalog identifier.
- Periods must be complete calendar periods for month-grain metrics.
- `groupBy` and filters must be in the metric’s allowed dimensions.
- Filter values must be enumerated, typed, or canonical entity IDs; arbitrary SQL fragments are invalid.
- `limit` defaults to 20 and cannot exceed 100.
- A request may not mix incompatible grains or comparison periods.
- Responses include the resolved request, query identifier, data freshness, row count, and metric definition version.

## Result shape

```json
{
  "queryId": "metric_01H...",
  "metric": "mrr_change",
  "definitionVersion": "1.0.0",
  "resolvedPeriod": "2026-08",
  "comparisonPeriod": "2026-07",
  "dataFreshness": "2026-09-01T08:00:00Z",
  "rows": [],
  "warnings": []
}
```

Warnings are mandatory for incomplete data, a zero denominator, missing dimension values, or an unavailable comparison. A metric result without provenance is not valid evidence.
