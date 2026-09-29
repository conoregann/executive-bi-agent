import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createMrrDeclineApi,
  createSyntheticMrrDeclineApi,
  loadSyntheticMrrDeclineDependencies,
} from '../dist/index.js';
import {
  InMemoryInvestigationStore,
  synthesizeMrrDeclineAnswer,
} from '../../../packages/investigations/dist/index.js';
import { investigationAnswerSchema } from '../../../packages/schemas/dist/index.js';

async function syntheticInvestigation(options = {}) {
  const store = new InMemoryInvestigationStore();
  const api = await createSyntheticMrrDeclineApi(store);
  const created = await api.fetch(
    new Request('http://api.test/v1/investigations/mrr-decline', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        investigationId: 'synthetic-answer',
        month: '2026-08-01',
        ...options,
      }),
    }),
  );
  const body = await created.json();
  const url = 'http://api.test/v1/investigations/synthetic-answer/answer';
  const headers = { authorization: `Bearer ${body.accessToken}` };
  return { api, store, body, url, headers };
}

test('returns a deterministic executive answer with inspectable metric and document citations', async () => {
  const { api, body, url, headers } = await syntheticInvestigation();
  const response = await api.fetch(new Request(url, { headers }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(
    investigationAnswerSchema.safeParse(result.answer).success,
    true,
  );
  assert.deepEqual(Object.keys(result.answer).slice(2), [
    'answer',
    'drivers',
    'context',
    'limitations',
    'evidence',
    'chart',
    'waterfall',
    'recommendedNextStep',
  ]);
  assert.match(
    result.answer.answer.text,
    /2026-08.*EUR 4200.00.*EUR 2500.00.*EUR -1700.00.*2026-07/,
  );
  assert.equal(result.answer.context.length, 1);
  assert.match(result.answer.limitations.join(' '), /causal link.*unconfirmed/);
  assert.deepEqual(
    result.answer.recommendedNextStep.customerIds,
    body.record.driverCustomerIds,
  );
  for (const citation of result.answer.evidence) {
    const response = await api.fetch(
      new Request(
        `http://api.test/v1/investigations/synthetic-answer/evidence/${citation.evidenceId}`,
        { headers },
      ),
    );
    assert.equal(response.status, 200);
    const source = (await response.json()).evidence;
    assert.equal(source.sourceRef, citation.sourceRef);
    assert.equal(source.freshness, citation.freshness);
  }
  assert.deepEqual(
    await (await api.fetch(new Request(url, { headers }))).json(),
    result,
  );
});

test('requires the original token and preserves scoped metrics and driver recommendations', async () => {
  const { api, url, headers } = await syntheticInvestigation({
    permittedCustomerIds: ['cust_riviera'],
  });
  const result = await (await api.fetch(new Request(url, { headers }))).json();
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.answer.scope.permittedCustomerIds, ['cust_riviera']);
  assert.match(
    result.answer.answer.text,
    /EUR 400.00.*EUR 300.00.*EUR -100.00/,
  );
  assert.deepEqual(result.answer.recommendedNextStep.customerIds, [
    'cust_riviera',
  ]);
  assert.deepEqual(result.answer.context, []);
  assert.match(
    result.answer.limitations.join(' '),
    /No usable company knowledge/,
  );
  assert.equal((await api.fetch(new Request(url))).status, 401);
  assert.equal(
    (
      await api.fetch(
        new Request(url, {
          headers: { authorization: `Bearer ${'x'.repeat(43)}` },
        }),
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await api.fetch(
        new Request(url.replace('synthetic-answer', 'unknown'), { headers }),
      )
    ).status,
    404,
  );
  assert.equal(
    (await api.fetch(new Request(url, { method: 'POST', headers }))).status,
    404,
  );
});

test('blocked investigations cannot be presented as executive answers', async () => {
  const { api, url, headers } = await syntheticInvestigation({
    month: '2026-05-01',
  });
  const response = await api.fetch(new Request(url, { headers }));
  assert.equal(response.status, 422);
  assert.deepEqual(Object.keys(await response.json()), ['status', 'error']);
});

test('synthesis fails closed for absent, invalid, duplicated, wrong-period or broadened metric evidence', async () => {
  const { store } = await syntheticInvestigation({
    permittedCustomerIds: ['cust_acme'],
  });
  const stored = await store.get('synthetic-answer');
  assert.equal(
    synthesizeMrrDeclineAnswer(stored.record, stored.evidence).status,
    'ok',
  );
  for (const mutate of [
    (value) => {
      value.evidence[0].integrity = 'invalid';
    },
    (value) => {
      value.evidence[0].scope.month = '2026-09-01';
    },
    (value) => {
      value.evidence[0].scope.filters = {};
    },
    (value) => {
      value.evidence[0].content.mrrEurCents = Number.NaN;
    },
    (value) => {
      value.evidence[0].content.mrrEurCents = 123;
    },
    (value) => {
      value.evidence[2].content.inputEvidenceIds = ['missing'];
    },
    (value) => {
      value.evidence[5].content.reconciles = false;
    },
    (value) => {
      value.evidence[6].content.rows[0].customerId = 'outside_scope';
    },
    (value) => {
      value.evidence.push(value.evidence[0]);
    },
    (value) => {
      value.evidence.pop();
    },
  ]) {
    const value = structuredClone(stored);
    mutate(value);
    assert.equal(
      synthesizeMrrDeclineAnswer(value.record, value.evidence).status,
      'answer_unavailable',
    );
  }
});

test('invalid or out-of-scope document evidence is excluded without inventing context', async () => {
  const { store } = await syntheticInvestigation();
  const stored = await store.get('synthetic-answer');
  for (const mutate of [
    (item) => {
      item.integrity = 'invalid';
    },
    (item) => {
      item.scope.customerIds = ['outside_scope'];
    },
    (item) => {
      item.content.excerpt = '';
    },
  ]) {
    const value = structuredClone(stored);
    mutate(value.evidence.find((item) => item.type === 'document_chunk'));
    const result = synthesizeMrrDeclineAnswer(value.record, value.evidence);
    assert.equal(result.status, 'ok');
    assert.deepEqual(result.answer.context, []);
  }
});

test('zero baselines, increases and year boundaries retain truthful comparison wording', async () => {
  const dependencies = await loadSyntheticMrrDeclineDependencies();
  dependencies.snapshot.rows = dependencies.snapshot.rows
    .filter((row) => row.month !== '2026-06-01')
    .map((row) => ({
      ...row,
      month: row.month === '2026-07-01' ? '2025-12-01' : '2026-01-01',
      ...(row.month === '2026-07-01'
        ? { mrrEurCents: 0, isActiveAtMonthEnd: false }
        : {}),
    }));
  dependencies.snapshot.coverage = dependencies.snapshot.coverage
    .filter((item) => item.month !== '2026-06-01')
    .map((item) => ({
      ...item,
      month: item.month === '2026-07-01' ? '2025-12-01' : '2026-01-01',
    }));
  const api = createMrrDeclineApi(dependencies);
  const created = await api.fetch(
    new Request('http://api.test/v1/investigations/mrr-decline', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        investigationId: 'synthetic-year-boundary',
        month: '2026-01-01',
      }),
    }),
  );
  const body = await created.json();
  const response = await api.fetch(
    new Request(
      'http://api.test/v1/investigations/synthetic-year-boundary/answer',
      {
        headers: { authorization: `Bearer ${body.accessToken}` },
      },
    ),
  );
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.match(
    result.answer.answer.text,
    /2026-01.*EUR 0.00.*EUR 2500.00.*EUR 2500.00.*2025-12/,
  );
  assert.deepEqual(result.answer.drivers, []);
  assert.ok(result.answer.limitations.includes('zero_comparison_denominator'));
  assert.doesNotMatch(result.answer.answer.text, /fell|declined|%|Infinity/);
});

