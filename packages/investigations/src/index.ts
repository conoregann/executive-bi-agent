export const INVESTIGATION_DEFINITION_VERSION = '1.0.0';

type Evidence = {
  evidenceId: string;
  integrity: 'valid' | 'warning' | 'invalid';
};

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
}

export interface FollowUpContextResult {
  status: 'ok' | 'not_found';
  record?: InvestigationRecord;
  error?: string;
}

/**
 * Runs the approved MRR-decline plan with injected controlled tools. The
 * orchestration layer keeps evidence-bearing structured analytics separate from
 * knowledge retrieval and never generates a causal explanation.
 */
export class MrrDeclineInvestigationService {
  private readonly records = new Map<string, InvestigationRecord>();

  constructor(private readonly tools: MrrDeclineTools) {}

  async start(input: unknown): Promise<MrrDeclineInvestigationResult> {
    const request = parseRequest(input);
    if (!request.ok) {
      return { status: 'invalid_request', warnings: [], error: request.error };
    }
    if (this.records.has(request.value.investigationId)) {
      return {
        status: 'invalid_request',
        warnings: [],
        error: 'investigationId has already been used.',
      };
    }

    const plan = createPlan(request.value.investigationId);
    const metricInput = {
      month: request.value.month,
      ...(request.value.permittedCustomerIds.length === 0
        ? {}
        : { filters: { customerIds: request.value.permittedCustomerIds } }),
    };
    const comparison = await this.tools.compareMrr(metricInput);
    if (!isUsable(comparison)) {
      return this.block(
        request.value,
        plan,
        comparison,
        'mrr_comparison_unavailable',
      );
    }

    const movement = await this.tools.getMrrMovement(metricInput);
    if (!isUsable(movement) || !movement.value.reconciles) {
      return this.block(
        request.value,
        plan,
        movement,
        'mrr_movement_not_reconciled',
        comparison.evidence,
        comparison.warnings,
      );
    }

    const customerMovements = await this.tools.getCustomerMrrMovement({
      ...metricInput,
      limit: 5,
    });
    if (!isUsable(customerMovements)) {
      return this.block(
        request.value,
        plan,
        customerMovements,
        'customer_mrr_movement_unavailable',
        [...comparison.evidence, ...movement.evidence],
        [...comparison.warnings, ...movement.warnings],
      );
    }
    const driverCustomerIds = customerMovements.value.rows
      .filter((row) => row.mrrChangeEurCents < 0)
      .map((row) => row.customerId);

    const breakdown = await this.tools.breakdownMrr({
      ...metricInput,
      groupBy: 'plan',
    });
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
      knowledge = await this.tools.searchCompanyKnowledge({
        query: 'cancelled pricing payment support',
        customerIds: driverCustomerIds,
        limit: 5,
      });
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
    this.records.set(record.investigationId, record);
    return { status: 'completed', record, warnings: record.warnings };
  }

  getFollowUpContext(investigationId: string): FollowUpContextResult {
    const record = this.records.get(investigationId);
    if (!record) {
      return {
        status: 'not_found',
        error: 'No completed investigation exists for investigationId.',
      };
    }
    return { status: 'ok', record };
  }

  private block(
    request: Required<MrrDeclineInvestigationRequest>,
    plan: InvestigationPlan,
    result: ToolResult<unknown>,
    warning: string,
    priorEvidence: readonly Evidence[] = [],
    priorWarnings: readonly string[] = [],
  ): MrrDeclineInvestigationResult {
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
    this.records.set(record.investigationId, record);
    return {
      status: 'blocked',
      record,
      warnings: record.warnings,
      error: result.error,
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
      input.permittedCustomerIds.some(
        (value) => typeof value !== 'string' || value.trim() === '',
      ))
  ) {
    return {
      ok: false,
      error: 'permittedCustomerIds must be a non-empty list of customer IDs.',
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

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
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
