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

export interface PostgresQueryClient {
  query(
    sql: string,
    parameters?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
}

const SUBSCRIPTION_MONTH_SQL = `
SELECT
  customer_id AS "customerId",
  subscription_id AS "subscriptionId",
  month::text AS month,
  mrr_eur_cents::text AS "mrrEurCents",
  is_active_at_month_end AS "isActiveAtMonthEnd",
  CASE WHEN cancelled_at IS NULL THEN NULL ELSE to_char(cancelled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') END AS "cancelledAt",
  plan,
  country,
  region,
  industry,
  company_size AS "companySize"
FROM analytics.subscription_month
WHERE month = $1::date
ORDER BY customer_id, subscription_id`;

const SUBSCRIPTION_MONTH_FRESHNESS_SQL = `
SELECT to_char(freshness AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS freshness
FROM analytics.subscription_month_freshness`;

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

/** Reads only the approved metric-ready views through an injected PostgreSQL client. */
export function createPostgresSubscriptionMonthRepository(
  client: PostgresQueryClient,
): SubscriptionMonthRepository {
  return {
    async getMonth(month) {
      if (!isCalendarMonth(month)) return [];

      const result = await client.query(SUBSCRIPTION_MONTH_SQL, [month]);
      const seenKeys = new Set<string>();
      const rows = result.rows.map((databaseRow) => {
        const row = parsePostgresRow(databaseRow);
        if (row.month !== month) {
          throw new Error(
            'PostgreSQL returned a row outside the requested month.',
          );
        }
        const key = `${row.month}:${row.subscriptionId}`;
        if (seenKeys.has(key)) {
          throw new Error(`Duplicate subscription-month row: ${key}.`);
        }
        seenKeys.add(key);
        return freezeRow(row);
      });
      return Object.freeze(rows);
    },
    async freshness() {
      const result = await client.query(SUBSCRIPTION_MONTH_FRESHNESS_SQL);
      if (result.rows.length !== 1) {
        throw new Error(
          'Expected exactly one subscription-month freshness row.',
        );
      }
      const freshness = result.rows[0]?.freshness;
      if (typeof freshness !== 'string' || !isIsoTimestamp(freshness)) {
        throw new Error('PostgreSQL returned invalid snapshot freshness.');
      }
      return freshness;
    },
  };
}

function parsePostgresRow(
  value: Record<string, unknown>,
): SubscriptionMonthRecord {
  const cents = value.mrrEurCents;
  if (typeof cents !== 'string' || !/^(0|[1-9]\d*)$/u.test(cents)) {
    throw new Error('PostgreSQL returned invalid MRR cents.');
  }
  const mrrEurCents = Number(cents);
  const row = {
    customerId: value.customerId,
    subscriptionId: value.subscriptionId,
    month: value.month,
    mrrEurCents,
    isActiveAtMonthEnd: value.isActiveAtMonthEnd,
    cancelledAt: value.cancelledAt,
    plan: value.plan,
    country: value.country,
    region: value.region,
    industry: value.industry,
    companySize: value.companySize,
  };
  validateRow(row);
  return row;
}

function validateRow(row: unknown): asserts row is SubscriptionMonthRecord {
  if (!isRecord(row)) {
    throw new Error('Subscription-month row must be an object.');
  }
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
  if (
    typeof row.mrrEurCents !== 'number' ||
    !Number.isSafeInteger(row.mrrEurCents) ||
    row.mrrEurCents < 0
  ) {
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

function isCalendarMonth(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])-01$/.test(value);
}

function isIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.includes('T') &&
    !Number.isNaN(Date.parse(value))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
