import { Pool } from 'pg';

import { createPostgresMrrDeclineApi } from './index.js';
import { createMrrDeclineServer } from './http-server.js';
import { PostgresInvestigationStore } from './persistence/postgres-investigation-store.js';

const port = Number.parseInt(process.env.PORT ?? '3001', 10);
const connectionString = process.env.DATABASE_URL;
if (!connectionString)
  throw new Error('DATABASE_URL is required for persistent investigations.');
const pool = new Pool({
  connectionString,
  max: 5,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
});
const analyticsConnectionString = process.env.ANALYTICS_DATABASE_URL;
if (!analyticsConnectionString)
  throw new Error(
    'ANALYTICS_DATABASE_URL is required for read-only analytics.',
  );
const analyticsPool = new Pool({
  connectionString: analyticsConnectionString,
  max: 5,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
  statement_timeout: 5_000,
});
await pool.query('SELECT 1 FROM app.investigations LIMIT 1');
const identity = await analyticsPool.query('SELECT current_user AS role');
if (identity.rows[0]?.role !== 'executive_bi_analytics')
  throw new Error(
    'Analytics connection must use the dedicated executive_bi_analytics role.',
  );
const server = createMrrDeclineServer(
  await createPostgresMrrDeclineApi(
    analyticsPool,
    new PostgresInvestigationStore(pool),
  ),
);
server.listen(port);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () =>
    server.close(() => {
      void pool.end();
      void analyticsPool.end();
    }),
  );
}
