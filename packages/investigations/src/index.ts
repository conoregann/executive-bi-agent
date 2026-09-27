import {
  runCrossSource,
  type CrossSourceDependencies,
} from './cross-source.js';
export { readCrossSourceAnswer } from './cross-source.js';
import type { CrossSourceRecord, CrossSourcePlan } from '@executive-bi/schemas';
import {
  customerFollowUpRequestSchema,
  customerFollowUpRecordSchema,
  type CustomerFollowUpRecord,
  type CustomerFollowUpPlan,
  countryFollowUpRequestSchema,
  countryFollowUpRecordSchema,
  countryMrrComparisonSchema,
  type CountryFollowUpRecord,
  type CountryFollowUpPlan,
} from '@executive-bi/schemas';
import { synthesizeMrrDeclineAnswer } from './answer.js';
import { synthesizeCustomerFollowUpAnswer } from './customer-answer.js';
export { synthesizeCustomerFollowUpAnswer } from './customer-answer.js';
import { synthesizeCountryFollowUpAnswer } from './country-answer.js';
export { synthesizeCountryFollowUpAnswer } from './country-answer.js';
export {
  synthesizeMrrDeclineAnswer,
  type InvestigationAnswerResult,
} from './answer.js';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const INVESTIGATION_DEFINITION_VERSION = '1.1.0';

export type InvestigationEvidence = {
  evidenceId: string;
  type: 'metric_query' | 'calculation' | 'document_chunk';
  source: string;
  sourceRef: string;
  observedAt: string;
  retrievedAt: string;
  scope: Record<string, unknown>;
  content: Record<string, unknown>;
  freshness: string;
  integrity: 'valid' | 'warning' | 'invalid';
};

type Evidence = InvestigationEvidence;

type ToolResult<T> = {
  status: 'ok' | 'invalid_request' | 'data_unavailable';
  value?: T;
  evidence: readonly Evidence[];
  warnings: readonly string[];
  error?: string;
};

type MrrComparison = {
  absoluteChangeEurCents: number;
};

type MrrMovement = {
  reconciles: boolean;
};

type CustomerMrrMovement = {
  rows: readonly {
    customerId: string;
    mrrChangeEurCents: number;
  }[];
};

type MrrBreakdown = {
  reconciles: boolean;
};

type KnowledgeSearch = {
  status: 'ok' | 'invalid_request';
  hits: readonly { evidence: Evidence }[];
  warnings: readonly string[];
};

export interface MrrDeclineTools {
  compareMrr(input: unknown): Promise<ToolResult<MrrComparison>>;
  getMrrMovement(input: unknown): Promise<ToolResult<MrrMovement>>;
  getCustomerMrrMovement(
    input: unknown,
  ): Promise<ToolResult<CustomerMrrMovement>>;
  breakdownMrr(input: unknown): Promise<ToolResult<MrrBreakdown>>;
  searchCompanyKnowledge(input: unknown): Promise<KnowledgeSearch>;
  getCustomerCountryContributions?(
    input: unknown,
  ): Promise<ToolResult<unknown>>;
  compareCountryMrr?(input: unknown): Promise<ToolResult<unknown>>;
}

export interface MrrDeclineInvestigationRequest {
  investigationId: string;
  month: string;
  permittedCustomerIds?: readonly string[];
}

export interface InvestigationPlan {
  investigationId: string;
  steps: readonly [
    'compare_mrr',
    'get_mrr_movement',
    'get_customer_mrr_movement',
    'breakdown_mrr_by_plan',
    'search_company_knowledge',
  ];
  maximumToolCalls: 5;
}

export interface InvestigationRecord {
  investigationId: string;
  kind: 'mrr_decline';
  month: string;
  permittedCustomerIds: readonly string[];
  plan: InvestigationPlan;
  status: 'completed' | 'blocked';
  evidenceIds: readonly string[];
  warnings: readonly string[];
  driverCustomerIds: readonly string[];
}

export interface MrrDeclineInvestigationResult {
  status: 'completed' | 'blocked' | 'invalid_request';
  record?: InvestigationRecord;
  warnings: readonly string[];
  error?: string;
  accessToken?: string;
}

