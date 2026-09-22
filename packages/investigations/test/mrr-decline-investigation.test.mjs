import assert from 'node:assert/strict';
import test from 'node:test';

import { MrrDeclineInvestigationService } from '../dist/index.js';
import { TrustedMrrService } from '../../metrics/dist/index.js';
import { createCompanyKnowledgeSearch } from '../../retrieval/dist/index.js';

function evidence(id, integrity = 'valid') {
  return { evidenceId: id, integrity };
}

function ok(value, id, warnings = []) {
  return { status: 'ok', value, evidence: [evidence(id)], warnings };
}

function fixtureTools(overrides = {}) {
  const calls = [];
  const tools = {
    async compareMrr(input) {
      calls.push(['compareMrr', input]);
      return ok({ absoluteChangeEurCents: -170_000 }, 'compare');
    },
    async getMrrMovement(input) {
      calls.push(['getMrrMovement', input]);
      return ok({ reconciles: true }, 'movement');
    },
    async getCustomerMrrMovement(input) {
      calls.push(['getCustomerMrrMovement', input]);
      return ok(
        {
          rows: [
            { customerId: 'cust_churn', mrrChangeEurCents: -240_000 },
            { customerId: 'cust_contract', mrrChangeEurCents: -10_000 },
            { customerId: 'cust_expand', mrrChangeEurCents: 20_000 },
          ],
        },
        'customers',
      );
    },
    async breakdownMrr(input) {
      calls.push(['breakdownMrr', input]);
      return ok({ reconciles: true }, 'breakdown');
    },
    async searchCompanyKnowledge(input) {
      calls.push(['searchCompanyKnowledge', input]);
      return {
        status: 'ok',
        hits: [{ evidence: evidence('knowledge') }],
        warnings: [],
      };
    },
    ...overrides,
  };
  return { tools, calls };
}

test('runs the fixed MRR-decline plan with scoped evidence and retained context', async () => {
  const fixture = fixtureTools();
  const service = new MrrDeclineInvestigationService(fixture.tools);

  const result = await service.start({
    investigationId: 'investigation_2026_08',
    month: '2026-08-01',
    permittedCustomerIds: ['cust_churn', 'cust_contract'],
  });

  assert.equal(result.status, 'completed');
  assert.deepEqual(result.record, {
    investigationId: 'investigation_2026_08',
    kind: 'mrr_decline',
    month: '2026-08-01',
    permittedCustomerIds: ['cust_churn', 'cust_contract'],
    plan: {
      investigationId: 'investigation_2026_08',
      steps: [
        'compare_mrr',
        'get_mrr_movement',
        'get_customer_mrr_movement',
        'breakdown_mrr_by_plan',
        'search_company_knowledge',
      ],
      maximumToolCalls: 5,
    },
    status: 'completed',
    evidenceIds: ['compare', 'movement', 'customers', 'breakdown', 'knowledge'],
    warnings: [],
    driverCustomerIds: ['cust_churn', 'cust_contract'],
  });
  assert.deepEqual(fixture.calls, [
    [
      'compareMrr',
      {
        month: '2026-08-01',
        filters: { customerIds: ['cust_churn', 'cust_contract'] },
      },
    ],
    [
      'getMrrMovement',
      {
        month: '2026-08-01',
        filters: { customerIds: ['cust_churn', 'cust_contract'] },
      },
    ],
    [
      'getCustomerMrrMovement',
      {
        month: '2026-08-01',
        filters: { customerIds: ['cust_churn', 'cust_contract'] },
        limit: 5,
      },
    ],
    [
      'breakdownMrr',
      {
        month: '2026-08-01',
        filters: { customerIds: ['cust_churn', 'cust_contract'] },
        groupBy: 'plan',
      },
    ],
    [
      'searchCompanyKnowledge',
      {
        query: 'cancelled pricing payment support',
        customerIds: ['cust_churn', 'cust_contract'],
        limit: 5,
      },
    ],
  ]);

  const context = service.getFollowUpContext('investigation_2026_08');
  assert.equal(context.status, 'ok');
  assert.deepEqual(context.record, result.record);
  assert.equal(fixture.calls.length, 5);
});

