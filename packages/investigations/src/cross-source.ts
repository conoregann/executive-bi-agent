import {
  investigationEvidenceSchema,
  crossSourceRequestSchema,
  crossSourceRecordSchema,
  modelPlanSchema,
  modelSynthesisSchema,
  operationalSnapshotSchema,
  mrrDeclineRecordSchema,
  customerFollowUpRecordSchema,
  type CrossSourceRecord,
  type CrossSourcePlan,
  type OperationalSource,
} from '@executive-bi/schemas';
import {
  compareCustomerUsage,
  type OperationalRepository,
} from '@executive-bi/operations';
import type { InvestigationModel } from '@executive-bi/ai';
import type {
  InvestigationEvidence,
  InvestigationStore,
  StoredRecord,
} from './index.js';
import { synthesizeMrrDeclineAnswer } from './answer.js';
import { synthesizeCustomerFollowUpAnswer } from './customer-answer.js';
import { createHash, randomBytes } from 'node:crypto';

export interface CrossSourceDependencies {
  repository: OperationalRepository;
  model?: InvestigationModel;
  searchKnowledge?: (input: unknown) => Promise<{
    status: string;
    hits: readonly { evidence: InvestigationEvidence; documentId?: string }[];
    warnings: readonly string[];
  }>;
}
export function retainedLosses(
  record: StoredRecord,
  evidence: readonly InvestigationEvidence[],
): string[] | undefined {
  if (record.kind === 'mrr_decline') {
    return synthesizeMrrDeclineAnswer(record, evidence).status === 'ok'
      ? [...record.driverCustomerIds]
      : undefined;
  }
  if (record.kind === 'mrr_customer_follow_up') {
    const result = synthesizeCustomerFollowUpAnswer(record, evidence);
    return result.status === 'ok'
      ? result.answer.contributions.largestLosses.map((row) => row.customerId)
      : undefined;
  }
  return undefined;
}
async function bounded<T>(
  call: (signal: AbortSignal) => Promise<T>,
  deadline: number,
): Promise<T> {
  if (Date.now() >= deadline) throw new Error('Deadline');
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      call(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => {
            controller.abort();
            reject(new Error('Deadline'));
          },
          Math.max(1, deadline - Date.now()),
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    controller.abort();
  }
}
export async function runCrossSource(
  parent: StoredRecord,
  parentEvidence: readonly InvestigationEvidence[],
  input: unknown,
  store: InvestigationStore,
  dependencies?: CrossSourceDependencies,
) {
  const request = crossSourceRequestSchema.safeParse(input);
  if (!request.success)
    return {
      status: 'invalid_request' as const,
      error:
        'Choose a supported cross-source follow-up; changed scope requires a new investigation.',
    };
  const ids = retainedLosses(parent, parentEvidence);
  if (!ids) return { status: 'invalid_parent' as const };
  const started = Date.now(),
    deadline = started + 30000;
  const warnings: string[] = [];
  let sources: OperationalSource[] = request.data.question.includes('pricing')
    ? ['crm']
    : request.data.question.includes('support escalations')
      ? ['support', 'usage']
      : ['crm', 'support', 'usage'];
  let planner: CrossSourcePlan['planner'] = 'deterministic';
  if (dependencies?.model) {
    try {
      const proposal = modelPlanSchema.parse(
        await bounded(
          (signal) =>
            dependencies.model!.complete(
              'plan',
              {
                question: request.data.question,
                month: parent.month,
                customerIds: ids,
                approvedTools: sources,
              },
              signal,
            ),
          deadline,
        ),
      );
      if (proposal.tools.some((source) => !sources.includes(source)))
        throw new Error('Unsupported source');
      sources = proposal.tools;
      planner = 'model';
    } catch {
      sources = [];
      planner = 'unavailable';
      warnings.push('model_plan_unavailable');
    }
  }
  for (const source of ['crm', 'support', 'usage'] as const)
    if (!sources.includes(source)) warnings.push(`${source}_not_requested`);
  const plan: CrossSourcePlan = {
    investigationId: request.data.investigationId,
    steps: sources,
    maximumToolCalls: 4,
    deadlineMs: 30000,
    planner,
  };
  const accessToken = randomBytes(32).toString('base64url');
  if (
    !(await store.reserve(
      plan,
      createHash('sha256').update(accessToken).digest('hex'),
    ))
  )
    return { status: 'conflict' as const };
  // A self-contained parent snapshot preserves original IDs and all calculation input links.
  const now = new Date().toISOString();
  const evidence: InvestigationEvidence[] = [
    {
      evidenceId: 'cross_parent',
      type: 'calculation',
      source: 'cross_source_parent_snapshot',
      sourceRef: parent.investigationId,
      observedAt: parent.month,
      retrievedAt: now,
      freshness: now,
      integrity: 'valid',
      scope: { month: parent.month, customerIds: ids },
      content: {
        record: structuredClone(parent),
        evidence: structuredClone(parentEvidence),
      },
    },
  ];
  if (!ids.length) warnings.push('no_customer_loss_drivers');
  for (const source of sources) {
    if (!ids.length) break;
    try {
      if (!dependencies) throw new Error('Source unavailable');
      const result = await bounded(
        () =>
          dependencies.repository.read({
            month: parent.month,
            customerIds: ids,
            source,
          }),
        deadline,
      );
      if (result.status !== 'ok') throw new Error('Source unavailable');
      const rows = operationalSnapshotSchema.parse({
        label: 'synthetic',
        rows: result.rows,
      }).rows;
      const previous = new Date(`${parent.month}T00:00:00Z`);
      previous.setUTCMonth(previous.getUTCMonth() - 1);
      const previousMonth = previous.toISOString().slice(0, 10);
      if (
        rows.some(
          (row) =>
            row.source !== source ||
            !ids.includes(row.customerId) ||
            row.month < previousMonth ||
            row.month > parent.month,
        )
      )
        throw new Error('Scope violation');
      const missing = ids.filter(
        (id) =>
          !rows.some(
            (row) =>
              row.customerId === id &&
              (source !== 'usage' || row.month === parent.month),
          ) ||
          (source === 'usage' &&
            !rows.some(
              (row) => row.customerId === id && row.month === previousMonth,
            )),
      );
      const stale = ids.filter((id) =>
        rows.some(
          (row) =>
            row.customerId === id &&
            row.freshness < `${parent.month}T00:00:00Z`,
        ),
      );
      if (missing.length) warnings.push(`${source}_coverage_missing`);
      if (stale.length) warnings.push(`${source}_coverage_stale`);
      evidence.push({
        evidenceId: `ops_${source}`,
        type: 'metric_query',
        source: 'synthetic_operational_records',
        sourceRef: result.queryId,
        observedAt: parent.month,
        retrievedAt: now,
        freshness: rows.map((row) => row.freshness).sort()[0] ?? now,
        integrity: stale.length ? 'warning' : 'valid',
        scope: { month: parent.month, previousMonth, customerIds: ids, source },
        content: {
          rows,
          missingCustomerIds: missing,
          staleCustomerIds: stale,
          ...(source === 'usage'
            ? {
                usageComparisons: compareCustomerUsage(rows, ids, parent.month),
                formula:
                  'activeUserChange = currentActiveUsers - previousActiveUsers; null when either observation is missing',
              }
            : {}),
        },
      });
    } catch {
      warnings.push(`${source}_unavailable`);
    }
  }
  if (ids.length && sources.includes('crm') && dependencies?.searchKnowledge) {
    try {
      const result = await bounded(
        () =>
          dependencies.searchKnowledge!({
            query: 'pricing budget cancellation',
            customerIds: ids,
            limit: 5,
          }),
        deadline,
      );
      if (result.status !== 'ok') throw new Error('Knowledge unavailable');
      const previous = new Date(`${parent.month}T00:00:00Z`);
      previous.setUTCMonth(previous.getUTCMonth() - 1);
      const next = new Date(`${parent.month}T00:00:00Z`);
      next.setUTCMonth(next.getUTCMonth() + 1);
      const hits = result.hits.filter(
        (hit) =>
          hit.documentId &&
          hit.evidence.type === 'document_chunk' &&
          hit.evidence.integrity === 'valid' &&
          hit.evidence.observedAt >= previous.toISOString() &&
          hit.evidence.observedAt < next.toISOString() &&
          JSON.stringify(hit.evidence.scope.customerIds) ===
            JSON.stringify(ids),
      );
      evidence.push(
        ...hits.map((hit, index) => ({
          ...hit.evidence,
          evidenceId: `cross_doc_${index}`,
          content: { ...hit.evidence.content, documentId: hit.documentId },
        })),
      );
      if (!hits.length) warnings.push('document_context_missing');
    } catch {
      warnings.push('document_context_unavailable');
    }
  }

  let hypotheses: CrossSourceRecord['hypotheses'] = [];
  let modelStatus: CrossSourceRecord['modelStatus'] = dependencies?.model
    ? 'unavailable'
    : 'disabled';
  if (dependencies?.model && planner === 'model') {
    try {
      const proposal = modelSynthesisSchema.parse(
        await bounded(
          (signal) =>
            dependencies.model!.complete(
              'synthesis',
              {
                question: request.data.question,
                evidence: evidence.filter(
                  (item) => item.evidenceId !== 'cross_parent',
                ),
                customerIds: ids,
              },
              signal,
            ),
          deadline,
        ),
      );
      if (!validHypotheses(proposal.hypotheses, evidence))
        throw new Error('Unsupported references');
      hypotheses = proposal.hypotheses;
      modelStatus = 'completed';
    } catch {
      warnings.push('model_synthesis_unavailable');
    }
  }
  warnings.push(
    'Operational records and documents show reported context and correlations, not established causes.',
  );
  if (
    evidence.some(
      (item) =>
        item.content.rows &&
        JSON.stringify(item.content.rows).includes('budget_frozen'),
    )
  )
    warnings.push(
      'CRM budget-freeze reason may conflict with a pricing explanation; review the retained document context.',
    );
  const record: CrossSourceRecord = {
    investigationId: plan.investigationId,
    parentInvestigationId: parent.investigationId,
    kind: 'mrr_cross_source',
    month: parent.month,
    permittedCustomerIds: [...parent.permittedCustomerIds],
    customerIds: ids,
    plan,
    status: planner === 'unavailable' ? 'blocked' : 'completed',
    evidenceIds: evidence.map((item) => item.evidenceId),
    warnings,
    question: request.data.question,
    hypotheses,
    modelStatus,
    elapsedMs: Date.now() - started,
  };
  crossSourceRecordSchema.parse(record);
  await store.finalize(record.investigationId, record, evidence);
  return { status: record.status, record, accessToken, warnings };
}
function validHypotheses(
  hypotheses: CrossSourceRecord['hypotheses'],
  evidence: readonly InvestigationEvidence[],
): boolean {
  const byId = new Map(evidence.map((item) => [item.evidenceId, item]));
  return hypotheses.every((h) => {
    const required = h.kind === 'pricing' ? 'crm' : h.kind;
    return (
      [...h.supportingEvidenceIds, ...h.contradictoryEvidenceIds].every(
        (id) =>
          byId.has(id) &&
          id !== 'cross_parent' &&
          byId.get(id)!.integrity === 'valid',
      ) &&
      h.supportingEvidenceIds.some((id) => {
        const item = byId.get(id)!;
        if (item.scope.source !== required || !Array.isArray(item.content.rows))
          return false;
        const rows = operationalSnapshotSchema.safeParse({
          label: 'synthetic',
          rows: item.content.rows,
        });
        if (!rows.success) return false;
        if (h.kind === 'pricing')
          return rows.data.rows.some(
            (row) => row.category === 'pricing_objection',
          );
        if (h.kind === 'support')
          return rows.data.rows.some((row) => row.category === 'escalation');
        return rows.data.rows.some(
          (row) =>
            row.month === item.scope.month &&
            rows.data.rows.some(
              (prior) =>
                prior.customerId === row.customerId &&
                prior.month === item.scope.previousMonth &&
                row.activeUsers !== null &&
                prior.activeUsers !== null &&
                row.activeUsers < prior.activeUsers,
            ),
        );
      })
    );
  });
}
export function readCrossSourceAnswer(
  record: CrossSourceRecord,
  evidence: readonly InvestigationEvidence[],
) {
  const unavailable = {
    status: 'answer_unavailable' as const,
    error: 'Retained cross-source evidence is unavailable.',
  };
  if (
    !crossSourceRecordSchema.safeParse(record).success ||
    !investigationEvidenceSchema.array().safeParse(evidence).success ||
    record.status !== 'completed' ||
    evidence.length !== record.evidenceIds.length ||
    new Set(record.evidenceIds).size !== evidence.length ||
    !evidence.every((item, i) => item.evidenceId === record.evidenceIds[i])
  )
    return unavailable;
  const snapshot = evidence.find((item) => item.evidenceId === 'cross_parent');
  const parentSchema =
    snapshot?.content.record &&
    typeof snapshot.content.record === 'object' &&
    'kind' in snapshot.content.record &&
    snapshot.content.record.kind === 'mrr_decline'
      ? mrrDeclineRecordSchema
      : customerFollowUpRecordSchema;
  const parent = parentSchema.safeParse(snapshot?.content.record);
  if (
    !parent.success ||
    parent.data.investigationId !== record.parentInvestigationId ||
    parent.data.month !== record.month ||
    JSON.stringify(parent.data.permittedCustomerIds) !==
      JSON.stringify(record.permittedCustomerIds) ||
    !Array.isArray(snapshot?.content.evidence)
  )
    return unavailable;
  const losses = retainedLosses(
    parent.data,
    snapshot.content.evidence as InvestigationEvidence[],
  );
  if (
    !losses ||
    JSON.stringify(losses) !== JSON.stringify(record.customerIds) ||
    !validHypotheses(record.hypotheses, evidence)
  )
    return unavailable;
  const operational = evidence.filter(
    (item) => item.source === 'synthetic_operational_records',
  );
  const previous = new Date(`${record.month}T00:00:00Z`);
  previous.setUTCMonth(previous.getUTCMonth() - 1);
  const previousMonth = previous.toISOString().slice(0, 10);
  for (const item of operational) {
    const rows = operationalSnapshotSchema.safeParse({
      label: 'synthetic',
      rows: item.content.rows,
    });
    if (
      !rows.success ||
      item.type !== 'metric_query' ||
      item.integrity === 'invalid' ||
      !record.plan.steps.includes(item.scope.source as OperationalSource) ||
      item.evidenceId !== `ops_${item.scope.source}` ||
      item.scope.month !== record.month ||
      item.scope.previousMonth !== previousMonth ||
      JSON.stringify(item.scope.customerIds) !==
        JSON.stringify(record.customerIds) ||
      rows.data.rows.some(
        (row) =>
          !record.customerIds.includes(row.customerId) ||
          row.source !== item.scope.source ||
          row.month < previousMonth ||
          row.month > record.month,
      )
    )
      return unavailable;
    if (item.scope.source === 'usage') {
      const expected = compareCustomerUsage(
        rows.data.rows,
        record.customerIds,
        record.month,
      );
      const actual = item.content.usageComparisons;
      if (
        !Array.isArray(actual) ||
        actual.length !== expected.length ||
        expected.some((value, index) => {
          const row = actual[index];
          return (
            !row ||
            typeof row !== 'object' ||
            Object.keys(row).length !== Object.keys(value).length ||
            Object.entries(value).some(([key, field]) => row[key] !== field)
          );
        })
      )
        return unavailable;
    }
  }
  if (
    evidence
      .filter((item) => item.type === 'document_chunk')
      .some(
        (item) =>
          JSON.stringify(item.scope.customerIds) !==
            JSON.stringify(record.customerIds) ||
          item.integrity !== 'valid' ||
          typeof item.content.excerpt !== 'string' ||
          typeof item.content.documentId !== 'string',
      )
  )
    return unavailable;
  return {
    status: 'ok' as const,
    answer: {
      record,
      evidence,
      operationalEvidenceIds: operational.map((item) => item.evidenceId),
      parentEvidence: snapshot.content.evidence,
    },
  };
}
