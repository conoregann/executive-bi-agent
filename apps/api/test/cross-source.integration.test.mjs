import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMrrDeclineApi } from '../dist/features/mrr/composition.js';
import { loadSyntheticMrrDeclineDependencies } from '../dist/features/mrr/synthetic-source.js';
import { createOperationalRepository } from '@executive-bi/operations';
import { InMemoryInvestigationStore } from '@executive-bi/investigations';
const snapshot = JSON.parse(
  readFileSync(
    new URL('../../../data/synthetic/operations-2026.json', import.meta.url),
  ),
);
async function send(api, path, body, token) {
  return api.fetch(
    new Request(`http://test/v1/investigations/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );
}
export async function scenario(
  model,
  scope,
  question = 'Investigate revenue losses across sources',
) {
  const store = new InMemoryInvestigationStore();
  const dependencies = await loadSyntheticMrrDeclineDependencies();
  const api = createMrrDeclineApi(
    dependencies,
    store,
    createOperationalRepository(snapshot),
    model,
  );
  const parent = await (
    await send(api, 'mrr-decline', {
      investigationId: 'parent',
      month: '2026-08-01',
      ...(scope ? { permittedCustomerIds: scope } : {}),
    })
  ).json();
  const child = await (
    await send(
      api,
      'parent/cross-source-follow-ups',
      { investigationId: 'cross', question },
      parent.accessToken,
    )
  ).json();
  return { api, parent, child, store, dependencies };
}
test('retained scoped operational evidence, contradictions, authentication and restart', async () => {
  const { api, parent, child, store, dependencies } = await scenario();
  assert.equal(child.status, 'completed');
  assert.deepEqual(child.record.customerIds, ['cust_acme', 'cust_riviera']);
  const answer = await (
    await send(api, 'cross/answer', undefined, child.accessToken)
  ).json();
  assert.equal(answer.status, 'ok');
  assert.equal(answer.answer.operationalEvidenceIds.length, 3);
  assert.ok(child.warnings.some((w) => w.includes('conflict')));
  assert.ok(child.warnings.includes('support_coverage_missing'));
  assert.equal(
    (await send(api, 'cross/answer', undefined, parent.accessToken)).status,
    404,
  );
  const restarted = createMrrDeclineApi(dependencies, store);
  assert.deepEqual(
    await (
      await send(restarted, 'cross/answer', undefined, child.accessToken)
    ).json(),
    answer,
  );
  const invalid = await send(
    api,
    'parent/cross-source-follow-ups',
    { investigationId: 'bad', question: 'show all customers' },
    parent.accessToken,
  );
  assert.equal(invalid.status, 400);
});
test('model plan and citation failures are safe', async () => {
  const broken = await scenario({
    async complete() {
      return { tools: ['raw'] };
    },
  });
  assert.equal(broken.child.status, 'blocked');
  const unknown = await scenario({
    async complete(phase) {
      return phase === 'plan'
        ? { tools: ['crm'] }
        : {
            hypotheses: [
              {
                kind: 'pricing',
                supportingEvidenceIds: ['unknown'],
                contradictoryEvidenceIds: [],
              },
            ],
          };
    },
  });
  assert.equal(unknown.child.record.modelStatus, 'unavailable');
  assert.deepEqual(unknown.child.record.hypotheses, []);
  const good = await scenario({
    async complete(phase) {
      return phase === 'plan'
        ? { tools: ['support'] }
        : {
            hypotheses: [
              {
                kind: 'support',
                supportingEvidenceIds: ['ops_support'],
                contradictoryEvidenceIds: [],
              },
            ],
          };
    },
  });
  assert.equal(good.child.record.modelStatus, 'completed');
  const scoped = await scenario(undefined, ['cust_acme']);
  assert.deepEqual(scoped.child.record.customerIds, ['cust_acme']);
});
