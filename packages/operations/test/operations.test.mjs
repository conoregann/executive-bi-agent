import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createOperationalRepository,
  createPostgresOperationalRepository,
} from '../dist/index.js';
const snapshot = JSON.parse(
  readFileSync(
    new URL('../../../data/synthetic/operations-2026.json', import.meta.url),
  ),
);
test('synthetic scoped history preserves negative examples and freshness', async () => {
  const repo = createOperationalRepository(snapshot);
  const request = {
    month: '2026-08-01',
    customerIds: ['cust_london'],
    source: 'usage',
  };
  const result = await repo.read(request);
  assert.equal(result.status, 'ok');
  assert.deepEqual(
    result.rows.map((r) => r.activeUsers),
    [50, 10],
  );
  assert.equal(
    (await repo.read({ ...request, source: 'support' })).rows.length,
    0,
  );
  assert.deepEqual(
    (await repo.read({ ...request, customerIds: ['cust_riviera'] }))
      .staleCustomerIds,
    ['cust_riviera'],
  );
  assert.equal(
    (await repo.read({ ...request, customerIds: [] })).status,
    'invalid_request',
  );
  result.rows[0].note = 'changed';
  assert.notEqual((await repo.read(request)).rows[0].note, 'changed');
});
test('PostgreSQL parameters and returned scope are enforced without fixture fallback', async () => {
  const repo = createPostgresOperationalRepository({
    async query(sql, parameters) {
      assert.match(sql, /LIMIT 500/);
      assert.deepEqual(parameters, [
        'crm',
        ['cust_london'],
        '2026-07-01',
        '2026-08-01',
      ]);
      return {
        rows: [
          { payload: snapshot.rows.find((r) => r.customerId === 'cust_acme') },
        ],
      };
    },
  });
  assert.equal(
    (
      await repo.read({
        month: '2026-08-01',
        customerIds: ['cust_london'],
        source: 'crm',
      })
    ).status,
    'data_unavailable',
  );
});

test('monthly usage comparisons preserve missing observations and counterexamples', async () => {
  const { compareCustomerUsage } = await import('../dist/index.js');
  const result = compareCustomerUsage(
    snapshot.rows,
    ['cust_london', 'missing'],
    '2026-08-01',
  );
  assert.equal(result[0].activeUserChange, -40);
  assert.equal(result[1].activeUserChange, null);
});