test('an answer-named investigation or evidence ID retains its original route meaning', async () => {
  const api = await createSyntheticMrrDeclineApi();
  const created = await api.fetch(
    new Request('http://api.test/v1/investigations/mrr-decline', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ investigationId: 'answer', month: '2026-08-01' }),
    }),
  );
  const body = await created.json();
  const headers = { authorization: `Bearer ${body.accessToken}` };
  const record = await api.fetch(
    new Request('http://api.test/v1/investigations/answer', { headers }),
  );
  assert.deepEqual((await record.json()).record, body.record);
  assert.equal(
    (
      await api.fetch(
        new Request(
          'http://api.test/v1/investigations/answer/evidence/answer',
          { headers },
        ),
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await api.fetch(
        new Request('http://api.test/v1/investigations/answer/answer', {
          headers,
        }),
      )
    ).status,
    200,
  );
});

test('synthetic chart copies immutable plan evidence and fails closed independently', async () => {
  const { store } = await syntheticInvestigation({
    permittedCustomerIds: ['cust_riviera'],
  });
  const stored = await store.get('synthetic-answer');
  const source = stored.evidence.find((item) => item.scope.groupBy === 'plan');
  const result = synthesizeMrrDeclineAnswer(stored.record, stored.evidence);
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.answer.chart.data, source.content.rows);
  assert.deepEqual(result.answer.chart.permittedCustomerIds, ['cust_riviera']);
  assert.equal(result.answer.chart.data[0].mrrEurCents, 30000);
  assert.equal(result.answer.chart.sourceEvidenceId, source.evidenceId);
  for (const mutate of [
    (item) => {
      item.integrity = 'invalid';
    },
    (item) => {
      item.scope.filters = {};
    },
    (item) => {
      item.scope.month = '2026-07-01';
    },
    (item) => {
      item.content.rows[0].mrrEurCents = -1;
    },
    (item) => {
      item.content.rows.push(item.content.rows[0]);
    },
    (item) => {
      item.content.totalMrrEurCents = 123;
    },
  ]) {
    const changed = structuredClone(stored);
    mutate(changed.evidence.find((item) => item.scope.groupBy === 'plan'));
    const answer = synthesizeMrrDeclineAnswer(changed.record, changed.evidence);
    assert.equal(answer.status, 'ok');
    assert.equal(answer.answer.chart, undefined);
    assert.match(answer.answer.limitations.join(' '), /chart is unavailable/);
  }
  const missing = structuredClone(stored);
  missing.evidence = missing.evidence.filter(
    (item) => item.evidenceId !== source.evidenceId,
  );
  missing.record.evidenceIds = missing.record.evidenceIds.filter(
    (id) => id !== source.evidenceId,
  );
  assert.equal(
    synthesizeMrrDeclineAnswer(missing.record, missing.evidence).answer.chart,
    undefined,
  );
  const incomplete = structuredClone(stored);
  const item = incomplete.evidence.find(
    (item) => item.scope.groupBy === 'plan',
  );
  item.integrity = 'warning';
  item.content.reconciles = false;
  item.content.rows = [];
  item.content.groupedMrrEurCents = 0;
  item.content.unassignedMrrEurCents = 30000;
  const partial = synthesizeMrrDeclineAnswer(
    incomplete.record,
    incomplete.evidence,
  );
  assert.equal(partial.answer.chart.reconciles, false);
  assert.equal(partial.answer.chart.unassignedMrrEurCents, 30000);
});
