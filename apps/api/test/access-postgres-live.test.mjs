import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import {
  PostgresAccessStore,
  hashPassword,
  tokenHash,
} from '../dist/access.js';

test(
  'PostgreSQL sessions, grants, ownership and revocation use current rows',
  { skip: !process.env.DATABASE_URL },
  async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    const access = new PostgresAccessStore(client);
    const id = `synthetic_access_${randomUUID().replaceAll('-', '')}`;
    try {
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO app.users (user_id, username, password_hash, role) VALUES ($1,$2,$3,$4)',
        [id, id, await hashPassword('synthetic-password'), 'restricted'],
      );
      await client.query(
        'INSERT INTO app.user_customer_scopes (user_id, customer_id) VALUES ($1,$2)',
        [id, 'cust_acme'],
      );
      assert.equal((await access.credentials(id)).userId, id);
      assert.deepEqual((await access.user(id)).customerIds, ['cust_acme']);
      const hash = tokenHash('synthetic-session');
      await access.saveSession(hash, id, new Date(Date.now() + 60_000));
      assert.equal(await access.sessionUser(hash), id);
      await client.query(
        'INSERT INTO app.investigations (investigation_id, plan, access_token_hash) VALUES ($1,$2::jsonb,$3)',
        [id, '{}', 'a'.repeat(64)],
      );
      await access.bind(id, id);
      assert.equal(await access.owner(id), id);
      await client.query(
        'DELETE FROM app.user_customer_scopes WHERE user_id = $1',
        [id],
      );
      assert.deepEqual((await access.user(id)).customerIds, []);
      await client.query(
        'UPDATE app.users SET active = false WHERE user_id = $1',
        [id],
      );
      assert.equal((await access.user(id)).active, false);
      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  },
);
