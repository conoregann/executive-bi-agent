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

test(
  'PostgreSQL retains linked country follow-ups and evidence across service restart',
  { skip: !process.env.DATABASE_URL || !process.env.ANALYTICS_DATABASE_URL },
  async () => {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 5000,
    });
    const analytics = new Pool({
      connectionString: process.env.ANALYTICS_DATABASE_URL,
      connectionTimeoutMillis: 5000,
    });
    const parentId = `synthetic_${randomUUID().replaceAll('-', '')}`;
    const childId = `synthetic_${randomUUID().replaceAll('-', '')}`;
    const request = (id, token, body) =>
      new Request(`http://api.test/v1/investigations/${id}`, {
        method: body ? 'POST' : 'GET',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    try {
      const first = await createPostgresMrrDeclineApi(
        analytics,
        new PostgresInvestigationStore(pool),
      );
      const created = await first.fetch(
        request('mrr-decline', undefined, {
          investigationId: parentId,
          month: '2026-08-01',
          permittedCustomerIds: ['cust_acme'],
        }),
      );
      assert.equal(created.status, 201);
      const parent = await created.json();
      const followResponse = await first.fetch(
        request(`${parentId}/country-follow-ups`, parent.accessToken, {
          investigationId: childId,
          action: 'breakdown_mrr_by_country',
        }),
      );
      assert.equal(followResponse.status, 201);
      const follow = await followResponse.json();
      const original = await (
        await first.fetch(request(`${childId}/answer`, follow.accessToken))
      ).json();
      const second = await createPostgresMrrDeclineApi(
        analytics,
        new PostgresInvestigationStore(pool),
      );
      const retained = await second.fetch(
        request(`${childId}/answer`, follow.accessToken),
      );
      assert.equal(retained.status, 200);
      assert.deepEqual(await retained.json(), original);
      assert.equal(original.answer.comparison.mrrChangeEurCents, -240000);
      assert.deepEqual(original.answer.permittedCustomerIds, ['cust_acme']);
      for (const id of original.answer.sourceEvidenceIds)
        assert.equal(
          (
            await second.fetch(
              request(`${childId}/evidence/${id}`, follow.accessToken),
            )
          ).status,
          200,
        );
      assert.deepEqual(
        (
          await (
            await second.fetch(request(parentId, parent.accessToken))
          ).json()
        ).record,
        parent.record,
      );
      assert.equal(
        (await second.fetch(request(`${childId}/answer`, parent.accessToken)))
          .status,
        404,
      );
    } finally {
      await pool.query(
        'DELETE FROM app.investigations WHERE investigation_id = ANY($1::text[])',
        [[parentId, childId]],
      );
      await analytics.end();
      await pool.end();
    }
  },
);

