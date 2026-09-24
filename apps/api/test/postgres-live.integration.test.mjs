import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { Pool } from 'pg';

import { createSyntheticMrrDeclineApi } from '../dist/index.js';
import { PostgresInvestigationStore } from '../dist/postgres-store.js';

test(
  'PostgreSQL retains a scoped investigation and evidence across API instances',
  {
    skip: !process.env.DATABASE_URL,
  },
  async () => {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 5_000,
    });
    const investigationId = `test_${randomUUID().replaceAll('-', '')}`;
    try {
      const first = await createSyntheticMrrDeclineApi(
        new PostgresInvestigationStore(pool),
      );
      const response = await first.fetch(
        new Request('http://api.test/v1/investigations/mrr-decline', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            investigationId,
            month: '2026-08-01',
            permittedCustomerIds: ['cust_acme'],
          }),
        }),
      );
      assert.equal(response.status, 201);
      const created = await response.json();
      const second = await createSyntheticMrrDeclineApi(
        new PostgresInvestigationStore(pool),
      );
      const headers = { authorization: `Bearer ${created.accessToken}` };
      const detail = await second.fetch(
        new Request(`http://api.test/v1/investigations/${investigationId}`, {
          headers,
        }),
      );
      assert.equal(detail.status, 200);
      assert.deepEqual((await detail.json()).record, created.record);
      const evidence = await second.fetch(
        new Request(
          `http://api.test/v1/investigations/${investigationId}/evidence/${created.record.evidenceIds[0]}`,
          { headers },
        ),
      );
      assert.equal(evidence.status, 200);
      assert.equal(
        (await evidence.json()).evidence.evidenceId,
        created.record.evidenceIds[0],
      );
      assert.equal(
        (
          await second.fetch(
            new Request(
              `http://api.test/v1/investigations/${investigationId}`,
              { headers: { authorization: `Bearer ${'x'.repeat(43)}` } },
            ),
          )
        ).status,
        404,
      );
    } finally {
      await pool.query(
        'DELETE FROM app.investigations WHERE investigation_id = $1',
        [investigationId],
      );
      await pool.end();
    }
  },
);
