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
