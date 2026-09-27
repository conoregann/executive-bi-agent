import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { Pool } from 'pg';

import {
  createPostgresMrrDeclineApi,
  createSyntheticMrrDeclineApi,
} from '../dist/index.js';
import { PostgresInvestigationStore } from '../dist/postgres-store.js';

test(
  'PostgreSQL retains a scoped investigation and evidence across API instances',
  {
    skip: !process.env.DATABASE_URL || !process.env.ANALYTICS_DATABASE_URL,
  },
  async () => {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 5_000,
    });
    const analyticsPool = new Pool({
      connectionString: process.env.ANALYTICS_DATABASE_URL,
    });
    const investigationId = `test_${randomUUID().replaceAll('-', '')}`;
    try {
      assert.equal(
        (await analyticsPool.query('SHOW default_transaction_read_only'))
          .rows[0].default_transaction_read_only,
        'on',
      );
      for (const sql of [
        'SELECT * FROM raw.source_snapshots',
        'SELECT * FROM app.investigations',
        'DELETE FROM analytics.subscription_month',
      ]) {
        await assert.rejects(analyticsPool.query(sql));
      }
      const first = await createPostgresMrrDeclineApi(
        analyticsPool,
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
      const fixture = await createSyntheticMrrDeclineApi();
      const fixtureResponse = await fixture.fetch(
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
      const fixtureCreated = await fixtureResponse.json();
      const fixtureAnswer = await fixture.fetch(
        new Request(
          `http://api.test/v1/investigations/${investigationId}/answer`,
          {
            headers: { authorization: `Bearer ${fixtureCreated.accessToken}` },
          },
        ),
      );
      const created = await response.json();
      const second = await createPostgresMrrDeclineApi(
        analyticsPool,
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
      const answerRequest = new Request(
        `http://api.test/v1/investigations/${investigationId}/answer`,
        { headers },
      );
      const originalAnswer = await first.fetch(answerRequest.clone());
      const retainedAnswer = await second.fetch(answerRequest);
      assert.equal(retainedAnswer.status, 200);
      const retainedBody = await retainedAnswer.json();
      assert.deepEqual(
        retainedBody.answer.chart.data,
        (await fixtureAnswer.json()).answer.chart.data,
      );
      assert.deepEqual(retainedBody, await originalAnswer.json());
      assert.deepEqual(retainedBody.answer.chart.permittedCustomerIds, [
        'cust_acme',
      ]);
      const chartEvidence = await second.fetch(
        new Request(
          `http://api.test/v1/investigations/${investigationId}/evidence/${retainedBody.answer.chart.sourceEvidenceId}`,
          { headers },
        ),
      );
      assert.equal(chartEvidence.status, 200);
      assert.deepEqual(
        retainedBody.answer.chart.data,
        (await chartEvidence.json()).evidence.content.rows,
      );
      const evidence = await second.fetch(
        new Request(
          `http://api.test/v1/investigations/${investigationId}/evidence/${created.record.evidenceIds[0]}`,
          { headers },
        ),
      );
      assert.equal(evidence.status, 200);
      const evidenceBody = await evidence.json();
      assert.equal(
        evidenceBody.evidence.evidenceId,
        created.record.evidenceIds[0],
      );
      assert.equal(evidenceBody.evidence.freshness, '2026-09-01T08:00:00Z');
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
      await analyticsPool.end();
      await pool.end();
    }
  },
);
