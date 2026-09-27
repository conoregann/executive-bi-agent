import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { InMemoryInvestigationStore } from '@executive-bi/investigations';
import {
  createMrrDeclineServer,
  createPostgresMrrDeclineApi,
} from '../dist/index.js';

test('analytics failure returns a safe HTTP failure without fixture fallback', async () => {
  const api = await createPostgresMrrDeclineApi(
    {
      async query() {
        throw new Error('secret database credential');
      },
    },
    new InMemoryInvestigationStore(),
  );
  const server = createMrrDeclineServer(api);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/v1/investigations/mrr-decline`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          investigationId: 'synthetic_database_failure',
          month: '2026-08-01',
        }),
      },
    );
    assert.equal(response.status, 422);
    assert.doesNotMatch(
      await response.text(),
      /secret database credential|420000|250000/,
    );
  } finally {
    server.close();
    await once(server, 'close');
  }
});
