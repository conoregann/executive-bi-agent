export const METRIC_DEFINITION_VERSION = '1.0.0';

const FILTER_FIELDS = [
  'plan',
  'country',
  'region',
  'industry',
  'companySize',
] as const;

type FilterField = (typeof FILTER_FIELDS)[number];
type BreakdownDimension = FilterField;

export interface SubscriptionMonthRecord {
  customerId: string;
  subscriptionId: string;
  month: string;
  mrrEurCents: number;
  isActiveAtMonthEnd: boolean;
  plan: string;
  country: string;
  region: string;
  industry: string;
  companySize: string;
}

export interface SubscriptionMonthRepository {
  getMonth(month: string): Promise<readonly SubscriptionMonthRecord[]>;
  freshness(): Promise<string>;
}

export interface MetricFilters {
  plan?: string;
  country?: string;
  region?: string;
  industry?: string;
  companySize?: string;
  customerIds?: readonly string[];
}

export interface Evidence {
  evidenceId: string;
  type: 'metric_query' | 'calculation';
  source: string;
  sourceRef: string;
  observedAt: string;
  retrievedAt: string;
  scope: Record<string, unknown>;
  content: Record<string, unknown>;
  freshness: string;
  integrity: 'valid' | 'warning' | 'invalid';
}

export interface MetricResult<T> {
  status: 'ok' | 'invalid_request' | 'data_unavailable';
  value?: T;
  evidence: readonly Evidence[];
  warnings: readonly string[];
  error?: string;
}

export interface MrrValue {
  month: string;
  mrrEurCents: number;
}

export interface MrrComparison {
  current: MrrValue;
  previous: MrrValue;
  absoluteChangeEurCents: number;
  percentChange: number | null;
}

export interface MrrMovement {
  currentMonth: string;
  previousMonth: string;
  priorMrrEurCents: number;
  currentMrrEurCents: number;
  newMrrEurCents: number;
  expansionMrrEurCents: number;
  contractionMrrEurCents: number;
  churnedMrrEurCents: number;
  reconciles: boolean;
}

export interface CustomerMrrMovementRow {
  customerId: string;
  previousMrrEurCents: number;
  currentMrrEurCents: number;
  mrrChangeEurCents: number;
  movement: 'new' | 'expansion' | 'contraction' | 'churn';
}

export interface CustomerMrrMovement {
  currentMonth: string;
  previousMonth: string;
  rows: readonly CustomerMrrMovementRow[];
}

export interface MrrBreakdownRow {
  dimensionValue: string;
  mrrEurCents: number;
}

export interface MrrBreakdown {
  month: string;
  groupBy: BreakdownDimension;
  totalMrrEurCents: number;
  groupedMrrEurCents: number;
  unassignedMrrEurCents: number;
  reconciles: boolean;
  rows: readonly MrrBreakdownRow[];
}

export interface MrrBreakdownChart {
  chartType: 'bar';
  title: string;
  xField: 'dimensionValue';
  yField: 'mrrEurCents';
  data: readonly MrrBreakdownRow[];
  sourceEvidenceId: string;
}

export interface TrustedMrrServiceOptions {
  now?: () => string;
  nextEvidenceId?: (prefix: 'metric' | 'calculation') => string;
}

type ValidatedRequest = { month: string; filters: MetricFilters };
type ValidatedBreakdownRequest = ValidatedRequest & {
  groupBy: BreakdownDimension;
};
type ValidatedCustomerMovementRequest = ValidatedRequest & { limit: number };

export class TrustedMrrService {
  private readonly now: () => string;
  private evidenceSequence = 0;
  private readonly nextEvidenceId: (prefix: 'metric' | 'calculation') => string;

  constructor(
    private readonly repository: SubscriptionMonthRepository,
    options: TrustedMrrServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.nextEvidenceId =
      options.nextEvidenceId ??
      ((prefix) => {
        this.evidenceSequence += 1;
        return `${prefix}_${this.evidenceSequence}`;
      });
  }

