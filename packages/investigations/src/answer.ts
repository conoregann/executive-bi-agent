import { createRetainedMrrWaterfall } from '@executive-bi/metrics';
import {
  investigationAnswerSchema,
  mrrPlanChartSchema,
  investigationEvidenceSchema,
  mrrDeclineRecordSchema,
  type InvestigationAnswer,
} from '@executive-bi/schemas';
import type { InvestigationEvidence, InvestigationRecord } from './index.js';

export type InvestigationAnswerResult =
  | { status: 'ok'; answer: InvestigationAnswer }
  | { status: 'answer_unavailable'; error: string };

/** Presents trusted values and source excerpts without calculating new metrics. */
export function synthesizeMrrDeclineAnswer(
  record: InvestigationRecord,
  evidence: readonly InvestigationEvidence[],
): InvestigationAnswerResult {
  const unavailable: InvestigationAnswerResult = {
    status: 'answer_unavailable',
    error: 'Required reconciled metric evidence is unavailable.',
  };
  if (
    !mrrDeclineRecordSchema.safeParse(record).success ||
    record.status !== 'completed'
  )
    return unavailable;
  const parsed = investigationEvidenceSchema.array().safeParse(evidence);
  if (!parsed.success) return unavailable;
  const items = parsed.data;
  const byId = new Map(items.map((item) => [item.evidenceId, item]));
  if (
    byId.size !== items.length ||
    !sameIds(
      record.evidenceIds,
      items.map((item) => item.evidenceId),
    )
  )
    return unavailable;

  const monthDate = new Date(`${record.month}T00:00:00Z`);
  monthDate.setUTCMonth(monthDate.getUTCMonth() - 1);
  const previousMonth = monthDate.toISOString().slice(0, 10);
  const current = items.find((item) => metricAt(item, record, record.month));
  const previous = items.find((item) => metricAt(item, record, previousMonth));
  if (!current || !previous) return unavailable;
  const calculation = items.find(
    (item) =>
      item.type === 'calculation' &&
      item.integrity !== 'invalid' &&
      cents(item.content.absoluteChangeEurCents) &&
      references(item, current.evidenceId, previous.evidenceId),
  );
  const movement = items.find(
    (item) =>
      item.type === 'calculation' &&
      item.integrity === 'valid' &&
      item.content.reconciles === true &&
      item.content.currentMonth === record.month &&
      item.content.previousMonth === previousMonth &&
      item.content.currentMrrEurCents === current.content.mrrEurCents &&
      item.content.priorMrrEurCents === previous.content.mrrEurCents &&
      referencesMetricScope(item, byId, record),
  );
  const customers = items.find(
    (item) =>
      item.type === 'metric_query' &&
      item.integrity === 'valid' &&
      item.scope.metric === 'customer_mrr_movement' &&
      item.scope.month === record.month &&
      sameFilters(item, record) &&
      item.content.currentMonth === record.month &&
      item.content.previousMonth === previousMonth,
  );
  if (
    !calculation ||
    !movement ||
    !customers ||
    !Array.isArray(customers.content.rows)
  )
    return unavailable;
  const rows = customers.content.rows;
  if (
    !rows.every(
      (row): row is { customerId: string; mrrChangeEurCents: number } =>
        typeof row === 'object' &&
        row !== null &&
        typeof row.customerId === 'string' &&
        cents(row.mrrChangeEurCents) &&
        (record.permittedCustomerIds.length === 0 ||
          record.permittedCustomerIds.includes(row.customerId)),
    )
  )
    return unavailable;
  const losses = rows
    .filter((row) => row.mrrChangeEurCents < 0)
    .sort(
      (a, b) =>
        a.mrrChangeEurCents - b.mrrChangeEurCents ||
        a.customerId.localeCompare(b.customerId),
    );
  if (
    losses.length > 5 ||
    !sameIds(
      losses.map((row) => row.customerId),
      record.driverCustomerIds,
    )
  )
    return unavailable;
  const drivers = losses.map((row) => ({
    classification: 'observed_fact' as const,
    text: `${row.customerId}: MRR change ${money(row.mrrChangeEurCents)}.`,
    evidenceIds: [customers.evidenceId],
  }));
  const documents = items.filter(
    (item) =>
      item.type === 'document_chunk' &&
      item.integrity === 'valid' &&
      typeof item.content.excerpt === 'string' &&
      item.content.excerpt.trim() !== '' &&
      typeof item.content.title === 'string' &&
      Array.isArray(item.scope.customerIds) &&
      item.scope.customerIds.length > 0 &&
      item.scope.customerIds.every(
        (id) => typeof id === 'string' && record.driverCustomerIds.includes(id),
      ),
  );
  const context = documents.map((item) => ({
    classification: 'context' as const,
    text: item.content.excerpt,
    evidenceIds: [item.evidenceId],
  }));
  const claims = [
    {
      classification: 'calculated_delta' as const,
      text: `MRR for ${record.month.slice(0, 7)} changed from ${money(previous.content.mrrEurCents as number)} to ${money(current.content.mrrEurCents as number)}; change ${money(calculation.content.absoluteChangeEurCents as number)} against ${previousMonth.slice(0, 7)}.`,
      evidenceIds: [
        current.evidenceId,
        previous.evidenceId,
        calculation.evidenceId,
        movement.evidenceId,
      ],
    },
    ...drivers,
    ...context,
  ];
  const breakdown = items.find(
    (item) =>
      item.type === 'metric_query' &&
      item.integrity !== 'invalid' &&
      item.scope.metric === 'mrr' &&
      item.scope.groupBy === 'plan' &&
      item.scope.month === record.month &&
      sameFilters(item, record) &&
      item.content.month === record.month &&
      item.content.groupBy === 'plan' &&
      item.content.totalMrrEurCents === current.content.mrrEurCents &&
      (item.integrity === 'valid'
        ? item.content.reconciles === true
        : item.content.reconciles === false),
  );
  const chartResult = mrrPlanChartSchema.safeParse(
    breakdown && {
      chartType: 'bar',
      month: record.month,
      permittedCustomerIds: [...record.permittedCustomerIds],
      sourceEvidenceId: breakdown.evidenceId,
      reconciles: breakdown.content.reconciles,
      unassignedMrrEurCents: breakdown.content.unassignedMrrEurCents,
      data: breakdown.content.rows,
    },
  );
  // Validate retained reconciliation; no derived metric is exposed here.
  const chart =
    chartResult.success &&
    breakdown &&
    cents(breakdown.content.groupedMrrEurCents) &&
    chartResult.data.data.reduce((sum, row) => sum + row.mrrEurCents, 0) ===
      breakdown.content.groupedMrrEurCents &&
    breakdown.content.groupedMrrEurCents +
      chartResult.data.unassignedMrrEurCents ===
      breakdown.content.totalMrrEurCents
      ? chartResult.data
      : undefined;
  const waterfall = createRetainedMrrWaterfall(
    movement.content,
    movement.evidenceId,
  );
  const citedIds = new Set(claims.flatMap((claim) => claim.evidenceIds));
  if (chart) citedIds.add(chart.sourceEvidenceId);
  if (waterfall) citedIds.add(waterfall.sourceEvidenceId);
  const result = investigationAnswerSchema.safeParse({
    investigationId: record.investigationId,
    scope: {
      month: record.month,
      comparison: 'previous_period',
      permittedCustomerIds: [...record.permittedCustomerIds],
    },
    answer: claims[0],
    drivers,
    context,
    limitations: [
      ...new Set([
        ...record.warnings,
        ...(!chart
          ? [
              'MRR by plan chart is unavailable: usable breakdown evidence is missing.',
            ]
          : !chart.reconciles
            ? ['MRR by plan is incomplete; unassigned MRR is shown separately.']
            : []),
        'Customer drivers show at most five ranked movements; they are not a complete decomposition.',
        ...(context.length === 0
          ? ['No usable company knowledge was retrieved for these drivers.']
          : [
              'Document excerpts are contextual evidence; a causal link to MRR movement is unconfirmed.',
            ]),
      ]),
    ],
    evidence: items
      .filter((item) => citedIds.has(item.evidenceId))
      .map((item) => ({
        evidenceId: item.evidenceId,
        sourceRef: item.sourceRef,
        type: item.type,
        freshness: item.freshness,
        ...(item.type === 'metric_query'
          ? { sourceStatus: item.scope.sourceStatus }
          : {}),
      })),
    ...(chart ? { chart } : {}),
    ...(waterfall ? { waterfall } : {}),
    recommendedNextStep: {
      owner: 'Revenue operations',
      text:
        losses.length > 0
          ? 'Review the cited account movements and confirm cancellation or contraction reasons with account owners.'
          : 'Review the reconciled movement evidence before opening an investigation with a different scope.',
      customerIds: losses.map((row) => row.customerId),
    },
  });
  return result.success ? { status: 'ok', answer: result.data } : unavailable;
}