export interface FollowUpContextResult {
  status: 'ok' | 'not_found' | 'forbidden' | 'scope_mismatch';
  record?: InvestigationRecord;
  error?: string;
}

export type StoredRecord =
  | CrossSourceRecord
  | InvestigationRecord
  | CountryFollowUpRecord
  | CustomerFollowUpRecord;
export type StoredPlan =
  | CrossSourcePlan
  | InvestigationPlan
  | CountryFollowUpPlan
  | CustomerFollowUpPlan;

export interface StoredInvestigation {
  plan: StoredPlan;
  accessTokenHash: string;
  record?: StoredRecord;
  evidence: readonly InvestigationEvidence[];
}

export interface InvestigationStore {
  reserve(plan: StoredPlan, accessTokenHash: string): Promise<boolean>;
  finalize(
    investigationId: string,
    record: StoredRecord,
    evidence: readonly InvestigationEvidence[],
  ): Promise<void>;
  get(investigationId: string): Promise<StoredInvestigation | undefined>;
}

export class InMemoryInvestigationStore implements InvestigationStore {
  private readonly records = new Map<string, StoredInvestigation>();

  async reserve(plan: StoredPlan, accessTokenHash: string): Promise<boolean> {
    if (this.records.has(plan.investigationId)) return false;
    this.records.set(plan.investigationId, {
      plan,
      accessTokenHash,
      evidence: [],
    });
    return true;
  }

  async finalize(
    investigationId: string,
    record: StoredRecord,
    evidence: readonly InvestigationEvidence[],
  ): Promise<void> {
    const existing = this.records.get(investigationId);
    if (!existing || existing.record)
      throw new Error('Investigation cannot be finalized.');
    this.records.set(investigationId, {
      ...existing,
      record,
      evidence: structuredClone(evidence),
    });
  }

  async get(investigationId: string): Promise<StoredInvestigation | undefined> {
    const stored = this.records.get(investigationId);
    return stored === undefined ? undefined : structuredClone(stored);
  }
}

/**
 * Runs the approved MRR-decline plan with injected controlled tools. The
 * orchestration layer keeps evidence-bearing structured analytics separate from
 * knowledge retrieval and never generates a causal explanation.
 */
export class MrrDeclineInvestigationService {
  constructor(
    private readonly tools: MrrDeclineTools,
    private readonly store: InvestigationStore = new InMemoryInvestigationStore(),
    private readonly crossSource?: CrossSourceDependencies,
  ) {}