  async getMrr(input: unknown): Promise<MetricResult<MrrValue>> {
    const parsed = parseRequest(input);
    if (!parsed.ok) return invalidRequest(parsed.error);

    const data = await this.loadMonth(parsed.value);
    if (!data.ok) return data.result;

    const freshness = await this.repository.freshness();
    const value = {
      month: parsed.value.month,
      mrrEurCents: totalMrr(data.rows),
    };
    const evidence = this.metricEvidence(
      value,
      parsed.value.filters,
      freshness,
    );
    return { status: 'ok', value, evidence: [evidence], warnings: [] };
  }

  async compareMrr(input: unknown): Promise<MetricResult<MrrComparison>> {
    const parsed = parseRequest(input);
    if (!parsed.ok) return invalidRequest(parsed.error);

    const previousMonth = priorMonth(parsed.value.month);
    const [current, previous] = await Promise.all([
      this.loadMonth(parsed.value),
      this.loadMonth({ month: previousMonth, filters: parsed.value.filters }),
    ]);
    if (!current.ok) return current.result;
    if (!previous.ok) return previous.result;

    const freshness = await this.repository.freshness();
    const currentValue = {
      month: parsed.value.month,
      mrrEurCents: totalMrr(current.rows),
    };
    const previousValue = {
      month: previousMonth,
      mrrEurCents: totalMrr(previous.rows),
    };
    const absoluteChangeEurCents =
      currentValue.mrrEurCents - previousValue.mrrEurCents;
    const percentChange =
      previousValue.mrrEurCents === 0
        ? null
        : absoluteChangeEurCents / previousValue.mrrEurCents;
    const warnings =
      percentChange === null ? ['zero_comparison_denominator'] : [];
    const currentEvidence = this.metricEvidence(
      currentValue,
      parsed.value.filters,
      freshness,
    );
    const previousEvidence = this.metricEvidence(
      previousValue,
      parsed.value.filters,
      freshness,
    );
    const calculation = this.calculationEvidence(
      'mrr_change = current_mrr - previous_mrr; percent_change = change / previous_mrr',
      [currentEvidence.evidenceId, previousEvidence.evidenceId],
      { absoluteChangeEurCents, percentChange },
      freshness,
      percentChange === null ? 'warning' : 'valid',
    );

    return {
      status: 'ok',
      value: {
        current: currentValue,
        previous: previousValue,
        absoluteChangeEurCents,
        percentChange,
      },
      evidence: [currentEvidence, previousEvidence, calculation],
      warnings,
    };
  }

  async getMrrMovement(input: unknown): Promise<MetricResult<MrrMovement>> {
    const parsed = parseRequest(input);
    if (!parsed.ok) return invalidRequest(parsed.error);

    const previousMonth = priorMonth(parsed.value.month);
    const [current, previous] = await Promise.all([
      this.loadMonth(parsed.value),
      this.loadMonth({ month: previousMonth, filters: parsed.value.filters }),
    ]);
    if (!current.ok) return current.result;
    if (!previous.ok) return previous.result;

    const freshness = await this.repository.freshness();
    const movement = calculateMovement(
      previous.rows,
      current.rows,
      previousMonth,
      parsed.value.month,
    );
    const priorEvidence = this.metricEvidence(
      { month: previousMonth, mrrEurCents: movement.priorMrrEurCents },
      parsed.value.filters,
      freshness,
    );
    const currentEvidence = this.metricEvidence(
      { month: parsed.value.month, mrrEurCents: movement.currentMrrEurCents },
      parsed.value.filters,
      freshness,
    );
    const integrity = movement.reconciles ? 'valid' : 'invalid';
    const reconciliation = this.calculationEvidence(
      'current = prior + new + expansion - contraction - churned',
      [priorEvidence.evidenceId, currentEvidence.evidenceId],
      movement,
      freshness,
      integrity,
    );
    return {
      status: 'ok',
      value: movement,
      evidence: [priorEvidence, currentEvidence, reconciliation],
      warnings: movement.reconciles ? [] : ['mrr_movement_does_not_reconcile'],
    };
  }