function cents(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function money(value: number): string {
  const digits = Math.abs(value).toString().padStart(3, '0');
  return `EUR ${value < 0 ? '-' : ''}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    new Set(left).size === left.length &&
    left.every((id) => right.includes(id))
  );
}

function sameFilters(
  item: InvestigationEvidence,
  record: InvestigationRecord,
): boolean {
  const filters = item.scope.filters;
  if (typeof filters !== 'object' || filters === null || Array.isArray(filters))
    return false;
  const fields = filters as Record<string, unknown>;
  if (Object.keys(fields).some((key) => key !== 'customerIds')) return false;
  const ids = fields.customerIds ?? [];
  return (
    Array.isArray(ids) &&
    ids.every((id) => typeof id === 'string') &&
    sameIds(ids, record.permittedCustomerIds)
  );
}

function metricAt(
  item: InvestigationEvidence,
  record: InvestigationRecord,
  month: string,
): boolean {
  return (
    item.type === 'metric_query' &&
    item.integrity === 'valid' &&
    item.scope.metric === 'mrr' &&
    item.scope.month === month &&
    item.content.month === month &&
    cents(item.content.mrrEurCents) &&
    sameFilters(item, record)
  );
}

function references(item: InvestigationEvidence, ...ids: string[]): boolean {
  const inputs = item.content.inputEvidenceIds;
  return Array.isArray(inputs) && sameIds(inputs, ids);
}

function referencesMetricScope(
  item: InvestigationEvidence,
  byId: Map<string, InvestigationEvidence>,
  record: InvestigationRecord,
): boolean {
  const inputs = item.content.inputEvidenceIds;
  if (
    !Array.isArray(inputs) ||
    inputs.length !== 2 ||
    new Set(inputs).size !== 2
  )
    return false;
  const current = byId.get(inputs[1]);
  const previous = byId.get(inputs[0]);
  return (
    current !== undefined &&
    previous !== undefined &&
    metricAt(current, record, item.content.currentMonth as string) &&
    metricAt(previous, record, item.content.previousMonth as string)
  );
}
