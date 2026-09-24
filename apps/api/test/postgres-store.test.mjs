import assert from 'node:assert/strict';
import test from 'node:test';

import { PostgresInvestigationStore } from '../dist/postgres-store.js';

test('reserves once with bound parameters, finalizes once, and reads the stored record', async () => {
  const rows = new Map();
  const calls = [];
  const pool = {
    async query(sql, values) {
      calls.push([sql, values]);
      if (sql.startsWith('INSERT')) {
        if (rows.has(values[0])) return { rowCount: 0 };
        rows.set(values[0], {
          plan: JSON.parse(values[1]),
          access_token_hash: values[2],
          record: null,
          evidence: [],
        });
        return { rowCount: 1 };
      }
      if (sql.startsWith('UPDATE')) {
        const row = rows.get(values[0]);
        if (!row || row.record) return { rowCount: 0 };
        row.record = JSON.parse(values[1]);
        row.evidence = JSON.parse(values[2]);
        return { rowCount: 1 };
      }
      return { rows: rows.has(values[0]) ? [rows.get(values[0])] : [] };
    },
  };
  const store = new PostgresInvestigationStore(pool);
  const plan = {
    investigationId: 'one',
    steps: [
      'compare_mrr',
      'get_mrr_movement',
      'get_customer_mrr_movement',
      'breakdown_mrr_by_plan',
      'search_company_knowledge',
    ],
    maximumToolCalls: 5,
  };
  const record = {
    investigationId: 'one',
    kind: 'mrr_decline',
    month: '2026-08-01',
    permittedCustomerIds: [],
    plan,
    status: 'completed',
    evidenceIds: [],
    warnings: [],
    driverCustomerIds: [],
  };
  assert.equal(await store.reserve(plan, 'a'.repeat(64)), true);
  assert.equal(await store.reserve(plan, 'b'.repeat(64)), false);
  assert.equal((await store.get('one')).record, undefined);
  await store.finalize('one', record, []);
  assert.deepEqual((await store.get('one')).record, record);
  await assert.rejects(
    store.finalize('one', record, []),
    /cannot be finalized/,
  );
  assert.deepEqual(
    calls.map(([, values]) => values[0]),
    ['one', 'one', 'one', 'one', 'one', 'one'],
  );
  assert.ok(calls.every(([sql]) => sql.includes('$1')));
});