  async getCustomerMrrMovement(
    input: unknown,
  ): Promise<MetricResult<CustomerMrrMovement>> {
    const parsed = parseCustomerMovementRequest(input);
    if (!parsed.ok) return invalidRequest(parsed.error);

    const previousMonth = priorMonth(parsed.value.month);
    const [current, previous] = await Promise.all([
      this.loadMonth(parsed.value),
      this.loadMonth({ month: previousMonth, filters: parsed.value.filters }),
    ]);
    if (!current.ok) return current.result;
    if (!previous.ok) return previous.result;

    const value: CustomerMrrMovement = {
      currentMonth: parsed.value.month,
      previousMonth,
      rows: calculateCustomerMovements(previous.rows, current.rows).slice(
        0,
        parsed.value.limit,
      ),
    };
    const freshness = await this.repository.freshness();
    const evidence: Evidence = {
      evidenceId: this.nextEvidenceId('metric'),
      type: 'metric_query',
      source: 'analytics.subscription_month',
      sourceRef: `mrr_movement:${parsed.value.month}:customers`,
      observedAt: parsed.value.month,
      retrievedAt: this.now(),
      scope: {
        month: parsed.value.month,
        filters: parsed.value.filters,
        limit: parsed.value.limit,
        metric: 'customer_mrr_movement',
        definitionVersion: METRIC_DEFINITION_VERSION,
      },
      content: { ...value },
      freshness,
      integrity: 'valid',
    };
    return { status: 'ok', value, evidence: [evidence], warnings: [] };
  }

  async breakdownMrr(input: unknown): Promise<MetricResult<MrrBreakdown>> {
    const parsed = parseBreakdownRequest(input);
    if (!parsed.ok) return invalidRequest(parsed.error);

    const data = await this.loadMonth(parsed.value);
    if (!data.ok) return data.result;

    const freshness = await this.repository.freshness();
    const breakdown = calculateBreakdown(data.rows, parsed.value);
    const integrity: Evidence['integrity'] = breakdown.reconciles
      ? 'valid'
      : 'warning';
    const evidence: Evidence = {
      evidenceId: this.nextEvidenceId('metric'),
      type: 'metric_query',
      source: 'analytics.subscription_month',
      sourceRef: `mrr:${parsed.value.month}:by:${parsed.value.groupBy}`,
      observedAt: parsed.value.month,
      retrievedAt: this.now(),
      scope: {
        month: parsed.value.month,
        filters: parsed.value.filters,
        groupBy: parsed.value.groupBy,
        metric: 'mrr',
        definitionVersion: METRIC_DEFINITION_VERSION,
      },
      content: { ...breakdown },
      freshness,
      integrity,
    };
    return {
      status: 'ok',
      value: breakdown,
      evidence: [evidence],
      warnings: breakdown.reconciles ? [] : ['missing_breakdown_dimension'],
    };
  }

  async createMrrBreakdownChart(
    input: unknown,
  ): Promise<MetricResult<MrrBreakdownChart>> {
    const breakdown = await this.breakdownMrr(input);
    if (breakdown.status !== 'ok' || !breakdown.value) {
      return {
        status: breakdown.status,
        evidence: breakdown.evidence,
        warnings: breakdown.warnings,
        error: breakdown.error,
      };
    }

    const sourceEvidence = breakdown.evidence[0];
    if (!sourceEvidence)
      return invalidRequest('Breakdown evidence is unavailable.');
    const freshness = await this.repository.freshness();
    const chart: MrrBreakdownChart = {
      chartType: 'bar',
      title: `MRR by ${breakdown.value.groupBy} for ${breakdown.value.month}`,
      xField: 'dimensionValue',
      yField: 'mrrEurCents',
      data: breakdown.value.rows,
      sourceEvidenceId: sourceEvidence.evidenceId,
    };
    const chartEvidence = this.calculationEvidence(
      'chart.data = mrr_breakdown.rows',
      [sourceEvidence.evidenceId],
      chart,
      freshness,
      sourceEvidence.integrity,
    );
    return {
      status: 'ok',
      value: chart,
      evidence: [...breakdown.evidence, chartEvidence],
      warnings: breakdown.warnings,
    };
  }

