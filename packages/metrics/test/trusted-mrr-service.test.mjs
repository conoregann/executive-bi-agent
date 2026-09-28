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

test('returns bounded customer MRR movements ranked by largest loss', async () => {
  const result = await service(fixture()).getCustomerMrrMovement({
    month: AUGUST,
    limit: 3,
  });

  assert.equal(result.status, 'ok');
  assert.deepEqual(result.value, {
    currentMonth: AUGUST,
    previousMonth: JULY,
    rows: [
      {
        customerId: 'cust_churn',
        previousMrrEurCents: 240_000,
        currentMrrEurCents: 0,
        mrrChangeEurCents: -240_000,
        movement: 'churn',
      },
      {
        customerId: 'cust_contract',
        previousMrrEurCents: 100_000,
        currentMrrEurCents: 90_000,
        mrrChangeEurCents: -10_000,
        movement: 'contraction',
      },
      {
        customerId: 'cust_expand',
        previousMrrEurCents: 100_000,
        currentMrrEurCents: 120_000,
        mrrChangeEurCents: 20_000,
        movement: 'expansion',
      },
    ],
  });
  assert.equal(
    result.evidence[0]?.sourceRef,
    'mrr_movement:2026-08-01:customers',
  );
  assert.equal(result.evidence[0]?.integrity, 'valid');
});

