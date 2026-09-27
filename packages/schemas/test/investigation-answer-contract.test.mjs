import assert from 'node:assert/strict';
import test from 'node:test';
import { investigationAnswerSchema } from '../dist/index.js';

// Synthetic answer contract fixture; values come from trusted metric evidence.
function answer() {
  return {
    investigationId: 'synthetic-answer',
    scope: {
      month: '2026-08-01',
      comparison: 'previous_period',
      permittedCustomerIds: [],
    },
    answer: {
      classification: 'calculated_delta',
      text: 'MRR fell EUR 100.00.',
      evidenceIds: ['change'],
    },
    drivers: [],
    context: [],
    limitations: [],
    evidence: [
      {
        evidenceId: 'change',
        sourceRef: 'mrr_calculation',
        type: 'calculation',
        freshness: '2026-09-01T00:00:00Z',
      },
    ],
    recommendedNextStep: {
      owner: 'Revenue operations',
      text: 'Review account movements.',
      customerIds: [],
    },
  };
}

test('accepts cited answers and rejects missing, mistyped or duplicate citations', () => {
  assert.equal(investigationAnswerSchema.safeParse(answer()).success, true);
  for (const mutate of [
    (value) => {
      value.answer.evidenceIds = [];
    },
    (value) => {
      value.answer.evidenceIds = ['unknown'];
    },
    (value) => {
      value.evidence[0].type = 'document_chunk';
    },
    (value) => {
      value.evidence.push(value.evidence[0]);
    },
    (value) => {
      value.answer.classification = 'hypothesis';
    },
  ]) {
    const value = answer();
    mutate(value);
    assert.equal(investigationAnswerSchema.safeParse(value).success, false);
  }
});

test('synthetic chart contract rejects malformed values, provenance and scope', () => {
  const value = answer();
  value.evidence.push({
    ...value.evidence[0],
    evidenceId: 'plan',
    type: 'metric_query',
  });
  value.chart = {
    chartType: 'bar',
    month: '2026-08-01',
    permittedCustomerIds: [],
    sourceEvidenceId: 'plan',
    reconciles: true,
    unassignedMrrEurCents: 0,
    data: [{ dimensionValue: 'growth', mrrEurCents: 30000 }],
  };
  assert.equal(investigationAnswerSchema.safeParse(value).success, true);
  for (const mutate of [
    (v) => {
      v.chart.sourceEvidenceId = 'missing';
    },
    (v) => {
      v.chart.sourceEvidenceId = 'change';
    },
    (v) => {
      v.chart.month = '2026-07-01';
    },
    (v) => {
      v.chart.permittedCustomerIds = ['outside_scope'];
    },
    (v) => {
      v.chart.data[0].mrrEurCents = 1.5;
    },
    (v) => {
      v.chart.data[0].mrrEurCents = Number.MAX_SAFE_INTEGER + 1;
    },
    (v) => {
      v.chart.data.push(v.chart.data[0]);
    },
    (v) => {
      v.chart.unassignedMrrEurCents = 10;
    },
  ]) {
    const changed = structuredClone(value);
    mutate(changed);
    assert.equal(investigationAnswerSchema.safeParse(changed).success, false);
  }
});
