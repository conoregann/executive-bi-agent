export interface SubscriptionMonthRecord {
  customerId: string;
  subscriptionId: string;
  month: string;
  mrrEurCents: number;
  isActiveAtMonthEnd: boolean;
  cancelledAt: string | null;
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

export interface SubscriptionMonthSnapshot {
  freshness: string;
  rows: readonly SubscriptionMonthRecord[];
}

/**
 * Creates a deterministic, read-only adapter for metric-ready synthetic data.
 * The adapter rejects malformed source rows instead of allowing a metric layer
 * to calculate from an ambiguous snapshot.
 */
export function createSubscriptionMonthRepository(
  snapshot: SubscriptionMonthSnapshot,
): SubscriptionMonthRepository {
  if (!isIsoTimestamp(snapshot.freshness)) {
    throw new Error('Snapshot freshness must be an ISO timestamp.');
  }

  const rowsByMonth = new Map<string, readonly SubscriptionMonthRecord[]>();
  const seenKeys = new Set<string>();
  for (const row of snapshot.rows) {
    validateRow(row);
    const key = `${row.month}:${row.subscriptionId}`;
    if (seenKeys.has(key)) {
      throw new Error(`Duplicate subscription-month row: ${key}.`);
    }
    seenKeys.add(key);
    const rows = rowsByMonth.get(row.month) ?? [];
    rowsByMonth.set(row.month, [...rows, freezeRow(row)]);
  }
  for (const [month, rows] of rowsByMonth) {
    rowsByMonth.set(month, Object.freeze(rows));
  }

  return {
    async getMonth(month) {
      if (!isCalendarMonth(month)) return [];
      return rowsByMonth.get(month) ?? [];
    },
    async freshness() {
      return snapshot.freshness;
    },
  };
}

function validateRow(row: SubscriptionMonthRecord): void {
  for (const field of [
    row.customerId,
    row.subscriptionId,
    row.plan,
    row.country,
    row.region,
    row.industry,
    row.companySize,
  ]) {
    if (typeof field !== 'string' || field.length === 0) {
      throw new Error(
        'Subscription-month identity and dimensions must be non-empty strings.',
      );
    }
  }
  if (!isCalendarMonth(row.month)) {
    throw new Error(`Invalid subscription-month value: ${row.month}.`);
  }
  if (!Number.isSafeInteger(row.mrrEurCents) || row.mrrEurCents < 0) {
    throw new Error('MRR must be a non-negative integer number of EUR cents.');
  }
  if (typeof row.isActiveAtMonthEnd !== 'boolean') {
    throw new Error('isActiveAtMonthEnd must be boolean.');
  }
  if (row.isActiveAtMonthEnd !== row.mrrEurCents > 0) {
    throw new Error(
      'Active subscriptions must have positive MRR; inactive subscriptions must have zero MRR.',
    );
  }
  if (row.cancelledAt !== null && !isIsoTimestamp(row.cancelledAt)) {
    throw new Error('cancelledAt must be null or an ISO timestamp.');
  }
}

function freezeRow(row: SubscriptionMonthRecord): SubscriptionMonthRecord {
  return Object.freeze({ ...row });
}

function isCalendarMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])-01$/.test(value);
}

function isIsoTimestamp(value: string): boolean {
  return !Number.isNaN(Date.parse(value)) && value.includes('T');
}
