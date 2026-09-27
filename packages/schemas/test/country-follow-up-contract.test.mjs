import assert from 'node:assert/strict';
import test from 'node:test';
import {
  countryFollowUpRequestSchema,
  countryMrrComparisonSchema,
} from '../dist/index.js';
test('follow-up requests cannot provide new scope or ambiguously mix input modes', () => {
  const input = {
    investigationId: 'country',
    action: 'breakdown_mrr_by_country',
  };
  assert.equal(countryFollowUpRequestSchema.safeParse(input).success, true);
  for (const value of [
    { ...input, month: '2026-08-01' },
    { ...input, permittedCustomerIds: ['another'] },
    { ...input, question: 'Break that down by country' },
    { investigationId: 'country' },
  ])
    assert.equal(countryFollowUpRequestSchema.safeParse(value).success, false);
});
test('country comparison rejects inconsistent totals, periods, duplicate countries, unsafe values and hidden missing dimensions', () => {
  const input = {
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
  assert.equal(countryMrrComparisonSchema.safeParse(input).success, true);
  for (const value of [
    { ...input, currentMrrEurCents: 81 },
    { ...input, previousMonth: '2026-06-01' },
    { ...input, rows: [...input.rows, ...input.rows] },
    { ...input, rows: [{ ...input.rows[0], country: null }] },
    { ...input, currentMrrEurCents: Number.MAX_SAFE_INTEGER + 1 },
  ])
    assert.equal(countryMrrComparisonSchema.safeParse(value).success, false);
});
