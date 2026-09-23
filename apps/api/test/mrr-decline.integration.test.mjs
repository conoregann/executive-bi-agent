import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';

import {
  createMrrDeclineServer,
  createSyntheticMrrDeclineApi,
  loadSyntheticMrrDeclineDependencies,
} from '../dist/index.js';

const endpoint = 'http://api.test/v1/investigations/mrr-decline';

function request(body, options = {}) {
  return new Request(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...options.headers },
    body: JSON.stringify(body),
  });
}

test('loads only labeled synthetic fixtures and completes the scoped MRR-decline endpoint', async () => {
  const dependencies = await loadSyntheticMrrDeclineDependencies();
  assert.equal(dependencies.snapshot.rows.length, 10);
  assert.deepEqual(
    dependencies.documents.map((document) => document.documentId),
    ['payment-incident-281', 'august-sales-review'],
  );

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/investigations/mrr-decline`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        investigationId: 'august-decline',
        month: '2026-08-01',
        permittedCustomerIds: ['cust_churn', 'cust_contract'],
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.status, 'completed');
    assert.deepEqual(body.record.permittedCustomerIds, [
      'cust_churn',
      'cust_contract',
    ]);
    assert.deepEqual(body.record.driverCustomerIds, [
      'cust_churn',
      'cust_contract',
    ]);
    assert.equal(body.record.plan.maximumToolCalls, 5);
    assert.ok(body.record.evidenceIds.length >= 5);
  });
});

test('rejects malformed input before it can reach the investigation service', async () => {
  const api = await createSyntheticMrrDeclineApi();
  const response = await api.fetch(
    request({
      investigationId: 'invalid',
      month: '2026-08',
      extra: 'do not forward',
    }),
  );

  assert.equal(response.status, 400);
  assert.equal((await response.json()).status, 'invalid_request');

  const accepted = await api.fetch(
    request({ investigationId: 'invalid', month: '2026-08-01' }),
  );
  assert.equal(accepted.status, 201);
});

test('returns a contract-valid conflict for a reused investigation ID', async () => {
  const api = await createSyntheticMrrDeclineApi();
  const first = await api.fetch(
    request({ investigationId: 'same-id', month: '2026-08-01' }),
  );
  const duplicate = await api.fetch(
    request({ investigationId: 'same-id', month: '2026-08-01' }),
  );

  assert.equal(first.status, 201);
  assert.equal(duplicate.status, 409);
  const body = await duplicate.json();
  assert.equal(body.status, 'invalid_request');
  assert.match(body.error, /already been used/);
});

async function withServer(run) {
  const server = createMrrDeclineServer(await createSyntheticMrrDeclineApi());
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');

  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}
