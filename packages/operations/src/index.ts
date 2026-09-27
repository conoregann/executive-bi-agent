import {
  operationalSnapshotSchema,
  operationalRequestSchema,
  type OperationalRecord,
  type OperationalSource,
} from '@executive-bi/schemas';
export interface OperationalQueryClient {
  query(sql: string, parameters: unknown[]): Promise<{ rows: unknown[] }>;
}
export type OperationalResult = {
  status: 'ok' | 'invalid_request' | 'data_unavailable';
  rows: readonly OperationalRecord[];
  missingCustomerIds: readonly string[];
  staleCustomerIds: readonly string[];
  queryId: string;
};
export interface OperationalRepository {
  read(input: unknown): Promise<OperationalResult>;
}
function previousMonth(month: string): string {
  const date = new Date(`${month}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 10);
}
let sequence = 0;
export function createOperationalRepository(
  snapshot: unknown,
): OperationalRepository {
  const parsed = operationalSnapshotSchema.parse(snapshot);
  return createRepository(async (source, customers, previous, month) =>
    parsed.rows.filter(
      (row) =>
        row.source === source &&
        customers.includes(row.customerId) &&
        row.month >= previous &&
        row.month <= month,
    ),
  );
}
export function createPostgresOperationalRepository(
  client: OperationalQueryClient,
): OperationalRepository {
  return createRepository(async (source, customers, previous, month) => {
    const result = await client.query(
      `SELECT record AS payload FROM analytics.operational_records WHERE source = $1 AND customer_id = ANY($2::text[]) AND month >= $3::date AND month <= $4::date ORDER BY record_id LIMIT 500`,
      [source, customers, previous, month],
    );
    return result.rows.map((row) => (row as { payload: unknown }).payload);
  });
}
function createRepository(
  read: (
    source: OperationalSource,
    customers: readonly string[],
    previous: string,
    month: string,
  ) => Promise<unknown[]>,
): OperationalRepository {
  return {
    async read(input) {
      const queryId = `synthetic_ops_query_${++sequence}`;
      const request = operationalRequestSchema.safeParse(input);
      if (!request.success)
        return {
          status: 'invalid_request',
          rows: [],
          missingCustomerIds: [],
          staleCustomerIds: [],
          queryId,
        };
      const { source, customerIds, month } = request.data;
      const previous = previousMonth(month);
      try {
        const rows = operationalSnapshotSchema.parse({
          label: 'synthetic',
          rows: await read(source, customerIds, previous, month),
        }).rows;
        if (
          rows.length >= 500 ||
          rows.some(
            (row) =>
              row.source !== source ||
              !customerIds.includes(row.customerId) ||
              row.month < previous ||
              row.month > month,
          )
        )
          throw new Error('Invalid source scope');
        return {
          status: 'ok',
          rows: structuredClone(rows),
          queryId,
          missingCustomerIds: customerIds.filter(
            (id) =>
              !rows.some(
                (row) =>
                  row.customerId === id &&
                  (source !== 'usage' || row.month === month),
              ) ||
              (source === 'usage' &&
                !rows.some(
                  (row) => row.customerId === id && row.month === previous,
                )),
          ),
          staleCustomerIds: customerIds.filter((id) =>
            rows.some(
              (row) =>
                row.customerId === id && row.freshness < `${month}T00:00:00Z`,
            ),
          ),
        };
      } catch {
        return {
          status: 'data_unavailable',
          rows: [],
          queryId,
          missingCustomerIds: customerIds,
          staleCustomerIds: [],
        };
      }
    },
  };
}
