import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  createPostgresSubscriptionMonthRepository,
  createSubscriptionMonthRepository,
} from '../dist/index.js';

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
  const june = await repository.getMonth('2026-06-01');

  assert.match(snapshot.label, /^Synthetic data/);
  assert.equal(july.length, 5);
  assert.equal(august.length, 5);
  assert.equal(june.length, 6);
  assert.deepEqual(
    june
      .filter((row) => row.customerId === 'cust_berlin')
      .map((row) => row.plan),
    ['starter', 'starter'],
  );
  assert.ok(Object.isFrozen(july));
  assert.ok(Object.isFrozen(july[0]));
  assert.equal(await repository.freshness(), '2026-09-01T08:00:00Z');
  assert.deepEqual(await repository.coverage('2026-08-01'), {
    status: 'complete',
    freshness: snapshot.freshness,
  });
  assert.deepEqual(await repository.coverage('2026-06-01'), {
    status: 'complete',
    freshness: snapshot.freshness,
  });
  assert.deepEqual(await repository.coverage('2026-09-01'), {
    status: 'unavailable',
    freshness: snapshot.freshness,
  });
});

test("preserves the fixture's MRR reconciliation inputs", async () => {
  const repository = createSubscriptionMonthRepository(await fixture());
  const total = async (month) =>
    (await repository.getMonth(month)).reduce(
      (sum, row) => sum + row.mrrEurCents,
      0,
    );

  assert.equal(await total('2026-07-01'), 420_000);
  assert.equal(await total('2026-08-01'), 250_000);
  assert.equal(await total('2026-06-01'), 480_000);

  const august = await repository.getMonth('2026-08-01');
  assert.deepEqual(
    august.map(({ customerId, mrrEurCents }) => [customerId, mrrEurCents]),
    [
      ['cust_nordic', 60_000],
      ['cust_berlin', 110_000],
      ['cust_riviera', 30_000],
      ['cust_acme', 0],
      ['cust_london', 50_000],
    ],
  );
});

test('rejects ambiguous source rows before they become metric inputs', () => {
  assert.throws(
    () =>
      createSubscriptionMonthRepository({
        freshness: '2026-09-01T08:00:00Z',
        coverage: [
          {
            month: '2026-08-01',
            status: 'complete',
            freshness: '2026-09-01T08:00:00Z',
          },
        ],
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

test('rejects conflicting dimensions across synthetic subscriptions in one customer-month', async () => {
  const snapshot = await fixture();
  const row = snapshot.rows.find(
    (item) => item.customerId === 'cust_berlin' && item.month === '2026-06-01',
  );
  assert.throws(
    () =>
      createSubscriptionMonthRepository({
        ...snapshot,
        rows: [
          ...snapshot.rows,
          { ...row, subscriptionId: 'synthetic_conflict', country: 'FR' },
        ],
      }),
    /Conflicting customer-month dimensions/,
  );
  const postgres = createPostgresSubscriptionMonthRepository({
    async query() {
      return {
        rows: [
          { ...row, mrrEurCents: String(row.mrrEurCents) },
          {
            ...row,
            subscriptionId: 'synthetic_conflict',
            country: 'FR',
            mrrEurCents: String(row.mrrEurCents),
          },
        ],
      };
    },
  });
  await assert.rejects(
    postgres.getMonth('2026-06-01'),
    /Conflicting customer-month dimensions/,
  );
});

test('rejects unlabeled and duplicate synthetic month coverage', async () => {
  const snapshot = await fixture();
  assert.throws(
    () => createSubscriptionMonthRepository({ ...snapshot, coverage: [] }),
    /lack coverage metadata/,
  );
  assert.throws(
    () =>
      createSubscriptionMonthRepository({
        ...snapshot,
        coverage: [...snapshot.coverage, snapshot.coverage[0]],
      }),
    /duplicate subscription-month coverage/i,
  );
});

test('reads a parameterized month from approved PostgreSQL views', async () => {
  const snapshot = await fixture();
  const calls = [];
  const client = {
    async query(sql, parameters) {
      calls.push({ sql, parameters });
      if (sql.includes('analytics.subscription_month_freshness')) {
        return { rows: [{ freshness: snapshot.freshness }] };
      }
      if (sql.includes('analytics.subscription_month_coverage')) {
        return {
          rows: snapshot.coverage
            .filter((item) => item.month === parameters?.[0])
            .map(({ status, freshness }) => ({ status, freshness })),
        };
      }
      return {
        rows: snapshot.rows
          .filter((row) => row.month === parameters?.[0])
          .map((row) => ({
            ...row,
            mrrEurCents: String(row.mrrEurCents),
          })),
      };
    },
  };
  const postgres = createPostgresSubscriptionMonthRepository(client);
  const memory = createSubscriptionMonthRepository(snapshot);

  assert.deepEqual(
    await postgres.getMonth('2026-08-01'),
    await memory.getMonth('2026-08-01'),
  );
  assert.equal(await postgres.freshness(), await memory.freshness());
  assert.deepEqual(
    await postgres.coverage('2026-08-01'),
    await memory.coverage('2026-08-01'),
  );
  assert.deepEqual(
    await postgres.coverage('2026-09-01'),
    await memory.coverage('2026-09-01'),
  );
  assert.match(
    calls[0].sql,
    /FROM analytics\.subscription_month\s+WHERE month = \$1::date/u,
  );
  assert.deepEqual(calls[0].parameters, ['2026-08-01']);
  assert.equal(calls[1].parameters, undefined);
  assert.deepEqual(
    await postgres.getMonth('2026-08-01; DROP TABLE raw.customers'),
    [],
  );
  assert.equal(calls.length, 5);
});

test('rejects malformed PostgreSQL rows and missing freshness', async () => {
  const badRow = {
    ...(await fixture()).rows[0],
    mrrEurCents: '9007199254740992',
  };
  const postgres = createPostgresSubscriptionMonthRepository({
    async query(sql) {
      return sql.includes('subscription_month_freshness')
        ? { rows: [] }
        : { rows: [badRow] };
    },
  });

  await assert.rejects(postgres.getMonth('2026-07-01'), /non-negative integer/);
  await assert.rejects(postgres.freshness(), /exactly one/);
});

test('rejects duplicate or out-of-month PostgreSQL rows', async () => {
  const row = {
    ...(await fixture()).rows.find((item) => item.month === '2026-07-01'),
    mrrEurCents: '0',
  };
  const duplicate = createPostgresSubscriptionMonthRepository({
    async query() {
      return { rows: [row, row] };
    },
  });
  const wrongMonth = createPostgresSubscriptionMonthRepository({
    async query() {
      return { rows: [row] };
    },
  });

  await assert.rejects(duplicate.getMonth('2026-07-01'), /Duplicate/);
  await assert.rejects(
    wrongMonth.getMonth('2026-08-01'),
    /outside the requested month/,
  );
});
