import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createSubscriptionMonthRepository } from '../dist/index.js';

const fixtureUrl = new URL(
  '../../../data/synthetic/subscription-month-2026.json',
  import.meta.url,
);

async function fixture() {
  return JSON.parse(await readFile(fixtureUrl, 'utf8'));
}

test('loads the labeled synthetic snapshot by complete UTC month', async () => {
  const snapshot = await fixture();
  const repository = createSubscriptionMonthRepository(snapshot);

  const july = await repository.getMonth('2026-07-01');
  const august = await repository.getMonth('2026-08-01');

  assert.match(snapshot.label, /^Synthetic data/);
  assert.equal(july.length, 5);
  assert.equal(august.length, 5);
  assert.ok(Object.isFrozen(july));
  assert.ok(Object.isFrozen(july[0]));
  assert.equal(await repository.freshness(), '2026-09-01T08:00:00Z');
});

test("preserves the fixture's MRR reconciliation inputs", async () => {
  const repository = createSubscriptionMonthRepository(await fixture());
  const total = async (month) =>
    (await repository.getMonth(month)).reduce(
      (sum, row) => sum + row.mrrEurCents,
      0,
    );

  assert.equal(await total('2026-07-01'), 540_000);
  assert.equal(await total('2026-08-01'), 370_000);
});

test('rejects ambiguous source rows before they become metric inputs', () => {
  assert.throws(
    () =>
      createSubscriptionMonthRepository({
        freshness: '2026-09-01T08:00:00Z',
        rows: [
          {
            customerId: 'cust_1',
            subscriptionId: 'sub_1',
            month: '2026-08-15',
            mrrEurCents: 100,
            isActiveAtMonthEnd: true,
            cancelledAt: null,
            plan: 'growth',
            country: 'DE',
            region: 'dach',
            industry: 'technology',
            companySize: 'mid_market',
          },
        ],
      }),
    /Invalid subscription-month value/,
  );
});
