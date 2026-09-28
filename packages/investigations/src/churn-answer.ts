import {
  churnFollowUpAnswerSchema,
  churnFollowUpRecordSchema,
  customerChurnRateSchema,
  investigationEvidenceSchema,
  type ChurnFollowUpRecord,
  type ChurnFollowUpAnswer,
} from '@executive-bi/schemas';
import type { InvestigationEvidence } from './index.js';

export function synthesizeChurnFollowUpAnswer(
  record: ChurnFollowUpRecord,
  evidence: readonly InvestigationEvidence[],
):
  | { status: 'ok'; answer: ChurnFollowUpAnswer }
  | { status: 'answer_unavailable'; error: string } {
  const unavailable = {
    status: 'answer_unavailable' as const,
    error: 'Required customer churn evidence is unavailable.',
  };
  if (
    !churnFollowUpRecordSchema.safeParse(record).success ||
    record.status !== 'completed' ||
    !investigationEvidenceSchema.array().safeParse(evidence).success ||
    evidence.length !== 3 ||
    new Set(evidence.map((item) => item.evidenceId)).size !== 3 ||
    record.evidenceIds.length !== 3 ||
    !record.evidenceIds.every((id) =>
      evidence.some((item) => item.evidenceId === id),
    )
  )
    return unavailable;
  const calculation = evidence.find((item) => item.type === 'calculation');
  if (
    !calculation ||
    calculation.source !== 'trusted_mrr_service' ||
    calculation.integrity === 'invalid' ||
    calculation.content.formula !==
      'customer_churn_rate = churned_customers / starting_customers' ||
    !Array.isArray(calculation.content.inputEvidenceIds) ||
    calculation.content.inputEvidenceIds.length !== 2
  )
    return unavailable;
  const value = customerChurnRateSchema.safeParse(
    Object.fromEntries(
      [
        'currentMonth',
        'previousMonth',
        'churnedCustomers',
        'startingCustomers',
        'rate',
      ].map((key) => [key, calculation.content[key]]),
    ),
  );
  if (!value.success || value.data.currentMonth !== record.month)
    return unavailable;
  const inputEvidenceIds = calculation.content.inputEvidenceIds as unknown[];
  const prior = evidence.find(
    (item) => item.evidenceId === inputEvidenceIds[0],
  );
  const current = evidence.find(
    (item) => item.evidenceId === inputEvidenceIds[1],
  );
  if (!prior || !current || prior === current) return unavailable;
  const scopesMatch = (item: InvestigationEvidence, month: string) => {
    const filters = item.scope.filters;
    if (!filters || typeof filters !== 'object' || Array.isArray(filters))
      return false;
    const keys = Object.keys(filters);
    const ids = (filters as Record<string, unknown>).customerIds;
    return (
      item.type === 'metric_query' &&
      item.integrity === 'valid' &&
      item.source === 'analytics.subscription_month' &&
      item.sourceRef === `customer_churn_cohort:${month}` &&
      item.observedAt === month &&
      item.scope.month === month &&
      item.scope.metric === 'customer_churn_cohort' &&
      (record.permittedCustomerIds.length === 0
        ? keys.length === 0
        : keys.length === 1 &&
          keys[0] === 'customerIds' &&
          Array.isArray(ids) &&
          ids.length === record.permittedCustomerIds.length &&
          ids.every((id) => record.permittedCustomerIds.includes(id)))
    );
  };
  if (
    !scopesMatch(prior, value.data.previousMonth) ||
    !scopesMatch(current, value.data.currentMonth)
  )
    return unavailable;
  const ids = (item: InvestigationEvidence) => item.content.activeCustomerIds;
  if (
    ![prior, current].every(
      (item) =>
        Array.isArray(ids(item)) &&
        (ids(item) as unknown[]).every(
          (id) => typeof id === 'string' && id.length > 0,
        ) &&
        new Set(ids(item) as string[]).size ===
          (ids(item) as string[]).length &&
        item.content.month === item.scope.month &&
        item.content.activeCustomers === (ids(item) as string[]).length,
    )
  )
    return unavailable;
  const previousIds = ids(prior) as string[];
  const currentIds = new Set(ids(current) as string[]);
  if (
    previousIds.length !== value.data.startingCustomers ||
    previousIds.filter((id) => !currentIds.has(id)).length !==
      value.data.churnedCustomers ||
    (value.data.rate === null) !==
      record.warnings.includes('zero_customer_churn_denominator') ||
    calculation.integrity !== (value.data.rate === null ? 'warning' : 'valid')
  )
    return unavailable;
  const answer = churnFollowUpAnswerSchema.safeParse({
    investigationId: record.investigationId,
    parentInvestigationId: record.parentInvestigationId,
    permittedCustomerIds: record.permittedCustomerIds,
    value: value.data,
    sourceEvidenceIds: [
      prior.evidenceId,
      current.evidenceId,
      calculation.evidenceId,
    ],
    evidence,
    warnings: record.warnings,
  });
  return answer.success ? { status: 'ok', answer: answer.data } : unavailable;
}