  private async loadMonth(
    request: ValidatedRequest,
  ): Promise<
    | { ok: true; rows: readonly SubscriptionMonthRecord[] }
    | { ok: false; result: MetricResult<never> }
  > {
    const rows = await this.repository.getMonth(request.month);
    if (rows.length === 0) {
      return {
        ok: false,
        result: {
          status: 'data_unavailable',
          evidence: [],
          warnings: ['month_not_available'],
          error: `No subscription-month snapshot is available for ${request.month}.`,
        },
      };
    }
    return {
      ok: true,
      rows: rows.filter((row) => matchesFilters(row, request.filters)),
    };
  }

  private metricEvidence(
    value: MrrValue,
    filters: MetricFilters,
    freshness: string,
  ): Evidence {
    return {
      evidenceId: this.nextEvidenceId('metric'),
      type: 'metric_query',
      source: 'analytics.subscription_month',
      sourceRef: `mrr:${value.month}`,
      observedAt: value.month,
      retrievedAt: this.now(),
      scope: {
        month: value.month,
        filters,
        metric: 'mrr',
        definitionVersion: METRIC_DEFINITION_VERSION,
      },
      content: { ...value },
      freshness,
      integrity: 'valid',
    };
  }

  private calculationEvidence(
    formula: string,
    inputEvidenceIds: readonly string[],
    content: object,
    freshness: string,
    integrity: Evidence['integrity'],
  ): Evidence {
    return {
      evidenceId: this.nextEvidenceId('calculation'),
      type: 'calculation',
      source: 'trusted_mrr_service',
      sourceRef: 'mrr_calculation',
      observedAt: this.now(),
      retrievedAt: this.now(),
      scope: { definitionVersion: METRIC_DEFINITION_VERSION },
      content: { formula, inputEvidenceIds, ...content },
      freshness,
      integrity,
    };
  }
}

function parseRequest(
  input: unknown,
): { ok: true; value: ValidatedRequest } | { ok: false; error: string } {
  if (!isRecord(input))
    return { ok: false, error: 'Request must be an object.' };
  if (!hasOnlyKeys(input, ['month', 'filters']))
    return { ok: false, error: 'Request includes an unknown field.' };
  if (typeof input.month !== 'string' || !isCalendarMonth(input.month)) {
    return {
      ok: false,
      error:
        'month must be the first UTC day of a calendar month (YYYY-MM-01).',
    };
  }
  const filters = parseFilters(input.filters);
  if (!filters.ok) return filters;
  return { ok: true, value: { month: input.month, filters: filters.value } };
}

function parseBreakdownRequest(
  input: unknown,
):
  | { ok: true; value: ValidatedBreakdownRequest }
  | { ok: false; error: string } {
  if (!isRecord(input))
    return { ok: false, error: 'Request must be an object.' };
  if (!hasOnlyKeys(input, ['month', 'filters', 'groupBy'])) {
    return { ok: false, error: 'Request includes an unknown field.' };
  }
  const request = parseRequest({ month: input.month, filters: input.filters });
  if (!request.ok) return request;
  if (
    typeof input.groupBy !== 'string' ||
    !FILTER_FIELDS.includes(input.groupBy as FilterField)
  ) {
    return {
      ok: false,
      error: 'groupBy must be an allowed MRR dimension.',
    };
  }
  return {
    ok: true,
    value: { ...request.value, groupBy: input.groupBy as BreakdownDimension },
  };
}

