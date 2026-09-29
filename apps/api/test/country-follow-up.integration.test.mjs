import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createMrrDeclineApi,
  createSyntheticMrrDeclineApi,
  loadSyntheticMrrDeclineDependencies,
} from '../dist/index.js';
import { InMemoryInvestigationStore } from '@executive-bi/investigations';

function request(path, token, body) {
  return new Request(`http://api.test/v1/investigations/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function parent(api, id = 'parent', scope) {
  const response = await api.fetch(
    request('mrr-decline', undefined, {
      investigationId: id,
      month: '2026-08-01',
      ...(scope ? { permittedCustomerIds: scope } : {}),
    }),
  );
  assert.equal(response.status, 201);
  return response.json();
}

test('synthetic country follow-up compares both months, retains own evidence and survives API restart without changing parent', async () => {
  const store = new InMemoryInvestigationStore();
  const api = await createSyntheticMrrDeclineApi(store);
  const original = await parent(api);
  const response = await api.fetch(
    request('parent/country-follow-ups', original.accessToken, {
      investigationId: 'countries',
      question: 'Break that down by country.',
    }),
  );
  assert.equal(response.status, 201);
  const follow = await response.json();
  const restarted = await createSyntheticMrrDeclineApi(store);
  const answerResponse = await restarted.fetch(
    request('countries/answer', follow.accessToken),
  );
  assert.equal(answerResponse.status, 200);
  const { answer } = await answerResponse.json();
  assert.equal(answer.comparison.previousMonth, '2026-07-01');
  assert.equal(answer.comparison.currentMonth, '2026-08-01');
  assert.equal(answer.comparison.mrrChangeEurCents, -170000);
  for (const key of [
    'previousMrrEurCents',
    'currentMrrEurCents',
    'mrrChangeEurCents',
  ])
    assert.equal(
      answer.comparison.rows.reduce((sum, row) => sum + row[key], 0),
      answer.comparison[key],
    );
  assert.equal(answer.sourceEvidenceIds.length, 3);
  for (const id of answer.evidence.map((item) => item.evidenceId))
    assert.equal(
      (
        await restarted.fetch(
          request(`countries/evidence/${id}`, follow.accessToken),
        )
      ).status,
      200,
    );
  assert.deepEqual(
    (
      await (
        await restarted.fetch(request('parent', original.accessToken))
      ).json()
    ).record,
    original.record,
  );
  assert.deepEqual(
    (
      await (
        await restarted.fetch(request('countries', follow.accessToken))
      ).json()
    ).record,
    follow.record,
  );
  assert.equal(
    (await restarted.fetch(request('countries/answer', original.accessToken)))
      .status,
    404,
  );
  assert.equal(
    (await restarted.fetch(request('parent/answer', follow.accessToken)))
      .status,
    404,
  );
  assert.equal(
    (
      await restarted.fetch(
        request(
          `countries/evidence/${original.record.evidenceIds[0]}`,
          follow.accessToken,
        ),
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await api.fetch(
        request('parent/country-follow-ups', original.accessToken, {
          investigationId: 'countries',
          action: 'breakdown_mrr_by_country',
        }),
      )
    ).status,
    409,
  );
});

test('scope is inherited and unsupported constraints or invalid authorization run no country tools', async () => {
  const api = await createSyntheticMrrDeclineApi();
  const original = await parent(api, 'scoped', ['cust_acme']);
  for (const token of [undefined, 'x'.repeat(43)])
    assert.equal(
      (
        await api.fetch(
          request('scoped/country-follow-ups', token, {
            investigationId: 'nope',
            action: 'breakdown_mrr_by_country',
          }),
        )
      ).status,
      token ? 404 : 401,
    );
  for (const question of [
    'Break that down by country for Germany',
    'Break that down by country in September 2026',
    'Break ARR down by country',
    'Break that down by country and plan',
  ]) {
    const rejected = await api.fetch(
      request('scoped/country-follow-ups', original.accessToken, {
        investigationId: 'nope',
        question,
      }),
    );
    assert.equal(rejected.status, 422);
    assert.equal((await rejected.json()).status, 'unsupported');
  }
  for (const extra of [
    { month: '2026-09-01' },
    { permittedCustomerIds: ['cust_beta'] },
  ])
    assert.equal(
      (
        await api.fetch(
          request('scoped/country-follow-ups', original.accessToken, {
            investigationId: 'nope',
            action: 'breakdown_mrr_by_country',
            ...extra,
          }),
        )
      ).status,
      400,
    );
  const follow = await (
    await api.fetch(
      request('scoped/country-follow-ups', original.accessToken, {
        investigationId: 'nope',
        action: 'breakdown_mrr_by_country',
      }),
    )
  ).json();
  assert.equal(follow.status, 'completed');
  const { answer } = await (
    await api.fetch(request('nope/answer', follow.accessToken))
  ).json();
  assert.deepEqual(answer.permittedCustomerIds, ['cust_acme']);
  assert.equal(answer.comparison.mrrChangeEurCents, -240000);
  for (const item of answer.evidence.filter(
    (item) => item.type === 'metric_query',
  ))
    assert.deepEqual(item.scope.filters.customerIds, ['cust_acme']);
});

test('country migration is presented as a change in totals', async () => {
  const dependencies = await loadSyntheticMrrDeclineDependencies();
  const snapshot = structuredClone(dependencies.snapshot);
  for (const row of snapshot.rows.filter(
    (row) => row.customerId === 'cust_acme',
  ))
    row.country = row.month === '2026-07-01' ? 'DE' : 'GB';
  const api = createMrrDeclineApi({ ...dependencies, snapshot });
  const original = await parent(api);
  const follow = await (
    await api.fetch(
      request('parent/country-follow-ups', original.accessToken, {
        investigationId: 'countries',
        action: 'breakdown_mrr_by_country',
      }),
    )
  ).json();
  assert.equal(follow.status, 'completed');
  const { answer } = await (
    await api.fetch(request('countries/answer', follow.accessToken))
  ).json();
  assert.equal(answer.comparison.missingDimensions, false);
  assert.match(answer.limitations.join(' '), /not churn or acquisition/);
});

test('changed or unavailable analytics block and retain follow-ups without an answer', async () => {
  const dependencies = await loadSyntheticMrrDeclineDependencies();
  for (const missing of [true, false]) {
    const store = new InMemoryInvestigationStore();
    const api = createMrrDeclineApi(dependencies, store);
    const original = await parent(api);
    const snapshot = structuredClone(dependencies.snapshot);
    if (missing)
      snapshot.rows = snapshot.rows.filter((row) => row.month !== '2026-07-01');
    else
      snapshot.rows.find(
        (row) => row.month === '2026-07-01' && row.isActiveAtMonthEnd,
      ).mrrEurCents += 100;
    const changed = createMrrDeclineApi({ ...dependencies, snapshot }, store);
    const response = await changed.fetch(
      request('parent/country-follow-ups', original.accessToken, {
        investigationId: 'blocked',
        action: 'breakdown_mrr_by_country',
      }),
    );
    assert.equal(response.status, 422);
    const follow = await response.json();
    assert.equal(follow.status, 'blocked');
    const restarted = createMrrDeclineApi(dependencies, store);
    assert.equal(
      (await restarted.fetch(request('blocked/answer', follow.accessToken)))
        .status,
      422,
    );
    assert.equal(
      (await restarted.fetch(request('blocked', follow.accessToken))).status,
      200,
    );
    assert.deepEqual(
      (
        await (
          await restarted.fetch(request('parent', original.accessToken))
        ).json()
      ).record,
      original.record,
    );
  }
});

test('authorization, unsupported wording and invalid parents cannot reserve or run tools; missing dimensions remain inspectable', async () => {
  const { MrrDeclineApi } = await import('../dist/index.js');
  const { MrrDeclineInvestigationService } =
    await import('@executive-bi/investigations');
  const { TrustedMrrService } = await import('@executive-bi/metrics');
  const dependencies = await loadSyntheticMrrDeclineDependencies();
  const rows = structuredClone(dependencies.snapshot.rows);
  for (const row of rows.filter((row) => row.customerId === 'cust_acme'))
    row.country = '';
  // Labeled synthetic controlled repository: adapter validation remains strict.
  const metrics = new TrustedMrrService({
    getMonth: async (month) => rows.filter((row) => row.month === month),
    freshness: async () => '2026-09-01T08:00:00Z',
  });
  let calls = 0;
  const store = new InMemoryInvestigationStore();
  let reservations = 0;
  const reserve = store.reserve.bind(store);
  store.reserve = async (...args) => {
    reservations++;
    return reserve(...args);
  };
  const service = new MrrDeclineInvestigationService(
    {
      compareMrr: metrics.compareMrr.bind(metrics),
      getMrrMovement: metrics.getMrrMovement.bind(metrics),
      getCustomerMrrMovement: metrics.getCustomerMrrMovement.bind(metrics),
      breakdownMrr: metrics.breakdownMrr.bind(metrics),
      searchCompanyKnowledge: async () => ({
        status: 'ok',
        hits: [],
        warnings: [],
      }),
      compareCountryMrr: async (input) => {
        calls++;
        return metrics.compareCountryMrr(input);
      },
    },
    store,
  );
  const api = new MrrDeclineApi(service);
  const original = await parent(api);
  const before = reservations;
  for (const [path, token, body] of [
    [
      'unknown/country-follow-ups',
      original.accessToken,
      { investigationId: 'bad', action: 'breakdown_mrr_by_country' },
    ],
    [
      'parent/country-follow-ups',
      'x'.repeat(43),
      { investigationId: 'bad', action: 'breakdown_mrr_by_country' },
    ],
    [
      'parent/country-follow-ups',
      original.accessToken,
      {
        investigationId: 'bad',
        question: 'Break that down by country in July',
      },
    ],
    [
      'parent/country-follow-ups',
      original.accessToken,
      {
        investigationId: 'bad',
        action: 'breakdown_mrr_by_country',
        permittedCustomerIds: ['outside'],
      },
    ],
  ])
    assert.ok((await api.fetch(request(path, token, body))).status >= 400);
  assert.equal(calls, 0);
  assert.equal(reservations, before);
  const response = await api.fetch(
    request('parent/country-follow-ups', original.accessToken, {
      investigationId: 'country',
      action: 'breakdown_mrr_by_country',
    }),
  );
  assert.equal(response.status, 201);
  const child = await response.json();
  const { answer } = await (
    await api.fetch(request('country/answer', child.accessToken))
  ).json();
  assert.equal(answer.comparison.missingDimensions, true);
  assert.ok(
    answer.comparison.rows.some(
      (row) =>
        row.country === null &&
        row.previousMrrEurCents === 240000 &&
        row.currentMrrEurCents === 0,
    ),
  );
  const childParent = await api.fetch(
    request('country/country-follow-ups', child.accessToken, {
      investigationId: 'nested',
      action: 'breakdown_mrr_by_country',
    }),
  );
  assert.equal((await childParent.json()).status, 'invalid_parent');
  assert.equal(calls, 1);
  assert.equal(reservations, before + 1);
  const blocked = await (
    await api.fetch(
      request('mrr-decline', undefined, {
        investigationId: 'blocked-parent',
        month: '2026-06-01',
      }),
    )
  ).json();
  const blockedParent = await api.fetch(
    request('blocked-parent/country-follow-ups', blocked.accessToken, {
      investigationId: 'nested',
      action: 'breakdown_mrr_by_country',
    }),
  );
  assert.equal((await blockedParent.json()).status, 'invalid_parent');
  assert.equal(calls, 1);
  assert.equal(reservations, before + 2);
});
