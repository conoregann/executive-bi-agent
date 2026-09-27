import {
  customerCountryQueryEvidenceSchema,
  customerFollowUpRecordSchema,
  customerFollowUpAnswerSchema,
  customerCountryContributionsSchema,
  countryFollowUpRecordSchema,
  investigationEvidenceSchema,
  type CustomerFollowUpRecord,
  type CustomerFollowUpAnswer,
} from '@executive-bi/schemas';
import { synthesizeCountryFollowUpAnswer } from './country-answer.js';
import type { InvestigationEvidence } from './index.js';

/** Reads only retained evidence and rejects changed values or provenance. */
export function synthesizeCustomerFollowUpAnswer(
  record: CustomerFollowUpRecord,
  evidence: readonly InvestigationEvidence[],
):
  | { status: 'ok'; answer: CustomerFollowUpAnswer }
  | { status: 'answer_unavailable'; error: string } {
  const unavailable = {
    status: 'answer_unavailable' as const,
    error: 'Required reconciled customer evidence is unavailable.',
  };
  if (
    !customerFollowUpRecordSchema.safeParse(record).success ||
    record.status !== 'completed' ||
    record.plan.investigationId !== record.investigationId ||
    new Set(record.permittedCustomerIds).size !==
      record.permittedCustomerIds.length ||
    !investigationEvidenceSchema.array().safeParse(evidence).success
  )
    return unavailable;
  const byId = new Map(evidence.map((item) => [item.evidenceId, item]));
  if (
    byId.size !== evidence.length ||
    new Set(record.evidenceIds).size !== evidence.length ||
    record.evidenceIds.length !== evidence.length ||
    !record.evidenceIds.every((id) => byId.has(id))
  )
    return unavailable;
  const snapshot = evidence.find(
    (item) =>
      item.source === 'investigation_snapshot' &&
      item.type === 'calculation' &&
      item.integrity === 'valid',
  );
  const parent = countryFollowUpRecordSchema.safeParse(
    snapshot?.content.record,
  );
  if (
    !parent.success ||
    snapshot?.sourceRef !== record.parentInvestigationId ||
    snapshot.scope.parentInvestigationId !== record.parentInvestigationId ||
    evidence.length !== parent.data.evidenceIds.length + 4 ||
    parent.data.investigationId !== record.parentInvestigationId ||
    parent.data.month !== record.month ||
    !sameIds(parent.data.permittedCustomerIds, record.permittedCustomerIds) ||
    !Array.isArray(snapshot?.content.inputEvidenceIds) ||
    !sameIds(snapshot.content.inputEvidenceIds, parent.data.evidenceIds)
  )
    return unavailable;
  const parentEvidence = parent.data.evidenceIds.map((id) => byId.get(id));
  if (parentEvidence.some((item) => !item)) return unavailable;
  const parentAnswer = synthesizeCountryFollowUpAnswer(
    parent.data,
    parentEvidence as InvestigationEvidence[],
  );
  if (parentAnswer.status !== 'ok') return unavailable;
  const retainedCountry = parentAnswer.answer.comparison.rows.find(
    (row) => row.country === record.country,
  );
  if (!retainedCountry) return unavailable;
  const calculations = evidence.filter(
    (item) =>
      item.source === 'trusted_mrr_service' &&
      item.type === 'calculation' &&
      item.integrity === 'valid' &&
      !parent.data.evidenceIds.includes(item.evidenceId),
  );
  if (calculations.length !== 1) return unavailable;
  const calculation = calculations[0]!;
  const { formula, inputEvidenceIds, ...payload } = calculation.content;
  const parsed = customerCountryContributionsSchema.safeParse(payload);
  if (
    !parsed.success ||
    typeof formula !== 'string' ||
    !Array.isArray(inputEvidenceIds) ||
    inputEvidenceIds.length !== 2 ||
    new Set(inputEvidenceIds).size !== 2
  )
    return unavailable;
  const value = parsed.data;
  if (
    value.country !== record.country ||
    value.currentMonth !== record.month ||
    value.previousMonth !== parentAnswer.answer.comparison.previousMonth ||
    (
      [
        'previousMrrEurCents',
        'currentMrrEurCents',
        'mrrChangeEurCents',
      ] as const
    ).some((key) => value[key] !== retainedCountry[key]) ||
    (record.permittedCustomerIds.length > 0 &&
      value.rows.some(
        (row) => !record.permittedCustomerIds.includes(row.customerId),
      ))
  )
    return unavailable;
  for (const [index, month, field] of [
    [0, value.previousMonth, 'previousMrrEurCents'],
    [1, value.currentMonth, 'currentMrrEurCents'],
  ] as const) {
    const query = byId.get(inputEvidenceIds[index]);
    if (
      !query ||
      !customerCountryQueryEvidenceSchema.safeParse(query).success ||
      parent.data.evidenceIds.includes(query.evidenceId) ||
      query.type !== 'metric_query' ||
      query.source !== 'analytics.subscription_month' ||
      query.integrity !== 'valid' ||
      query.scope.metric !== 'customer_country_mrr' ||
      query.scope.month !== month ||
      query.scope.country !== record.country ||
      query.content.month !== month ||
      query.content.country !== record.country ||
      query.content.mrrEurCents !== value[field]
    )
      return unavailable;
    const filters = query.scope.filters;
    if (
      !filters ||
      typeof filters !== 'object' ||
      Array.isArray(filters) ||
      Object.keys(filters).some((key) => key !== 'customerIds') ||
      !sameIds(
        (filters as { customerIds?: unknown }).customerIds ?? [],
        record.permittedCustomerIds,
      )
    )
      return unavailable;
    const queryRows =
      customerCountryQueryEvidenceSchema.parse(query).content.rows;
    if (
      queryRows.length !== value.rows.length ||
      queryRows.some(
        (row, index) =>
          row.customerId !== value.rows[index]!.customerId ||
          row.mrrEurCents !== value.rows[index]![field],
      )
    )
      return unavailable;
  }
  const answer = customerFollowUpAnswerSchema.safeParse({
    investigationId: record.investigationId,
    parentInvestigationId: record.parentInvestigationId,
    permittedCustomerIds: [...record.permittedCustomerIds],
    contributions: value,
    evidence: [...evidence],
    sourceEvidenceIds: [...inputEvidenceIds, calculation.evidenceId],
    limitations: [
      'Customer contributions measure changes in country MRR, including country transfers. They do not classify churn or acquisition or explain business causes.',
      'The five largest negative contributions are shown. Positive offsets include all gains; remaining net movement includes all other losses. Full customer values remain inspectable in the evidence.',
      ...(record.country === null
        ? ['This row represents MRR without a country dimension.']
        : []),
    ],
  });
  return answer.success ? { status: 'ok', answer: answer.data } : unavailable;
}
function sameIds(a: unknown, b: readonly string[]): boolean {
  return (
    Array.isArray(a) &&
    a.length === b.length &&
    new Set(a).size === a.length &&
    a.every((id) => typeof id === 'string' && b.includes(id))
  );
}