test('applies customer scope and rejects unbounded customer movement requests', async () => {
  const repository = fixture();
  const scoped = await service(repository).getCustomerMrrMovement({
    month: AUGUST,
    filters: { customerIds: ['cust_churn'] },
  });
  assert.equal(scoped.status, 'ok');
  assert.deepEqual(
    scoped.value?.rows.map((row) => row.customerId),
    ['cust_churn'],
  );

  const invalid = await service(repository).getCustomerMrrMovement({
    month: AUGUST,
    limit: 101,
  });
  assert.equal(invalid.status, 'invalid_request');
  assert.deepEqual(invalid.evidence, []);
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

test('returns a ranked, reconciled MRR breakdown for an allowed dimension', async () => {
  const repository = fixtureRepository({
    [AUGUST]: [
      record('cust_enterprise', AUGUST, 120_000, { plan: 'enterprise' }),
      record('cust_growth', AUGUST, 150_000, { plan: 'growth' }),
      record('cust_starter', AUGUST, 100_000, { plan: 'starter' }),
    ],
  });

  const result = await service(repository).breakdownMrr({
    month: AUGUST,
    groupBy: 'plan',
  });

  assert.equal(result.status, 'ok');
  assert.deepEqual(result.value, {
    month: AUGUST,
    groupBy: 'plan',
    totalMrrEurCents: 370_000,
    groupedMrrEurCents: 370_000,
    unassignedMrrEurCents: 0,
    reconciles: true,
    rows: [
      { dimensionValue: 'growth', mrrEurCents: 150_000 },
      { dimensionValue: 'enterprise', mrrEurCents: 120_000 },
      { dimensionValue: 'starter', mrrEurCents: 100_000 },
    ],
  });
  assert.equal(result.evidence[0]?.type, 'metric_query');
  assert.equal(result.evidence[0]?.integrity, 'valid');
});

test('marks a breakdown with an unavailable dimension as incomplete', async () => {
  const repository = fixtureRepository({
    [AUGUST]: [
      record('cust_named', AUGUST, 100_000, { region: 'EMEA' }),
      record('cust_unassigned', AUGUST, 50_000, { region: '' }),
    ],
  });

  const result = await service(repository).breakdownMrr({
    month: AUGUST,
    groupBy: 'region',
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.value?.totalMrrEurCents, 150_000);
  assert.equal(result.value?.groupedMrrEurCents, 100_000);
  assert.equal(result.value?.unassignedMrrEurCents, 50_000);
  assert.equal(result.value?.reconciles, false);
  assert.deepEqual(result.warnings, ['missing_breakdown_dimension']);
  assert.equal(result.evidence[0]?.integrity, 'warning');
});

test('rejects unsupported breakdown fields before reading a repository', async () => {
  const repository = fixture();
  const result = await service(repository).breakdownMrr({
    month: AUGUST,
    groupBy: 'customerId',
  });

  assert.equal(result.status, 'invalid_request');
  assert.equal(repository.calls(), 0);
});

test('creates a chart specification from breakdown data and evidence only', async () => {
  const result = await service(fixture()).createMrrBreakdownChart({
    month: AUGUST,
    groupBy: 'plan',
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.value?.chartType, 'bar');
  assert.equal(result.value?.sourceEvidenceId, result.evidence[0]?.evidenceId);
  assert.deepEqual(result.value?.data, [
    { dimensionValue: 'enterprise', mrrEurCents: 370_000 },
  ]);
  assert.equal(result.evidence[1]?.type, 'calculation');
  assert.deepEqual(result.evidence[1]?.content.inputEvidenceIds, [
    result.evidence[0]?.evidenceId,
  ]);
});

test('country comparison reconciles both months, includes entering/exiting countries and explicit missing dimensions', async () => {
  const repository = fixtureRepository({
    [JULY]: [
      record('moving', JULY, 100, { country: 'DE' }),
      record('missing', JULY, 50, { country: '' }),
    ],
    [AUGUST]: [
      record('moving', AUGUST, 100, { country: 'GB' }),
      record('missing', AUGUST, 30, { country: '' }),
    ],
  });
  const result = await service(repository).compareCountryMrr({ month: AUGUST });
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.value.rows, [
    {
      country: 'DE',
      previousMrrEurCents: 100,
      currentMrrEurCents: 0,
      mrrChangeEurCents: -100,
    },
    {
      country: null,
      previousMrrEurCents: 50,
      currentMrrEurCents: 30,
      mrrChangeEurCents: -20,
    },
    {
      country: 'GB',
      previousMrrEurCents: 0,
      currentMrrEurCents: 100,
      mrrChangeEurCents: 100,
    },
  ]);
  assert.equal(result.value.mrrChangeEurCents, -20);
  assert.equal(result.evidence[2].integrity, 'warning');
  assert.deepEqual(
    result.evidence[2].content.inputEvidenceIds,
    result.evidence.slice(0, 2).map((item) => item.evidenceId),
  );
  const calls = repository.calls();
  assert.equal(
    (
      await service(repository).compareCountryMrr({
        month: AUGUST,
        groupBy: 'plan',
      })
    ).status,
    'invalid_request',
  );
  assert.equal(repository.calls(), calls);
  assert.equal(
    (
      await service(
        fixtureRepository({ [AUGUST]: [record('a', AUGUST, 100)] }),
      ).compareCountryMrr({ month: AUGUST })
    ).status,
    'data_unavailable',
  );
});

test('synthetic country contributions aggregate subscriptions and transfers without lifecycle labels', async () => {
  const repo = fixtureRepository({
    [JULY]: [
      record('transfer', JULY, 100),
      record('multi', JULY, 50),
      record('multi', JULY, 70, { suffix: 'two' }),
    ],
    [AUGUST]: [
      record('transfer', AUGUST, 100, { country: 'GB' }),
      record('multi', AUGUST, 80),
      record('gain', AUGUST, 40),
    ],
  });
  const result = await service(repo).getCustomerCountryContributions({
    month: AUGUST,
    country: 'DE',
  });
  assert.equal(result.status, 'ok');
  assert.deepEqual(
    result.value.largestLosses.map((row) => [
      row.customerId,
      row.mrrChangeEurCents,
    ]),
    [
      ['transfer', -100],
      ['multi', -40],
    ],
  );
  assert.equal(result.value.previousMrrEurCents, 220);
  assert.equal(result.value.currentMrrEurCents, 120);
  assert.equal(result.value.positiveOffsetsEurCents, 40);
  assert.equal(result.value.remainingNetMovementEurCents, 0);
  assert.ok(result.value.rows.every((row) => !('movement' in row)));
});
test('synthetic contributions retain five losses, all offsets and remaining losses deterministically', async () => {
  const repo = fixtureRepository({
    [JULY]: Array.from({ length: 7 }, (_, index) =>
      record(`loss_${index}`, JULY, 100),
    ),
    [AUGUST]: [record('gain', AUGUST, 50)],
  });
  const result = await service(repo).getCustomerCountryContributions({
    month: AUGUST,
    country: 'DE',
  });
  assert.equal(result.value.largestLosses.length, 5);
  assert.deepEqual(
    result.value.largestLosses.map((row) => row.customerId),
    ['loss_0', 'loss_1', 'loss_2', 'loss_3', 'loss_4'],
  );
  assert.equal(result.value.positiveOffsetsEurCents, 50);
  assert.equal(result.value.remainingNetMovementEurCents, -200);
  assert.equal(result.value.mrrChangeEurCents, -650);
  assert.equal(result.value.rows.length, 8);
});
test('synthetic contributions reject invalid requests before reads and never zero missing months', async () => {
  const repo = fixture();
  const metrics = service(repo);
  for (const input of [
    { month: AUGUST },
    { month: AUGUST, country: '' },
    { month: AUGUST, country: 'DE', limit: 5 },
    { month: AUGUST, country: 'DE', filters: { plan: 'enterprise' } },
  ])
    assert.equal(
      (await metrics.getCustomerCountryContributions(input)).status,
      'invalid_request',
    );
  assert.equal(repo.calls(), 0);
  assert.equal(
    (
      await metrics.getCustomerCountryContributions({
        month: JULY,
        country: 'DE',
      })
    ).status,
    'data_unavailable',
  );
  const scoped = await metrics.getCustomerCountryContributions({
    month: AUGUST,
    country: 'DE',
    filters: { customerIds: ['cust_expand'] },
  });
  assert.deepEqual(
    scoped.value.rows.map((row) => row.customerId),
    ['cust_expand'],
  );
  assert.equal(scoped.value.largestLosses.length, 0);
  assert.equal(scoped.value.positiveOffsetsEurCents, 20000);
});

test('synthetic unassigned country and empty selected country reconcile without substituting missing months', async () => {
  const metrics = service(
    fixtureRepository({
      [JULY]: [record('synthetic_unassigned', JULY, 100, { country: '' })],
      [AUGUST]: [record('synthetic_unassigned', AUGUST, 50, { country: '' })],
    }),
  );
  const result = await metrics.getCustomerCountryContributions({
    month: AUGUST,
    country: null,
  });
  assert.equal(result.value.mrrChangeEurCents, -50);
  assert.equal(result.value.country, null);
  const empty = await metrics.getCustomerCountryContributions({
    month: AUGUST,
    country: 'DE',
  });
  assert.equal(empty.status, 'ok');
  assert.equal(empty.value.currentMrrEurCents, 0);
  assert.equal(empty.value.previousMrrEurCents, 0);
  assert.deepEqual(empty.value.rows, []);
});

test('synthetic unsafe contribution totals never carry valid calculation evidence', async () => {
  const metrics = service(
    fixtureRepository({
      [JULY]: [
        record('synthetic_large', JULY, Number.MAX_SAFE_INTEGER),
        record('synthetic_extra', JULY, 1),
      ],
      [AUGUST]: [record('synthetic_large', AUGUST, 100)],
    }),
  );
  const result = await metrics.getCustomerCountryContributions({
    month: AUGUST,
    country: 'DE',
  });
  assert.equal(result.evidence.at(-1).integrity, 'invalid');
  assert.deepEqual(result.warnings, [
    'customer_country_contributions_not_reconciled',
  ]);
});

test('retained waterfall reconciles and rejects corrupted movement', async () => {
  const { createRetainedMrrWaterfall } = await import('../dist/index.js');
  const movement = {
    priorMrrEurCents: 420000,
    newMrrEurCents: 60000,
    expansionMrrEurCents: 20000,
    contractionMrrEurCents: 10000,
    churnedMrrEurCents: 240000,
    currentMrrEurCents: 250000,
    reconciles: true,
  };
  const chart = createRetainedMrrWaterfall(movement, 'movement');
  assert.equal(chart.data.at(-2).endEurCents, 250000);
  assert.equal(chart.data.at(-1).valueEurCents, 250000);
  assert.equal(
    createRetainedMrrWaterfall(
      { ...movement, currentMrrEurCents: 0 },
      'movement',
    ),
    undefined,
  );
});
