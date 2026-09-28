import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMrrDeclineApi } from '../dist/features/mrr/composition.js';
import { scenario, send } from './helpers/cross-source.mjs';
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

test('Germany and UK comparison continues through reconciled country accounts to bounded context', async () => {
  const { api, parent } = await scenario();
  const countries = await (
    await send(
      api,
      'parent/country-follow-ups',
      { investigationId: 'countries', question: 'Compare Germany with the UK' },
      parent.accessToken,
    )
  ).json();
  assert.equal(countries.status, 'completed');
  const comparison = await (
    await send(api, 'countries/answer', undefined, countries.accessToken)
  ).json();
  assert.ok(
    comparison.answer.comparison.rows.some((row) => row.country === 'DE'),
  );
  assert.ok(
    comparison.answer.comparison.rows.some((row) => row.country === 'GB'),
  );
  const customers = await (
    await send(
      api,
      'countries/customer-follow-ups',
      { investigationId: 'customers', country: 'DE' },
      countries.accessToken,
    )
  ).json();
  assert.equal(customers.status, 'completed');
  const context = await (
    await send(
      api,
      'customers/cross-source-follow-ups',
      {
        investigationId: 'country_context',
        question:
          'Did those accounts have support escalations or declining usage?',
      },
      customers.accessToken,
    )
  ).json();
  assert.equal(context.status, 'completed');
  assert.deepEqual(context.record.customerIds, ['cust_acme']);
  const answer = await (
    await send(api, 'country_context/answer', undefined, context.accessToken)
  ).json();
  assert.equal(answer.status, 'ok');
  assert.ok(
    answer.answer.evidence
      .find((item) => item.evidenceId === 'ops_usage')
      .content.usageComparisons.some((row) => row.activeUserChange === -40),
  );
});

test('mixed model synthesis retains valid explanations with inspectable partial-result warnings', async () => {
  const valid = [
    {
      kind: 'pricing',
      supportingEvidenceIds: ['ops_crm', 'cross_doc_0'],
      contradictoryEvidenceIds: ['ops_crm'],
    },
    {
      kind: 'support',
      supportingEvidenceIds: ['ops_support', 'cross_doc_0'],
      contradictoryEvidenceIds: [],
    },
  ];
  const { api, child, store, dependencies } = await scenario({
    async complete(phase) {
      return phase === 'plan'
        ? { tools: ['crm', 'support', 'usage'] }
        : {
            hypotheses: [
              ...valid,
              {
                kind: 'usage',
                supportingEvidenceIds: ['ops_usage'],
                contradictoryEvidenceIds: [],
              },
            ],
          };
    },
  });
  assert.equal(child.record.modelStatus, 'completed');
  assert.deepEqual(child.record.hypotheses, valid);
  assert.ok(
    child.warnings.includes(
      'Rejected usage hypothesis: cited evidence is stale, incomplete or invalid.',
    ),
  );
  assert.ok(
    child.warnings.includes(
      'Model synthesis is partial; only validated hypotheses are shown.',
    ),
  );
  const answer = await (
    await send(api, 'cross/answer', undefined, child.accessToken)
  ).json();
  assert.equal(answer.status, 'ok');
  assert.equal(
    answer.answer.evidence.find((e) => e.evidenceId === 'ops_usage').integrity,
    'warning',
  );
  const restarted = createMrrDeclineApi(dependencies, store);
  assert.deepEqual(
    await (
      await send(restarted, 'cross/answer', undefined, child.accessToken)
    ).json(),
    answer,
  );
});
