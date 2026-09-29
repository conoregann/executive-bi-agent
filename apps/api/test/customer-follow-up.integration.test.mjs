import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createMrrDeclineApi,
  createPostgresMrrDeclineApi,
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
async function setup(scope) {
  const dependencies = await loadSyntheticMrrDeclineDependencies();
  const store = new InMemoryInvestigationStore();
  const api = createMrrDeclineApi(dependencies, store);
  const root = await (
    await api.fetch(
      request('mrr-decline', undefined, {
        investigationId: 'root',
        month: '2026-08-01',
        ...(scope ? { permittedCustomerIds: scope } : {}),
      }),
    )
  ).json();
  const country = await (
    await api.fetch(
      request('root/country-follow-ups', root.accessToken, {
        investigationId: 'country',
        action: 'breakdown_mrr_by_country',
      }),
    )
  ).json();
  assert.equal(country.status, 'completed');
  return { api, dependencies, store, root, country };
}
async function child(api, country, id = 'accounts', selection = 'DE') {
  return api.fetch(
    request('country/customer-follow-ups', country.accessToken, {
      investigationId: id,
      country: selection,
    }),
  );
}
test('synthetic country to customers reconciles, isolates tokens and reads after restart without analytics', async () => {
  const { api, store, country, root } = await setup();
  const before = await store.get('country');
  const response = await child(api, country);
  assert.equal(response.status, 201);
  const result = await response.json();
  const restarted = await createPostgresMrrDeclineApi(
    {
      query: async () => {
        throw new Error('analytics must not run');
      },
    },
    store,
  );
  const read = await restarted.fetch(
    request('accounts/answer', result.accessToken),
  );
  assert.equal(read.status, 200);
  const { answer } = await read.json();
  const value = answer.contributions;
  const parent = await (
    await api.fetch(request('country/answer', country.accessToken))
  ).json();
  const row = parent.answer.comparison.rows.find((row) => row.country === 'DE');
  for (const key of [
    'previousMrrEurCents',
    'currentMrrEurCents',
    'mrrChangeEurCents',
  ])
    assert.equal(value[key], row[key]);
  assert.equal(
    value.largestLosses.reduce((sum, row) => sum + row.mrrChangeEurCents, 0) +
      value.positiveOffsetsEurCents +
      value.remainingNetMovementEurCents,
    value.mrrChangeEurCents,
  );
  assert.ok(value.largestLosses.every((row) => !('movement' in row)));
  for (const item of answer.evidence)
    assert.equal(
      (
        await restarted.fetch(
          request(`accounts/evidence/${item.evidenceId}`, result.accessToken),
        )
      ).status,
      200,
    );
  for (const token of [root.accessToken, country.accessToken])
    assert.equal(
      (await restarted.fetch(request('accounts/answer', token))).status,
      404,
    );
  assert.equal(
    (await api.fetch(request('country/answer', result.accessToken))).status,
    404,
  );
  assert.equal((await child(api, country)).status, 409);
  assert.deepEqual(await store.get('country'), before);
  assert.equal(
    (
      await api.fetch(
        request('accounts/customer-follow-ups', result.accessToken, {
          investigationId: 'recursive',
          country: 'DE',
        }),
      )
    ).status,
    422,
  );
});
test('synthetic scope, auth, invalid country and overrides cannot reserve a child', async () => {
  const { api, store, country, root } = await setup(['cust_acme']);
  for (const [path, token, body, status] of [
    [
      'country/customer-follow-ups',
      undefined,
      { investigationId: 'invalid', country: 'DE' },
      401,
    ],
    [
      'country/customer-follow-ups',
      'x'.repeat(43),
      { investigationId: 'invalid', country: 'DE' },
      404,
    ],
    [
      'root/customer-follow-ups',
      root.accessToken,
      { investigationId: 'invalid', country: 'DE' },
      422,
    ],
    [
      'country/customer-follow-ups',
      country.accessToken,
      { investigationId: 'invalid', country: 'XX' },
      400,
    ],
    [
      'country/customer-follow-ups',
      country.accessToken,
      { investigationId: 'invalid', country: 'DE', month: '2026-09-01' },
      400,
    ],
    [
      'country/customer-follow-ups',
      country.accessToken,
      {
        investigationId: 'invalid',
        country: 'DE',
        permittedCustomerIds: ['outside'],
      },
      400,
    ],
  ]) {
    assert.equal((await api.fetch(request(path, token, body))).status, status);
    assert.equal(await store.get('invalid'), undefined);
  }
  const result = await (await child(api, country)).json();
  assert.equal(result.status, 'completed');
  const { answer } = await (
    await api.fetch(request('accounts/answer', result.accessToken))
  ).json();
  assert.deepEqual(answer.permittedCustomerIds, ['cust_acme']);
  assert.deepEqual(
    answer.contributions.rows.map((row) => row.customerId),
    ['cust_acme'],
  );
});
test('synthetic missing months, stale totals and tampered parent evidence retain blocked children', async () => {
  for (const mode of ['missing', 'stale', 'tampered']) {
    const { dependencies, store, country } = await setup();
    const snapshot = structuredClone(dependencies.snapshot);
    if (mode === 'missing')
      snapshot.rows = snapshot.rows.filter((row) => row.month !== '2026-07-01');
    if (mode === 'stale')
      snapshot.rows.find(
        (row) =>
          row.month === '2026-07-01' &&
          row.country === 'DE' &&
          row.isActiveAtMonthEnd,
      ).mrrEurCents += 1;
    if (mode === 'tampered') {
      const originalGet = store.get.bind(store);
      store.get = async (id) => {
        const found = await originalGet(id);
        if (id === 'country')
          found.evidence.find(
            (item) => item.scope.groupBy === 'country',
          ).content.totalMrrEurCents += 1;
        return found;
      };
    }
    const changed = createMrrDeclineApi({ ...dependencies, snapshot }, store);
    const response = await child(changed, country);
    assert.equal(response.status, 422, mode);
    const result = await response.json();
    assert.equal(result.status, 'blocked');
    assert.equal(
      (await changed.fetch(request('accounts', result.accessToken))).status,
      200,
    );
    assert.equal(
      (await changed.fetch(request('accounts/answer', result.accessToken)))
        .status,
      422,
    );
  }
});
test('synthetic retained contribution tampering prevents an answer', async () => {
  for (const mode of [
    'row',
    'scope',
    'link',
    'total',
    'rank',
    'offset',
    'parent',
  ]) {
    const { api, store, country } = await setup();
    const result = await (await child(api, country)).json();
    assert.equal(result.status, 'completed');
    const originalGet = store.get.bind(store);
    store.get = async (id) => {
      const found = await originalGet(id);
      if (id !== 'accounts') return found;
      const query = found.evidence.find(
        (item) => item.scope.metric === 'customer_country_mrr',
      );
      const calc = found.evidence.find((item) => item.content.largestLosses);
      if (mode === 'row') query.content.rows[0].mrrEurCents += 1;
      if (mode === 'scope') query.scope.filters = { customerIds: ['outside'] };
      if (mode === 'link') calc.content.inputEvidenceIds[0] = 'missing';
      if (mode === 'total') calc.content.currentMrrEurCents += 1;
      if (mode === 'rank') calc.content.largestLosses = [];
      if (mode === 'offset') calc.content.positiveOffsetsEurCents += 1;
      if (mode === 'parent')
        found.evidence.find(
          (item) => item.source === 'investigation_snapshot',
        ).content.record.month = '2026-09-01';
      return found;
    };
    assert.equal(
      (await api.fetch(request('accounts/answer', result.accessToken))).status,
      422,
      mode,
    );
  }
});