  async start(input: unknown): Promise<MrrDeclineInvestigationResult> {
    const request = parseRequest(input);
    if (!request.ok) {
      return { status: 'invalid_request', warnings: [], error: request.error };
    }
    const plan = createPlan(request.value.investigationId);
    const accessToken = randomBytes(32).toString('base64url');
    if (!(await this.store.reserve(plan, hashToken(accessToken)))) {
      return {
        status: 'invalid_request',
        warnings: [],
        error: 'investigationId has already been used.',
      };
    }

    const metricInput = {
      month: request.value.month,
      ...(request.value.permittedCustomerIds.length === 0
        ? {}
        : { filters: { customerIds: request.value.permittedCustomerIds } }),
    };
    const comparison = await safeMetric(() =>
      this.tools.compareMrr(metricInput),
    );
    if (!isUsable(comparison)) {
      return this.block(
        request.value,
        plan,
        comparison,
        'mrr_comparison_unavailable',
        accessToken,
      );
    }

    const movement = await safeMetric(() =>
      this.tools.getMrrMovement(metricInput),
    );
    if (!isUsable(movement) || !movement.value.reconciles) {
      return this.block(
        request.value,
        plan,
        movement,
        'mrr_movement_not_reconciled',
        accessToken,
        comparison.evidence,
        comparison.warnings,
      );
    }

    const customerMovements = await safeMetric(() =>
      this.tools.getCustomerMrrMovement({
        ...metricInput,
        limit: 5,
      }),
    );
    if (!isUsable(customerMovements)) {
      return this.block(
        request.value,
        plan,
        customerMovements,
        'customer_mrr_movement_unavailable',
        accessToken,
        [...comparison.evidence, ...movement.evidence],
        [...comparison.warnings, ...movement.warnings],
      );
    }
    const driverCustomerIds = customerMovements.value.rows
      .filter((row) => row.mrrChangeEurCents < 0)
      .map((row) => row.customerId);

    const breakdown = await safeMetric(() =>
      this.tools.breakdownMrr({
        ...metricInput,
        groupBy: 'plan',
      }),
    );
    const evidence = [
      ...comparison.evidence,
      ...movement.evidence,
      ...customerMovements.evidence,
      ...breakdown.evidence,
    ];
    const warnings = [
      ...comparison.warnings,
      ...movement.warnings,
      ...customerMovements.warnings,
      ...breakdown.warnings,
    ];
    if (!isUsable(breakdown) || !breakdown.value.reconciles) {
      warnings.push('mrr_breakdown_incomplete');
    }

    let knowledge: KnowledgeSearch | undefined;
    if (driverCustomerIds.length > 0) {
      knowledge = await safeKnowledge(() =>
        this.tools.searchCompanyKnowledge({
          query: 'cancelled pricing payment support',
          customerIds: driverCustomerIds,
          limit: 5,
        }),
      );
      evidence.push(...knowledge.hits.map((hit) => hit.evidence));
      warnings.push(...knowledge.warnings);
      if (knowledge.status !== 'ok')
        warnings.push('knowledge_search_unavailable');
    } else {
      warnings.push('no_customer_loss_drivers');
    }

    const record = freezeRecord({
      investigationId: request.value.investigationId,
      kind: 'mrr_decline',
      month: request.value.month,
      permittedCustomerIds: request.value.permittedCustomerIds,
      plan,
      status: 'completed',
      evidenceIds: evidence.map((item) => item.evidenceId),
      warnings: unique(warnings),
      driverCustomerIds,
    });
    await this.store.finalize(record.investigationId, record, evidence);
    return {
      status: 'completed',
      record,
      warnings: record.warnings,
      accessToken,
    };
  }

  async getInvestigation(
    investigationId: string,
    accessToken: string,
  ): Promise<
    | {
        status: 'ok';
        record: StoredRecord;
        evidence: readonly InvestigationEvidence[];
      }
    | { status: 'not_found' | 'forbidden' }
  > {
    const stored = await this.store.get(investigationId);
    if (!stored?.record) return { status: 'not_found' };
    const suppliedHash = Buffer.from(hashToken(accessToken), 'hex');
    const expectedHash = Buffer.from(stored.accessTokenHash, 'hex');
    if (
      suppliedHash.length !== expectedHash.length ||
      !timingSafeEqual(suppliedHash, expectedHash)
    )
      return { status: 'forbidden' };
    return { status: 'ok', record: stored.record, evidence: stored.evidence };
  }

  async getFollowUpContext(
    investigationId: string,
    accessToken: string,
    month: string,
    permittedCustomerIds: readonly string[],
  ): Promise<FollowUpContextResult> {
    const found = await this.getInvestigation(investigationId, accessToken);
    if (found.status !== 'ok') {
      if (found.status === 'forbidden') return { status: 'forbidden' };
      return {
        status: 'not_found',
        error: 'No completed investigation exists for investigationId.',
      };
    }
    if (
      found.record.status !== 'completed' ||
      found.record.kind !== 'mrr_decline'
    )
      return { status: 'not_found' };
    if (
      found.record.month !== month ||
      !sameScope(found.record.permittedCustomerIds, permittedCustomerIds)
    )
      return { status: 'scope_mismatch' };
    return { status: 'ok', record: found.record };
  }

