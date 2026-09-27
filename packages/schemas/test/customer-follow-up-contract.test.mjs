import assert from 'node:assert/strict';
import test from 'node:test';
import {
  customerFollowUpRequestSchema,
  customerCountryContributionsSchema,
} from '../dist/index.js';
test('synthetic customer drill-down boundary accepts explicit country only and rejects scope overrides', () => {
  for (const country of ['DE', null])
    assert.equal(
      customerFollowUpRequestSchema.safeParse({
        investigationId: 'accounts',
        country,
      }).success,
      true,
    );
  for (const extra of [
    { month: '2026-08-01' },
    { filters: {} },
    { permittedCustomerIds: ['outside'] },
    { action: 'other' },
    { question: 'Which accounts?' },
  ])
    assert.equal(
      customerFollowUpRequestSchema.safeParse({
        investigationId: 'accounts',
        country: 'DE',
        ...extra,
      }).success,
      false,
    );
  assert.equal(
    customerFollowUpRequestSchema.safeParse({ investigationId: 'accounts' })
      .success,
    false,
  );
});
test('synthetic contributions reject inconsistent totals, ranking, offsets, duplicate customers and lifecycle labels', () => {
  const row = {
    customerId: 'synthetic_loss',
    previousMrrEurCents: 100,
    currentMrrEurCents: 50,
    mrrChangeEurCents: -50,
  };
  const value = {
    country: 'DE',
    previousMonth: '2026-07-01',
    currentMonth: '2026-08-01',
    previousMrrEurCents: 100,
    currentMrrEurCents: 50,
    mrrChangeEurCents: -50,
    rows: [row],
    largestLosses: [row],
    positiveOffsetsEurCents: 0,
    remainingNetMovementEurCents: 0,
  };
  assert.equal(
    customerCountryContributionsSchema.safeParse(value).success,
    true,
  );
  for (const change of [
    { currentMrrEurCents: 51 },
    { previousMonth: '2026-06-01' },
    { largestLosses: [] },
    { positiveOffsetsEurCents: 1 },
    { remainingNetMovementEurCents: 1 },
    { rows: [row, row] },
    { rows: [{ ...row, movement: 'churn' }] },
  ])
    assert.equal(
      customerCountryContributionsSchema.safeParse({ ...value, ...change })
        .success,
      false,
    );
});
