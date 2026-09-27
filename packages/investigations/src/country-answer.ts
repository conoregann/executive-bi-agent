import {
  countryFollowUpRecordSchema,
  countryFollowUpAnswerSchema,
  countryMrrComparisonSchema,
  investigationEvidenceSchema,
  type CountryFollowUpRecord,
  type CountryFollowUpAnswer,
} from '@executive-bi/schemas';
import type { InvestigationEvidence } from './index.js';

/** Validates retained provenance and copies trusted values; no tools run on reads. */
export function synthesizeCountryFollowUpAnswer(
  record: CountryFollowUpRecord,
  evidence: readonly InvestigationEvidence[],
):
  | { status: 'ok'; answer: CountryFollowUpAnswer }
  | { status: 'answer_unavailable'; error: string } {
  const unavailable = {
    status: 'answer_unavailable' as const,
    error: 'Required reconciled country evidence is unavailable.',
  };
  if (
    !countryFollowUpRecordSchema.safeParse(record).success ||
    record.status !== 'completed' ||
    !investigationEvidenceSchema.array().safeParse(evidence).success
  )
    return unavailable;
  const byId = new Map(evidence.map((item) => [item.evidenceId, item]));
  if (
    byId.size !== evidence.length ||
    record.evidenceIds.length !== evidence.length ||
    !record.evidenceIds.every((id) => byId.has(id))
  )
    return unavailable;
  // Calculation metadata is separate from the typed comparison payload.
  const candidates = evidence.filter(
    (item) =>
      item.type === 'calculation' &&
      item.source === 'trusted_mrr_service' &&
      item.integrity !== 'invalid',
  );
  let selected: InvestigationEvidence | undefined;
  let comparison: CountryFollowUpAnswer['comparison'] | undefined;
  for (const item of candidates) {
    const {
      formula: _formula,
      inputEvidenceIds: _inputs,
      ...values
    } = item.content;
    const parsed = countryMrrComparisonSchema.safeParse(values);
    if (parsed.success) {
      selected = item;
      comparison = parsed.data;
      break;
    }
  }
  if (
    !selected ||
    typeof selected.content.formula !== 'string' ||
    !comparison ||
    comparison.currentMonth !== record.month ||
    !Array.isArray(selected.content.inputEvidenceIds) ||
    selected.content.inputEvidenceIds.length !== 2
  )
    return unavailable;
  const queries = selected.content.inputEvidenceIds.map((id) =>
    typeof id === 'string' ? byId.get(id) : undefined,
  );
  const sameScope = (item: InvestigationEvidence) => {
    const filters = item.scope.filters;
    if (
      typeof filters !== 'object' ||
      filters === null ||
      Array.isArray(filters)
    )
      return false;
    const typed = filters as Record<string, unknown>;
    const ids = typed.customerIds ?? [];
    return (
      Object.keys(typed).every((key) => key === 'customerIds') &&
      Array.isArray(ids) &&
      ids.length === record.permittedCustomerIds.length &&
      new Set(ids).size === ids.length &&
      ids.every((id) => record.permittedCustomerIds.includes(id))
    );
  };
  for (const [month, total, field] of [
    [
      comparison.previousMonth,
      comparison.previousMrrEurCents,
      'previousMrrEurCents',
    ],
    [
      comparison.currentMonth,
      comparison.currentMrrEurCents,
      'currentMrrEurCents',
    ],
  ] as const) {
    const query = queries.find((item) => item?.scope.month === month);
    const parentTotal = evidence.find(
      (item) =>
        (item.evidenceId.startsWith('parent_') ||
          item.evidenceId.startsWith('country_parent_')) &&
        item.type === 'metric_query' &&
        item.scope.month === month &&
        item.scope.metric === 'mrr' &&
        item.source === 'analytics.subscription_month' &&
        item.content.month === month &&
        item.scope.groupBy === undefined &&
        item.integrity === 'valid' &&
        sameScope(item),
    );
    if (
      !query ||
      query.type !== 'metric_query' ||
      query.source !== 'analytics.subscription_month' ||
      query.integrity === 'invalid' ||
      query.scope.metric !== 'mrr' ||
      query.scope.groupBy !== 'country' ||
      !sameScope(query) ||
      query.content.month !== month ||
      query.content.groupBy !== 'country' ||
      query.content.totalMrrEurCents !== total ||
      parentTotal?.content.mrrEurCents !== total ||
      !Array.isArray(query.content.rows)
    )
      return unavailable;
    const rows = query.content.rows as {
      dimensionValue: string;
      mrrEurCents: number;
    }[];
    if (
      !rows.every(
        (row) =>
          typeof row === 'object' &&
          row !== null &&
          typeof row.dimensionValue === 'string' &&
          row.dimensionValue.trim() &&
          Number.isSafeInteger(row.mrrEurCents) &&
          row.mrrEurCents >= 0,
      ) ||
      new Set(rows.map((row) => row.dimensionValue)).size !== rows.length ||
      !Number.isSafeInteger(query.content.unassignedMrrEurCents) ||
      (query.content.unassignedMrrEurCents as number) < 0
    )
      return unavailable;
    const grouped = rows.reduce((total, row) => total + row.mrrEurCents, 0);
    if (
      grouped + (query.content.unassignedMrrEurCents as number) !== total ||
      query.content.groupedMrrEurCents !== grouped ||
      query.content.reconciles !== (query.content.unassignedMrrEurCents === 0)
    )
      return unavailable;
    if (
      !rows.every((row) =>
        comparison!.rows.some(
          (result) =>
            result.country === row.dimensionValue &&
            result[field] === row.mrrEurCents,
        ),
      ) ||
      !comparison.rows.every(
        (row) =>
          row[field] ===
          (row.country === null
            ? query.content.unassignedMrrEurCents
            : (rows.find((source) => source.dimensionValue === row.country)
                ?.mrrEurCents ?? 0)),
      )
    )
      return unavailable;
  }
  const countries = new Set(
    queries.flatMap((item) =>
      (item!.content.rows as { dimensionValue: string }[]).map(
        (row) => row.dimensionValue,
      ),
    ),
  );
  if (
    comparison.rows.some(
      (row) => row.country !== null && !countries.has(row.country),
    )
  )
    return unavailable;
  const parsed = countryFollowUpAnswerSchema.safeParse({
    investigationId: record.investigationId,
    parentInvestigationId: record.parentInvestigationId,
    permittedCustomerIds: [...record.permittedCustomerIds],
    comparison,
    evidence: [...evidence],
    sourceEvidenceIds: [
      ...selected.content.inputEvidenceIds,
      selected.evidenceId,
    ],
    limitations: [
      'Country changes represent changes in country totals. Customers changing country can move MRR between countries; these changes are not churn or acquisition.',
      ...(comparison.missingDimensions
        ? [
            'Some MRR has no country dimension; unassigned amounts are shown explicitly.',
          ]
        : []),
    ],
  });
  return parsed.success ? { status: 'ok', answer: parsed.data } : unavailable;
}