test('synthetic customer tools run only after reservation; invalid parents and scope never execute', async () => {
  const { MrrDeclineInvestigationService } =
    await import('@executive-bi/investigations');
  const { TrustedMrrService } = await import('@executive-bi/metrics');
  const dependencies = await loadSyntheticMrrDeclineDependencies();
  const metrics = new TrustedMrrService({
    getMonth: async (month) =>
      dependencies.snapshot.rows.filter((row) => row.month === month),
    freshness: async () => dependencies.snapshot.freshness,
  });
  const store = new InMemoryInvestigationStore();
  let calls = 0;
  const service = new MrrDeclineInvestigationService(
    {
      compareMrr: metrics.compareMrr.bind(metrics),
      getMrrMovement: metrics.getMrrMovement.bind(metrics),
      getCustomerMrrMovement: metrics.getCustomerMrrMovement.bind(metrics),
      breakdownMrr: metrics.breakdownMrr.bind(metrics),
      compareCountryMrr: metrics.compareCountryMrr.bind(metrics),
      searchCompanyKnowledge: async () => ({
        status: 'ok',
        hits: [],
        warnings: [],
      }),
      getCustomerCountryContributions: async (input) => {
        calls++;
        const reserved = await store.get('accounts');
        assert.equal(reserved.plan.maximumToolCalls, 1);
        assert.equal(reserved.record, undefined);
        return metrics.getCustomerCountryContributions(input);
      },
    },
    store,
  );
  const root = await service.start({
    investigationId: 'root',
    month: '2026-08-01',
  });
  const country = await service.startCountryFollowUp('root', root.accessToken, {
    investigationId: 'country',
    action: 'breakdown_mrr_by_country',
  });
  for (const [parent, token, input] of [
    ['root', root.accessToken, { investigationId: 'bad', country: 'DE' }],
    ['country', root.accessToken, { investigationId: 'bad', country: 'DE' }],
    ['country', country.accessToken, { investigationId: 'bad', country: 'XX' }],
    [
      'country',
      country.accessToken,
      { investigationId: 'bad', country: 'DE', filters: {} },
    ],
  ]) {
    await service.startCustomerFollowUp(parent, token, input);
    assert.equal(await store.get('bad'), undefined);
    assert.equal(calls, 0);
  }
  const result = await service.startCustomerFollowUp(
    'country',
    country.accessToken,
    { investigationId: 'accounts', country: 'DE' },
  );
  assert.equal(result.status, 'completed');
  assert.equal(calls, 1);
  const originalGet = store.get.bind(store);
  store.get = async (id) => {
    const found = await originalGet(id);
    if (id === 'country') found.record.status = 'blocked';
    return found;
  };
  assert.equal(
    (
      await service.startCustomerFollowUp('country', country.accessToken, {
        investigationId: 'bad',
        country: 'DE',
      })
    ).status,
    'invalid_parent',
  );
  assert.equal(await store.get('bad'), undefined);
  assert.equal(calls, 1);
});
