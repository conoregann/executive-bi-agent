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

test('synthetic churn follow-up retains 1 / 4 = 25% with inspectable evidence and isolated token', async () => {
  const store = new InMemoryInvestigationStore();
  const api = await createSyntheticMrrDeclineApi(store);
  const root = await parent(api);
  const response = await api.fetch(
    request('parent/customer-churn-follow-ups', root.accessToken, {
      investigationId: 'churn',
      action: 'get_customer_churn_rate',
    }),
  );
  assert.equal(response.status, 201);
  const child = await response.json();
  const restarted = await createSyntheticMrrDeclineApi(store);
  const answerResponse = await restarted.fetch(
    request('churn/answer', child.accessToken),
  );
  assert.equal(answerResponse.status, 200);
  const { answer } = await answerResponse.json();
  assert.deepEqual(answer.value, {
    currentMonth: '2026-08-01',
    previousMonth: '2026-07-01',
    churnedCustomers: 1,
    startingCustomers: 4,
    rate: 0.25,
  });
  assert.equal(answer.sourceEvidenceIds.length, 3);
  for (const id of answer.sourceEvidenceIds)
    assert.equal(
      (
        await restarted.fetch(
          request(`churn/evidence/${id}`, child.accessToken),
        )
      ).status,
      200,
    );
  assert.equal(
    (await restarted.fetch(request('churn/answer', root.accessToken))).status,
    404,
  );
  assert.equal(
    (await restarted.fetch(request('parent/answer', child.accessToken))).status,
    404,
  );
  assert.equal(
    (await restarted.fetch(request('parent', root.accessToken))).status,
    200,
  );
});

test('synthetic churn follow-up inherits exact customer scope and rejects overrides before reservation', async () => {
  const store = new InMemoryInvestigationStore();
  const api = await createSyntheticMrrDeclineApi(store);
  const root = await parent(api, 'scoped', ['cust_acme', 'cust_london']);
  for (const [token, body, status] of [
    [
      undefined,
      { investigationId: 'unauthorized', action: 'get_customer_churn_rate' },
      401,
    ],
    [
      'x'.repeat(43),
      { investigationId: 'wrong-token', action: 'get_customer_churn_rate' },
      404,
    ],
    [
      root.accessToken,
      {
        investigationId: 'override',
        action: 'get_customer_churn_rate',
        month: '2026-07-01',
      },
      400,
    ],
    [
      root.accessToken,
      {
        investigationId: 'override-scope',
        action: 'get_customer_churn_rate',
        permittedCustomerIds: ['cust_acme'],
      },
      400,
    ],
  ]) {
    assert.equal(
      (
        await api.fetch(
          request('scoped/customer-churn-follow-ups', token, body),
        )
      ).status,
      status,
    );
    assert.equal(await store.get(body.investigationId), undefined);
  }
  const response = await api.fetch(
    request('scoped/customer-churn-follow-ups', root.accessToken, {
      investigationId: 'scoped-churn',
      action: 'get_customer_churn_rate',
    }),
  );
  assert.equal(response.status, 201);
  const child = await response.json();
  assert.deepEqual(child.record.permittedCustomerIds, [
    'cust_acme',
    'cust_london',
  ]);
  const { answer } = await (
    await api.fetch(request('scoped-churn/answer', child.accessToken))
  ).json();
  assert.equal(answer.value.startingCustomers, 2);
  assert.equal(answer.value.churnedCustomers, 1);
  for (const item of answer.evidence.filter(
    (item) => item.type === 'metric_query',
  ))
    assert.deepEqual(item.scope.filters.customerIds, [
      'cust_acme',
      'cust_london',
    ]);
});

test('synthetic retained churn evidence tampering blocks answers', async () => {
  const store = new InMemoryInvestigationStore();
  const api = await createSyntheticMrrDeclineApi(store);
  const root = await parent(api);
  const child = await (
    await api.fetch(
      request('parent/customer-churn-follow-ups', root.accessToken, {
        investigationId: 'churn',
        action: 'get_customer_churn_rate',
      }),
    )
  ).json();
  const original = store.get.bind(store);
  for (const mutation of [
    (stored) => {
      stored.evidence[0].content.activeCustomers = 99;
    },
    (stored) => {
      stored.evidence[2].content.rate = 0.5;
    },
    (stored) => {
      stored.evidence[1].scope.filters = { customerIds: ['other'] };
    },
    (stored) => {
      stored.evidence[2].content.inputEvidenceIds = [
        'missing',
        stored.evidence[1].evidenceId,
      ];
    },
  ]) {
    store.get = async (id) => {
      const stored = await original(id);
      if (id === 'churn') mutation(stored);
      return stored;
    };
    assert.equal(
      (await api.fetch(request('churn/answer', child.accessToken))).status,
      422,
    );
  }
});

test('synthetic unavailable monthly snapshot retains a blocked churn child', async () => {
  const dependencies = await loadSyntheticMrrDeclineDependencies();
  const store = new InMemoryInvestigationStore();
  const api = createMrrDeclineApi(dependencies, store);
  const root = await parent(api);
  const snapshot = structuredClone(dependencies.snapshot);
  snapshot.rows = snapshot.rows.filter((row) => row.month !== '2026-07-01');
  const changed = createMrrDeclineApi({ ...dependencies, snapshot }, store);
  const response = await changed.fetch(
    request('parent/customer-churn-follow-ups', root.accessToken, {
      investigationId: 'blocked-churn',
      action: 'get_customer_churn_rate',
    }),
  );
  assert.equal(response.status, 422);
  const child = await response.json();
  assert.equal(child.status, 'blocked');
  assert.equal(
    (await api.fetch(request('blocked-churn/answer', child.accessToken)))
      .status,
    422,
  );
  assert.equal(
    (await api.fetch(request('blocked-churn', child.accessToken))).status,
    200,
  );
});
