import assert from 'node:assert/strict';
import test from 'node:test';

import { TrustedMrrService } from '../dist/index.js';

const JULY = '2026-07-01';
const AUGUST = '2026-08-01';

function record(customerId, month, mrrEurCents, options = {}) {
  return {
    customerId,
    subscriptionId: `${customerId}-subscription-${options.suffix ?? 'one'}`,
    month,
    mrrEurCents,
    isActiveAtMonthEnd: options.isActiveAtMonthEnd ?? mrrEurCents > 0,
    plan: options.plan ?? 'enterprise',
    country: options.country ?? 'DE',
    region: options.region ?? 'EMEA',
    industry: options.industry ?? 'software',
    companySize: options.companySize ?? 'mid-market',
  };
}

function fixtureRepository(months) {
  let calls = 0;
  return {
    async getMonth(month) {
      calls += 1;
      return months[month] ?? [];
    },
    async freshness() {
      return '2026-09-01T08:00:00Z';
    },
    calls: () => calls,
  };
}

function fixture() {
  return fixtureRepository({
    [JULY]: [
      record('cust_expand', JULY, 100_000),
      record('cust_contract', JULY, 100_000),
      record('cust_churn', JULY, 240_000),
      record('cust_steady', JULY, 100_000),
    ],
    [AUGUST]: [
      record('cust_new', AUGUST, 60_000),
      record('cust_expand', AUGUST, 120_000),
      record('cust_contract', AUGUST, 90_000),
      record('cust_churn', AUGUST, 0, { isActiveAtMonthEnd: false }),
      record('cust_steady', AUGUST, 100_000),
    ],
  });
}

function service(repository) {
  let id = 0;
  return new TrustedMrrService(repository, {
    now: () => '2026-09-01T09:00:00Z',
    nextEvidenceId: (prefix) => `${prefix}-${++id}`,
  });
}

test('returns August MRR with metric-query evidence', async () => {
  const result = await service(fixture()).getMrr({ month: AUGUST });

  assert.equal(result.status, 'ok');
  assert.equal(result.value?.mrrEurCents, 370_000);
  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0]?.type, 'metric_query');
  assert.equal(result.evidence[0]?.integrity, 'valid');
});

test('compares equivalent months and supplies calculation evidence', async () => {
  const result = await service(fixture()).compareMrr({ month: AUGUST });

  assert.equal(result.status, 'ok');
  assert.equal(result.value?.previous.mrrEurCents, 540_000);
  assert.equal(result.value?.absoluteChangeEurCents, -170_000);
  assert.equal(result.value?.percentChange, -170_000 / 540_000);
  assert.equal(result.evidence[2]?.type, 'calculation');
  assert.equal(result.evidence[2]?.integrity, 'valid');
});

test('classifies movement after aggregating customer subscriptions', async () => {
  const repository = fixtureRepository({
    [JULY]: [
      record('cust_split', JULY, 50_000, { suffix: 'one' }),
      record('cust_split', JULY, 50_000, { suffix: 'two' }),
      record('cust_churn', JULY, 240_000),
    ],
    [AUGUST]: [
      record('cust_split', AUGUST, 100_000, { suffix: 'two' }),
      record('cust_churn', AUGUST, 0, { isActiveAtMonthEnd: false }),
      record('cust_new', AUGUST, 60_000),
      record('cust_expand', AUGUST, 120_000),
      record('cust_expand', JULY, 100_000),
      record('cust_contract', AUGUST, 90_000),
      record('cust_contract', JULY, 100_000),
    ],
  });
  // Keep the paired records in their correct monthly snapshots.
  repository.getMonth = async (month) => {
    if (month === JULY) {
      return [
        record('cust_split', JULY, 50_000, { suffix: 'one' }),
        record('cust_split', JULY, 50_000, { suffix: 'two' }),
        record('cust_churn', JULY, 240_000),
        record('cust_expand', JULY, 100_000),
        record('cust_contract', JULY, 100_000),
      ];
    }
    if (month === AUGUST) {
      return [
        record('cust_split', AUGUST, 100_000, { suffix: 'two' }),
        record('cust_churn', AUGUST, 0, { isActiveAtMonthEnd: false }),
        record('cust_new', AUGUST, 60_000),
        record('cust_expand', AUGUST, 120_000),
        record('cust_contract', AUGUST, 90_000),
      ];
    }
    return [];
  };

  const result = await service(repository).getMrrMovement({ month: AUGUST });

  assert.equal(result.status, 'ok');
  assert.deepEqual(result.value, {
    previousMonth: JULY,
    currentMonth: AUGUST,
    priorMrrEurCents: 540_000,
    currentMrrEurCents: 370_000,
    newMrrEurCents: 60_000,
    expansionMrrEurCents: 20_000,
    contractionMrrEurCents: 10_000,
    churnedMrrEurCents: 240_000,
    reconciles: true,
  });
  assert.equal(result.evidence[2]?.integrity, 'valid');
});

test('rejects a partial month before reading a repository', async () => {
  const repository = fixture();
  const result = await service(repository).getMrr({ month: '2026-08-15' });

  assert.equal(result.status, 'invalid_request');
  assert.equal(repository.calls(), 0);
});

test('rejects unknown filter fields before reading a repository', async () => {
  const repository = fixture();
  const result = await service(repository).getMrr({
    month: AUGUST,
    filters: { 'region; DROP TABLE': 'EMEA' },
  });

  assert.equal(result.status, 'invalid_request');
  assert.equal(repository.calls(), 0);
});

test('does not fabricate a comparison when the previous snapshot is unavailable', async () => {
  const repository = fixtureRepository({
    [AUGUST]: [record('cust_new', AUGUST, 60_000)],
  });
  const result = await service(repository).compareMrr({ month: AUGUST });

  assert.equal(result.status, 'data_unavailable');
  assert.deepEqual(result.evidence, []);
  assert.deepEqual(result.warnings, ['month_not_available']);
});

test('returns null and a warning for a zero comparison denominator', async () => {
  const repository = fixtureRepository({
    [JULY]: [record('cust_new', JULY, 0, { isActiveAtMonthEnd: false })],
    [AUGUST]: [record('cust_new', AUGUST, 60_000)],
  });
  const result = await service(repository).compareMrr({ month: AUGUST });

  assert.equal(result.status, 'ok');
  assert.equal(result.value?.percentChange, null);
  assert.deepEqual(result.warnings, ['zero_comparison_denominator']);
  assert.equal(result.evidence[2]?.integrity, 'warning');
});