  async startCountryFollowUp(parentId: string, token: string, input: unknown) {
    const parent = await this.getInvestigation(parentId, token);
    if (parent.status !== 'ok') return { status: 'not_found' as const };
    if (
      parent.record.kind !== 'mrr_decline' ||
      parent.record.status !== 'completed'
    )
      return { status: 'invalid_parent' as const };
    const parsed = countryFollowUpRequestSchema.safeParse(input);
    if (!parsed.success)
      return {
        status: 'invalid_request' as const,
        error: parsed.error.message,
      };
    if (
      parsed.data.question !== undefined &&
      !/^break that down by country[.!?]?$/iu.test(parsed.data.question)
    )
      return {
        status: 'unsupported' as const,
        error:
          'Only “Break that down by country” is supported. Use a new investigation for other periods, metrics or filters.',
      };
    const parentAnswer = synthesizeMrrDeclineAnswer(
      parent.record,
      parent.evidence,
    );
    if (parentAnswer.status !== 'ok')
      return { status: 'invalid_parent' as const };
    const plan: CountryFollowUpPlan = {
      investigationId: parsed.data.investigationId,
      steps: [
        'breakdown_mrr_by_country_previous',
        'breakdown_mrr_by_country_current',
      ],
      maximumToolCalls: 2,
    };
    Object.freeze(plan.steps);
    Object.freeze(plan);
    const accessToken = randomBytes(32).toString('base64url');
    if (!(await this.store.reserve(plan, hashToken(accessToken))))
      return { status: 'conflict' as const };
    // Snapshot the parent's total queries with local IDs. Neither parent's evidence nor token is modified.
    const parentEvidence = parent.evidence
      .filter(
        (item) =>
          item.type === 'metric_query' &&
          item.scope.metric === 'mrr' &&
          item.scope.groupBy === undefined,
      )
      .map((item) => ({
        ...structuredClone(item),
        evidenceId: `parent_${item.evidenceId}`,
      }));
    const result = await safeMetric(() =>
      this.tools.compareCountryMrr
        ? this.tools.compareCountryMrr({
            month: parent.record.month,
            ...(parent.record.permittedCustomerIds.length
              ? { filters: { customerIds: parent.record.permittedCustomerIds } }
              : {}),
          })
        : Promise.resolve({
            status: 'data_unavailable',
            evidence: [],
            warnings: ['country_comparison_unavailable'],
          }),
    );
    const evidence = [...parentEvidence, ...result.evidence];
    const record: CountryFollowUpRecord = {
      investigationId: plan.investigationId,
      parentInvestigationId: parentId,
      kind: 'mrr_country_follow_up',
      month: parent.record.month,
      permittedCustomerIds: [...parent.record.permittedCustomerIds],
      plan,
      status: 'completed',
      evidenceIds: evidence.map((item) => item.evidenceId),
      warnings: [...result.warnings],
    };
    if (
      !isUsable(result) ||
      !countryMrrComparisonSchema.safeParse(result.value).success ||
      synthesizeCountryFollowUpAnswer(record, evidence).status !== 'ok'
    ) {
      record.status = 'blocked';
      record.warnings.push('country_comparison_unavailable_or_not_reconciled');
    }
    countryFollowUpRecordSchema.parse(record);
    Object.freeze(record.permittedCustomerIds);
    Object.freeze(record.evidenceIds);
    Object.freeze(record.warnings);
    Object.freeze(record);
    await this.store.finalize(record.investigationId, record, evidence);
    return {
      status: record.status,
      record,
      accessToken,
      warnings: record.warnings,
    };
  }

