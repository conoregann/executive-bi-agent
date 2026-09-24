import { Pool } from 'pg';

import { createSyntheticMrrDeclineApi } from './index.js';
import { createMrrDeclineServer } from './http-server.js';
import { PostgresInvestigationStore } from './postgres-store.js';

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
await pool.query('SELECT 1 FROM app.investigations LIMIT 1');
const server = createMrrDeclineServer(
  await createSyntheticMrrDeclineApi(new PostgresInvestigationStore(pool)),
);
server.listen(port);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => void pool.end()));
}