function parseCustomerMovementRequest(
  input: unknown,
):
  | { ok: true; value: ValidatedCustomerMovementRequest }
  | { ok: false; error: string } {
  if (!isRecord(input))
    return { ok: false, error: 'Request must be an object.' };
  if (!hasOnlyKeys(input, ['month', 'filters', 'limit'])) {
    return { ok: false, error: 'Request includes an unknown field.' };
  }
  const request = parseRequest({ month: input.month, filters: input.filters });
  if (!request.ok) return request;
  if (
    input.limit !== undefined &&
    (typeof input.limit !== 'number' ||
      !Number.isInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > 100)
  ) {
    return {
      ok: false,
      error: 'limit must be an integer from 1 to 100.',
    };
  }
  return {
    ok: true,
    value: {
      ...request.value,
      limit: input.limit === undefined ? 10 : input.limit,
    },
  };
}

function parseFilters(
  input: unknown,
): { ok: true; value: MetricFilters } | { ok: false; error: string } {
  if (input === undefined) return { ok: true, value: {} };
  if (
    !isRecord(input) ||
    !hasOnlyKeys(input, [...FILTER_FIELDS, 'customerIds'])
  ) {
    return { ok: false, error: 'filters contains an unsupported field.' };
  }
  for (const field of FILTER_FIELDS) {
    if (
      input[field] !== undefined &&
      (typeof input[field] !== 'string' || input[field].trim() === '')
    ) {
      return {
        ok: false,
        error: `filters.${field} must be a non-empty string.`,
      };
    }
  }
  if (
    input.customerIds !== undefined &&
    (!Array.isArray(input.customerIds) ||
      input.customerIds.length === 0 ||
      input.customerIds.some(
        (customerId) =>
          typeof customerId !== 'string' || customerId.trim() === '',
      ))
  ) {
    return {
      ok: false,
      error: 'filters.customerIds must be a non-empty list of customer IDs.',
    };
  }
  return { ok: true, value: input as MetricFilters };
}

function calculateMovement(
  previousRows: readonly SubscriptionMonthRecord[],
  currentRows: readonly SubscriptionMonthRecord[],
  previousMonth: string,
  currentMonth: string,
): MrrMovement {
  const previous = customerMrr(previousRows);
  const current = customerMrr(currentRows);
  const customerIds = new Set([...previous.keys(), ...current.keys()]);
  let newMrrEurCents = 0;
  let expansionMrrEurCents = 0;
  let contractionMrrEurCents = 0;
  let churnedMrrEurCents = 0;
  for (const customerId of customerIds) {
    const prior = previous.get(customerId) ?? 0;
    const now = current.get(customerId) ?? 0;
    if (prior === 0 && now > 0) newMrrEurCents += now;
    else if (prior > 0 && now > prior) expansionMrrEurCents += now - prior;
    else if (prior > 0 && now > 0 && now < prior)
      contractionMrrEurCents += prior - now;
    else if (prior > 0 && now === 0) churnedMrrEurCents += prior;
  }
  const priorMrrEurCents = sum(previous.values());
  const currentMrrEurCents = sum(current.values());
  const reconciles =
    currentMrrEurCents ===
    priorMrrEurCents +
      newMrrEurCents +
      expansionMrrEurCents -
      contractionMrrEurCents -
      churnedMrrEurCents;
  return {
    currentMonth,
    previousMonth,
    priorMrrEurCents,
    currentMrrEurCents,
    newMrrEurCents,
    expansionMrrEurCents,
    contractionMrrEurCents,
    churnedMrrEurCents,
    reconciles,
  };
}

