import assert from 'node:assert/strict';
import test from 'node:test';
import { synthesizeCountryFollowUpAnswer } from '../dist/index.js';
const value = {
  currentMonth: '2026-08-01',
  previousMonth: '2026-07-01',
  previousMrrEurCents: 100,
  currentMrrEurCents: 80,
  mrrChangeEurCents: -20,
  missingDimensions: false,
  rows: [
    {
      country: 'DE',
      previousMrrEurCents: 100,
      currentMrrEurCents: 80,
      mrrChangeEurCents: -20,
    },
  ],
};
function fixture() {
  const query = (id, month, total, parent) => ({
    evidenceId: id,
    type: 'metric_query',
    source: 'analytics.subscription_month',
    sourceRef: id,
    observedAt: month,
    retrievedAt: '2026-09-01T09:00:00Z',
    freshness: '2026-09-01T08:00:00Z',
    integrity: 'valid',
    scope: {
      month,
      filters: { customerIds: ['allowed'] },
      metric: 'mrr',
      ...(parent ? {} : { groupBy: 'country' }),
    },
    content: parent
      ? { month, mrrEurCents: total }
      : {
          month,
          groupBy: 'country',
          totalMrrEurCents: total,
          groupedMrrEurCents: total,
          reconciles: true,
          unassignedMrrEurCents: 0,
          rows: [{ dimensionValue: 'DE', mrrEurCents: total }],
        },
  });
  const evidence = [
    query('parent_before', value.previousMonth, 100, true),
    query('parent_after', value.currentMonth, 80, true),
    query('before', value.previousMonth, 100),
    query('after', value.currentMonth, 80),
  ];
  evidence.push({
    ...evidence[0],
    evidenceId: 'calc',
    type: 'calculation',
    source: 'trusted_mrr_service',
    scope: {},
    content: {
      ...value,
      formula: 'country_change',
      inputEvidenceIds: ['before', 'after'],
    },
  });
  const record = {
    investigationId: 'child',
    parentInvestigationId: 'parent',
    kind: 'mrr_country_follow_up',
    month: value.currentMonth,
    permittedCustomerIds: ['allowed'],
    plan: {
      investigationId: 'child',
      steps: [
        'breakdown_mrr_by_country_previous',
        'breakdown_mrr_by_country_current',
      ],
      maximumToolCalls: 2,
    },
    status: 'completed',
    evidenceIds: evidence.map((item) => item.evidenceId),
    warnings: [],
  };
  return { record, evidence };
}
test('country answer copies retained values and rejects tampered provenance or evidence', () => {
  const { record, evidence } = fixture();
  assert.equal(synthesizeCountryFollowUpAnswer(record, evidence).status, 'ok');
  for (const mutate of [
    (items) => {
      items[3].scope.filters.customerIds = ['other'];
    },
    (items) => {
      items[3].scope.month = '2026-09-01';
    },
    (items) => {
      items[3].content.rows[0].mrrEurCents = 81;
    },
    (items) => {
      items[1].content.mrrEurCents = 90;
    },
    (items) => {
      items[4].content.inputEvidenceIds = ['missing', 'after'];
    },
    (items) => {
      items[3].integrity = 'invalid';
    },
    (items) => {
      items[4].content.rows[0].mrrChangeEurCents = -19;
    },
    (items) => {
      items[3].content.rows = [null];
    },
    (items) => {
      items.push(items[0]);
    },
  ]) {
    const changed = structuredClone(evidence);
    mutate(changed);
    assert.equal(
      synthesizeCountryFollowUpAnswer(record, changed).status,
      'answer_unavailable',
    );
  }
  assert.equal(
    synthesizeCountryFollowUpAnswer({ ...record, status: 'blocked' }, evidence)
      .status,
    'answer_unavailable',
  );
});

test('missing-country evidence returns an explicit unassigned row with both values', () => {
  const { record, evidence } = fixture();
  for (const item of evidence.slice(2, 4)) {
    item.content.unassignedMrrEurCents = item.content.totalMrrEurCents;
    item.content.groupedMrrEurCents = 0;
    item.content.reconciles = false;
    item.content.rows = [];
    item.integrity = 'warning';
  }
  evidence[4].content.rows[0].country = null;
  evidence[4].content.missingDimensions = true;
  evidence[4].integrity = 'warning';
  const result = synthesizeCountryFollowUpAnswer(record, evidence);
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.answer.comparison.rows, [
    {
      country: null,
      previousMrrEurCents: 100,
      currentMrrEurCents: 80,
      mrrChangeEurCents: -20,
    },
  ]);
  assert.match(result.answer.limitations.join(' '), /unassigned/);
});
