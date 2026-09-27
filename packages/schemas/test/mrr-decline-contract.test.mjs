import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mrrDeclineRequestSchema,
  mrrDeclineResponseSchema,
} from '../dist/index.js';

test('accepts only the narrow MRR-decline request shape', () => {
  const parsed = mrrDeclineRequestSchema.safeParse({
    investigationId: 'august-decline',
    month: '2026-08-01',
    permittedCustomerIds: ['cust_churn'],
  });

  assert.equal(parsed.success, true);
  assert.equal(
    mrrDeclineRequestSchema.safeParse({
      investigationId: 'august-decline',
      month: '2026-08',
      extra: 'not permitted',
    }).success,
    false,
  );
  assert.equal(
    mrrDeclineRequestSchema.safeParse({
      investigationId: 'dup',
      month: '2026-08-01',
      permittedCustomerIds: ['cust_a', 'cust_a'],
    }).success,
    false,
  );
});

test('requires a retained investigation record for terminal API results', () => {
  const parsed = mrrDeclineResponseSchema.safeParse({
    status: 'completed',
    accessToken: 'a'.repeat(43),
    record: {
      investigationId: 'august-decline',
      kind: 'mrr_decline',
      month: '2026-08-01',
      permittedCustomerIds: ['cust_churn'],
      plan: {
        investigationId: 'august-decline',
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
      evidenceIds: ['metric_1'],
      warnings: [],
      driverCustomerIds: ['cust_churn'],
    },
    warnings: [],
  });

  assert.equal(parsed.success, true);
  assert.equal(
    mrrDeclineResponseSchema.safeParse({ status: 'completed', warnings: [] })
      .success,
    false,
  );
});