function calculateCustomerMovements(
  previousRows: readonly SubscriptionMonthRecord[],
  currentRows: readonly SubscriptionMonthRecord[],
): readonly CustomerMrrMovementRow[] {
  const previous = customerMrr(previousRows);
  const current = customerMrr(currentRows);
  const customerIds = new Set([...previous.keys(), ...current.keys()]);
  const movements: CustomerMrrMovementRow[] = [];
  for (const customerId of customerIds) {
    const previousMrrEurCents = previous.get(customerId) ?? 0;
    const currentMrrEurCents = current.get(customerId) ?? 0;
    if (previousMrrEurCents === currentMrrEurCents) continue;
    const movement =
      previousMrrEurCents === 0
        ? 'new'
        : currentMrrEurCents === 0
          ? 'churn'
          : currentMrrEurCents > previousMrrEurCents
            ? 'expansion'
            : 'contraction';
    movements.push({
      customerId,
      previousMrrEurCents,
      currentMrrEurCents,
      mrrChangeEurCents: currentMrrEurCents - previousMrrEurCents,
      movement,
    });
  }
  return movements.sort((left, right) => {
    if (left.mrrChangeEurCents !== right.mrrChangeEurCents) {
      return left.mrrChangeEurCents - right.mrrChangeEurCents;
    }
    return left.customerId < right.customerId
      ? -1
      : left.customerId > right.customerId
        ? 1
        : 0;
  });
}

function customerMrr(
  rows: readonly SubscriptionMonthRecord[],
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (row.isActiveAtMonthEnd)
      totals.set(
        row.customerId,
        (totals.get(row.customerId) ?? 0) + row.mrrEurCents,
      );
    else if (!totals.has(row.customerId)) totals.set(row.customerId, 0);
  }
  return totals;
}

function totalMrr(rows: readonly SubscriptionMonthRecord[]): number {
  return sum(customerMrr(rows).values());
}

function calculateBreakdown(
  rows: readonly SubscriptionMonthRecord[],
  request: ValidatedBreakdownRequest,
): MrrBreakdown {
  const totals = new Map<string, number>();
  let unassignedMrrEurCents = 0;
  for (const row of rows) {
    if (!row.isActiveAtMonthEnd) continue;
    const dimensionValue = row[request.groupBy];
    if (dimensionValue.trim() === '') {
      unassignedMrrEurCents += row.mrrEurCents;
      continue;
    }
    totals.set(
      dimensionValue,
      (totals.get(dimensionValue) ?? 0) + row.mrrEurCents,
    );
  }
  const rowsByValue = [...totals].map(([dimensionValue, mrrEurCents]) => ({
    dimensionValue,
    mrrEurCents,
  }));
  rowsByValue.sort((left, right) => {
    if (right.mrrEurCents !== left.mrrEurCents)
      return right.mrrEurCents - left.mrrEurCents;
    return left.dimensionValue < right.dimensionValue
      ? -1
      : left.dimensionValue > right.dimensionValue
        ? 1
        : 0;
  });
  const groupedMrrEurCents = sum(totals.values());
  const totalMrrEurCents = totalMrr(rows);
  return {
    month: request.month,
    groupBy: request.groupBy,
    totalMrrEurCents,
    groupedMrrEurCents,
    unassignedMrrEurCents,
    reconciles: totalMrrEurCents === groupedMrrEurCents,
    rows: rowsByValue,
  };
}

function matchesFilters(
  row: SubscriptionMonthRecord,
  filters: MetricFilters,
): boolean {
  return (
    (!filters.plan || row.plan === filters.plan) &&
    (!filters.country || row.country === filters.country) &&
    (!filters.region || row.region === filters.region) &&
    (!filters.industry || row.industry === filters.industry) &&
    (!filters.companySize || row.companySize === filters.companySize) &&
    (!filters.customerIds || filters.customerIds.includes(row.customerId))
  );
}

function priorMonth(month: string): string {
  const [yearText, monthText] = month.split('-');
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  return `${monthNumber === 1 ? year - 1 : year}-${String(monthNumber === 1 ? 12 : monthNumber - 1).padStart(2, '0')}-01`;
}

function isCalendarMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])-01$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function invalidRequest<T>(error: string): MetricResult<T> {
  return { status: 'invalid_request', evidence: [], warnings: [], error };
}

function sum(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}