test(
  'synthetic PostgreSQL retains account drill-downs across restart without analytics access',
  { skip: !process.env.DATABASE_URL || !process.env.ANALYTICS_DATABASE_URL },
  async () => {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 5000,
    });
    const analytics = new Pool({
      connectionString: process.env.ANALYTICS_DATABASE_URL,
      connectionTimeoutMillis: 5000,
    });
    const parentId = `synthetic_${randomUUID().replaceAll('-', '')}`;
    const countryId = `synthetic_${randomUUID().replaceAll('-', '')}`;
    const childId = `synthetic_${randomUUID().replaceAll('-', '')}`;
    const request = (id, token, body) =>
      new Request(`http://api.test/v1/investigations/${id}`, {
        method: body ? 'POST' : 'GET',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    try {
      const first = await createPostgresMrrDeclineApi(
        analytics,
        new PostgresInvestigationStore(pool),
      );
      const created = await first.fetch(
        request('mrr-decline', undefined, {
          investigationId: parentId,
          month: '2026-08-01',
          permittedCustomerIds: ['cust_acme'],
        }),
      );
      assert.equal(created.status, 201);
      const parent = await created.json();
      const followResponse = await first.fetch(
        request(`${parentId}/country-follow-ups`, parent.accessToken, {
          investigationId: countryId,
          action: 'breakdown_mrr_by_country',
        }),
      );
      assert.equal(followResponse.status, 201);
      const country = await followResponse.json();
      const accounts = await first.fetch(
        request(`${countryId}/customer-follow-ups`, country.accessToken, {
          investigationId: childId,
          country: 'DE',
        }),
      );
      assert.equal(accounts.status, 201);
      const follow = await accounts.json();
      const original = await (
        await first.fetch(request(`${childId}/answer`, follow.accessToken))
      ).json();
      const second = await createPostgresMrrDeclineApi(
        {
          query: async () => {
            throw new Error('analytics offline');
          },
        },
        new PostgresInvestigationStore(pool),
      );
      const retained = await second.fetch(
        request(`${childId}/answer`, follow.accessToken),
      );
      assert.equal(retained.status, 200);
      assert.deepEqual(await retained.json(), original);
      assert.equal(original.answer.contributions.mrrChangeEurCents, -240000);
      assert.deepEqual(original.answer.permittedCustomerIds, ['cust_acme']);
      for (const id of original.answer.sourceEvidenceIds)
        assert.equal(
          (
            await second.fetch(
              request(`${childId}/evidence/${id}`, follow.accessToken),
            )
          ).status,
          200,
        );
      assert.deepEqual(
        (
          await (
            await second.fetch(request(parentId, parent.accessToken))
          ).json()
        ).record,
        parent.record,
      );
      assert.equal(
        (await second.fetch(request(`${childId}/answer`, parent.accessToken)))
          .status,
        404,
      );
    } finally {
      await pool.query(
        'DELETE FROM app.investigations WHERE investigation_id = ANY($1::text[])',
        [[parentId, countryId, childId]],
      );
      await analytics.end();
      await pool.end();
    }
  },
);

test(
  'PostgreSQL cross-source evidence is readable after restart without analytics',
  { skip: !process.env.DATABASE_URL || !process.env.ANALYTICS_DATABASE_URL },
  async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const analytics = new Pool({
      connectionString: process.env.ANALYTICS_DATABASE_URL,
    });
    const id = `test_cross_${randomUUID().replaceAll('-', '')}`,
      childId = `${id}_child`;
    const request = (path, body, token) =>
      new Request(`http://api.test/v1/investigations/${path}`, {
        method: body ? 'POST' : 'GET',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    try {
      const api = await createPostgresMrrDeclineApi(
        analytics,
        new PostgresInvestigationStore(pool),
      );
      const parent = await (
        await api.fetch(
          request('mrr-decline', {
            investigationId: id,
            month: '2026-08-01',
            permittedCustomerIds: ['cust_acme'],
          }),
        )
      ).json();
      const created = await (
        await api.fetch(
          request(
            `${id}/cross-source-follow-ups`,
            {
              investigationId: childId,
              question: 'Investigate revenue losses across sources',
            },
            parent.accessToken,
          ),
        )
      ).json();
      assert.equal(created.status, 'completed');
      const original = await (
        await api.fetch(
          request(`${childId}/answer`, undefined, created.accessToken),
        )
      ).json();
      assert.equal(original.status, 'ok');
      assert.ok(
        original.answer.evidence
          .find((e) => e.evidenceId === 'ops_support')
          .content.rows.some((row) => row.category === 'escalation'),
      );
      await analytics.end();
      const restarted = await createPostgresMrrDeclineApi(
        {
          async query() {
            throw Error('Analytics unavailable after restart');
          },
        },
        new PostgresInvestigationStore(pool),
      );
      assert.deepEqual(
        await (
          await restarted.fetch(
            request(`${childId}/answer`, undefined, created.accessToken),
          )
        ).json(),
        original,
      );
      assert.equal(
        (
          await restarted.fetch(
            request(`${childId}/answer`, undefined, parent.accessToken),
          )
        ).status,
        404,
      );
    } finally {
      await pool.query(
        'DELETE FROM app.investigations WHERE investigation_id = ANY($1::text[])',
        [[id, childId]],
      );
      if (!analytics.ended) await analytics.end();
      await pool.end();
    }
  },
);