test('blocks on unreconciled movement without looking for a convenient narrative', async () => {
  const fixture = fixtureTools({
    async getMrrMovement(input) {
      fixture.calls.push(['getMrrMovement', input]);
      return ok({ reconciles: false }, 'movement-invalid');
    },
  });
  const service = new MrrDeclineInvestigationService(fixture.tools);

  const result = await service.start({
    investigationId: 'unreconciled',
    month: '2026-08-01',
  });

  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.record?.evidenceIds, ['compare', 'movement-invalid']);
  assert.deepEqual(result.warnings, ['mrr_movement_not_reconciled']);
  assert.deepEqual(
    fixture.calls.map(([name]) => name),
    ['compareMrr', 'getMrrMovement'],
  );
});

test('keeps incomplete breakdowns as limitations when required evidence is valid', async () => {
  const fixture = fixtureTools({
    async breakdownMrr(input) {
      fixture.calls.push(['breakdownMrr', input]);
      return ok({ reconciles: false }, 'breakdown', [
        'missing_breakdown_dimension',
      ]);
    },
  });
  const service = new MrrDeclineInvestigationService(fixture.tools);

  const result = await service.start({
    investigationId: 'incomplete-breakdown',
    month: '2026-08-01',
  });

  assert.equal(result.status, 'completed');
  assert.deepEqual(result.warnings, [
    'missing_breakdown_dimension',
    'mrr_breakdown_incomplete',
  ]);
});

test('rejects malformed and duplicate requests before starting tools', async () => {
  const fixture = fixtureTools();
  const service = new MrrDeclineInvestigationService(fixture.tools);

  const malformed = await service.start({
    investigationId: 'bad scope',
    month: '2026-08',
    extra: true,
  });
  assert.equal(malformed.status, 'invalid_request');
  assert.equal(fixture.calls.length, 0);

  await service.start({ investigationId: 'one-time', month: '2026-08-01' });
  const duplicate = await service.start({
    investigationId: 'one-time',
    month: '2026-08-01',
  });
  assert.equal(duplicate.status, 'invalid_request');
  assert.match(duplicate.error ?? '', /already been used/);
  assert.equal(fixture.calls.length, 5);
  assert.equal(service.getFollowUpContext('missing').status, 'not_found');
});

test('composes trusted metric and knowledge capabilities without generated claims', async () => {
  const july = [
    subscription('cust_churn', '2026-07-01', 240_000),
    subscription('cust_steady', '2026-07-01', 100_000),
  ];
  const august = [
    subscription('cust_churn', '2026-08-01', 0),
    subscription('cust_steady', '2026-08-01', 100_000),
  ];
  let evidenceId = 0;
  const metrics = new TrustedMrrService(
    {
      async getMonth(month) {
        return month === '2026-07-01'
          ? july
          : month === '2026-08-01'
            ? august
            : [];
      },
      async freshness() {
        return '2026-09-01T08:00:00Z';
      },
    },
    { nextEvidenceId: (prefix) => `${prefix}-${++evidenceId}` },
  );
  const knowledge = createCompanyKnowledgeSearch([
    {
      documentId: 'sales-review',
      title: 'Synthetic sales review',
      source: 'synthetic_knowledge',
      observedAt: '2026-08-20T12:00:00Z',
      freshness: '2026-09-01T08:00:00Z',
      customerIds: ['cust_churn'],
      content:
        'The customer cancelled after a pricing discussion and payment-support escalation.',
    },
  ]);
  const service = new MrrDeclineInvestigationService({
    compareMrr: (input) => metrics.compareMrr(input),
    getMrrMovement: (input) => metrics.getMrrMovement(input),
    getCustomerMrrMovement: (input) => metrics.getCustomerMrrMovement(input),
    breakdownMrr: (input) => metrics.breakdownMrr(input),
    searchCompanyKnowledge: (input) => knowledge.search(input),
  });

  const result = await service.start({
    investigationId: 'composed-services',
    month: '2026-08-01',
  });

  assert.equal(result.status, 'completed');
  assert.deepEqual(result.record?.driverCustomerIds, ['cust_churn']);
  assert.equal(result.record?.evidenceIds.length, 9);
  assert.deepEqual(result.warnings, []);
});

function subscription(customerId, month, mrrEurCents) {
  return {
    customerId,
    subscriptionId: `${customerId}-subscription`,
    month,
    mrrEurCents,
    isActiveAtMonthEnd: mrrEurCents > 0,
    plan: 'enterprise',
    country: 'DE',
    region: 'dach',
    industry: 'technology',
    companySize: 'mid_market',
  };
}