  async startCustomerFollowUp(parentId: string, token: string, input: unknown) {
    const parent = await this.getInvestigation(parentId, token);
    if (parent.status !== 'ok') return { status: 'not_found' as const };
    if (
      parent.record.kind !== 'mrr_country_follow_up' ||
      parent.record.status !== 'completed'
    )
      return { status: 'invalid_parent' as const };
    const parsed = customerFollowUpRequestSchema.safeParse(input);
    if (!parsed.success)
      return {
        status: 'invalid_request' as const,
        error: parsed.error.message,
      };
    const parentAnswer = synthesizeCountryFollowUpAnswer(
      parent.record,
      parent.evidence,
    );
    if (
      parentAnswer.status === 'ok' &&
      !parentAnswer.answer.comparison.rows.some(
        (row) => row.country === parsed.data.country,
      )
    )
      return {
        status: 'invalid_request' as const,
        error: 'Country must exist in the retained comparison.',
      };
    const plan: CustomerFollowUpPlan = {
      investigationId: parsed.data.investigationId,
      steps: ['get_customer_country_contributions'],
      maximumToolCalls: 1,
    };
    Object.freeze(plan.steps);
    Object.freeze(plan);
    const accessToken = randomBytes(32).toString('base64url');
    if (!(await this.store.reserve(plan, hashToken(accessToken))))
      return { status: 'conflict' as const };
    // Prefix copied evidence and its input links, preserving the country answer's provenance.
    const copied = parent.evidence.map((item) => ({
      ...structuredClone(item),
      evidenceId: `country_${item.evidenceId}`,
      content: {
        ...structuredClone(item.content),
        ...(Array.isArray(item.content.inputEvidenceIds)
          ? {
              inputEvidenceIds: item.content.inputEvidenceIds.map(
                (id) => `country_${id}`,
              ),
            }
          : {}),
      },
    }));
    const snapshotRecord = {
      ...structuredClone(parent.record),
      evidenceIds: copied.map((item) => item.evidenceId),
    };
    const now = new Date().toISOString();
    const snapshot: Evidence = {
      evidenceId: 'country_snapshot',
      type: 'calculation',
      source: 'investigation_snapshot',
      sourceRef: parentId,
      observedAt: parent.record.month,
      retrievedAt: now,
      freshness: now,
      integrity: 'valid',
      scope: { parentInvestigationId: parentId },
      content: {
        record: snapshotRecord,
        formula: 'immutable country comparison snapshot',
        inputEvidenceIds: copied.map((item) => item.evidenceId),
      },
    };
    const result =
      parentAnswer.status === 'ok'
        ? await safeMetric(() =>
            this.tools.getCustomerCountryContributions
              ? this.tools.getCustomerCountryContributions({
                  month: parent.record.month,
                  country: parsed.data.country,
                  ...(parent.record.permittedCustomerIds.length
                    ? {
                        filters: {
                          customerIds: parent.record.permittedCustomerIds,
                        },
                      }
                    : {}),
                })
              : Promise.resolve({
                  status: 'data_unavailable',
                  evidence: [],
                  warnings: ['customer_contributions_unavailable'],
                }),
          )
        : {
            status: 'data_unavailable' as const,
            evidence: [],
            warnings: ['parent_evidence_unavailable'],
          };
    const evidence = [...copied, snapshot, ...result.evidence];
    const record: CustomerFollowUpRecord = {
      investigationId: plan.investigationId,
      parentInvestigationId: parentId,
      kind: 'mrr_customer_follow_up',
      month: parent.record.month,
      country: parsed.data.country,
      permittedCustomerIds: [...parent.record.permittedCustomerIds],
      plan,
      status: 'completed',
      evidenceIds: evidence.map((item) => item.evidenceId),
      warnings: [...result.warnings],
    };
    if (
      !isUsable(result) ||
      synthesizeCustomerFollowUpAnswer(record, evidence).status !== 'ok'
    ) {
      record.status = 'blocked';
      record.warnings.push(
        'customer_contributions_unavailable_or_not_reconciled',
      );
    }
    customerFollowUpRecordSchema.parse(record);
    Object.freeze(record.permittedCustomerIds);
    Object.freeze(record.evidenceIds);
    Object.freeze(record.warnings);
    Object.freeze(record);
    await this.store.finalize(record.investigationId, record, evidence);
    return {
      status: record.status,
      record,
      accessToken,
      warnings: record.warnings,
    };
  }

  async startCrossSourceFollowUp(
    parentId: string,
    token: string,
    input: unknown,
  ) {
    const parent = await this.getInvestigation(parentId, token);
    if (parent.status !== 'ok') return { status: 'not_found' as const };
    return runCrossSource(
      parent.record,
      parent.evidence,
      input,
      this.store,
      this.crossSource,
    );
  }

