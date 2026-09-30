import { Pool } from 'pg';
import { hashPassword } from '../dist/access.js';

const [username, role, ...customerIds] = process.argv.slice(2);
if (
  !/^[A-Za-z0-9_-]{1,100}$/u.test(username ?? '') ||
  !['admin', 'restricted'].includes(role) ||
  (role === 'restricted' && !customerIds.length) ||
  (role === 'admin' && customerIds.length) ||
  customerIds.some((id) => !/^[A-Za-z0-9_-]{1,100}$/u.test(id)) ||
  new Set(customerIds).size !== customerIds.length ||
  !process.env.BI_USER_PASSWORD ||
  !process.env.DATABASE_URL
) {
  throw new Error(
    'Usage: BI_USER_PASSWORD=... DATABASE_URL=... pnpm --filter @executive-bi/api user:add -- <username> <admin|restricted> [customer IDs]',
  );
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query(
    'INSERT INTO app.users (user_id, username, password_hash, role) VALUES ($1,$1,$2,$3)',
    [username, await hashPassword(process.env.BI_USER_PASSWORD), role],
  );
  for (const customerId of customerIds)
    await client.query(
      'INSERT INTO app.user_customer_scopes (user_id, customer_id) VALUES ($1,$2)',
      [username, customerId],
    );
  await client.query('COMMIT');
  console.log(`Provisioned ${role} user ${username}.`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