  private async block(
    request: Required<MrrDeclineInvestigationRequest>,
    plan: InvestigationPlan,
    result: ToolResult<unknown>,
    warning: string,
    accessToken: string,
    priorEvidence: readonly Evidence[] = [],
    priorWarnings: readonly string[] = [],
  ): Promise<MrrDeclineInvestigationResult> {
    const record = freezeRecord({
      investigationId: request.investigationId,
      kind: 'mrr_decline',
      month: request.month,
      permittedCustomerIds: request.permittedCustomerIds,
      plan,
      status: 'blocked',
      evidenceIds: [...priorEvidence, ...result.evidence].map(
        (item) => item.evidenceId,
      ),
      warnings: unique([...priorWarnings, ...result.warnings, warning]),
      driverCustomerIds: [],
    });
    await this.store.finalize(record.investigationId, record, [
      ...priorEvidence,
      ...result.evidence,
    ]);
    return {
      status: 'blocked',
      record,
      warnings: record.warnings,
      error: result.error,
      accessToken,
    };
  }
}

function parseRequest(
  input: unknown,
):
  | { ok: true; value: Required<MrrDeclineInvestigationRequest> }
  | { ok: false; error: string } {
  if (!isRecord(input))
    return { ok: false, error: 'Request must be an object.' };
  if (
    !hasOnlyKeys(input, ['investigationId', 'month', 'permittedCustomerIds'])
  ) {
    return { ok: false, error: 'Request includes an unknown field.' };
  }
  if (
    typeof input.investigationId !== 'string' ||
    !/^[A-Za-z0-9_-]{1,100}$/u.test(input.investigationId)
  ) {
    return {
      ok: false,
      error: 'investigationId must be an opaque identifier.',
    };
  }
  if (typeof input.month !== 'string' || !isCalendarMonth(input.month)) {
    return { ok: false, error: 'month must be YYYY-MM-01.' };
  }
  if (
    input.permittedCustomerIds !== undefined &&
    (!Array.isArray(input.permittedCustomerIds) ||
      input.permittedCustomerIds.length === 0 ||
      input.permittedCustomerIds.length > 50 ||
      new Set(input.permittedCustomerIds).size !==
        input.permittedCustomerIds.length ||
      input.permittedCustomerIds.some(
        (value) => typeof value !== 'string' || value.trim() === '',
      ))
  ) {
    return {
      ok: false,
      error: 'permittedCustomerIds must contain 1–50 unique customer IDs.',
    };
  }
  return {
    ok: true,
    value: {
      investigationId: input.investigationId,
      month: input.month,
      permittedCustomerIds:
        input.permittedCustomerIds === undefined
          ? []
          : [...input.permittedCustomerIds],
    },
  };
}

function createPlan(investigationId: string): InvestigationPlan {
  return Object.freeze({
    investigationId,
    steps: Object.freeze([
      'compare_mrr',
      'get_mrr_movement',
      'get_customer_mrr_movement',
      'breakdown_mrr_by_plan',
      'search_company_knowledge',
    ]) as InvestigationPlan['steps'],
    maximumToolCalls: 5,
  });
}

function freezeRecord(record: InvestigationRecord): InvestigationRecord {
  return Object.freeze({
    ...record,
    permittedCustomerIds: Object.freeze([...record.permittedCustomerIds]),
    evidenceIds: Object.freeze([...record.evidenceIds]),
    warnings: Object.freeze([...record.warnings]),
    driverCustomerIds: Object.freeze([...record.driverCustomerIds]),
  });
}

function isUsable<T>(
  result: ToolResult<T>,
): result is ToolResult<T> & { value: T } {
  return (
    result.status === 'ok' &&
    result.value !== undefined &&
    result.evidence.every((evidence) => evidence.integrity !== 'invalid')
  );
}

async function safeMetric<T>(
  call: () => Promise<ToolResult<T>>,
): Promise<ToolResult<T>> {
  try {
    return await call();
  } catch {
    return {
      status: 'data_unavailable',
      evidence: [],
      warnings: ['tool_execution_failed'],
    };
  }
}

async function safeKnowledge(
  call: () => Promise<KnowledgeSearch>,
): Promise<KnowledgeSearch> {
  try {
    return await call();
  } catch {
    return {
      status: 'invalid_request',
      hits: [],
      warnings: ['knowledge_search_unavailable'],
    };
  }
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function sameScope(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    new Set(left).size === left.length &&
    new Set(right).size === right.length &&
    left.every((id) => right.includes(id))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isCalendarMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])-01$/u.test(value);
}
