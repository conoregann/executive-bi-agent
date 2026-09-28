// Reproducible synthetic cross-source history; never production data.
import { writeFileSync } from 'node:fs';
const ids = [
  'cust_acme',
  'cust_berlin',
  'cust_london',
  'cust_nordic',
  'cust_riviera',
];
const rows = [];
for (const [i, customerId] of ids.entries()) {
  for (const month of ['2026-06-01', '2026-07-01', '2026-08-01']) {
    const observedAt = `${month}T00:00:00Z`;
    const freshness =
      customerId === 'cust_riviera'
        ? '2026-07-01T00:00:00Z'
        : '2026-09-01T08:00:00Z';
    rows.push({
      recordId: `synthetic_usage_${i}_${month}`,
      customerId,
      source: 'usage',
      month,
      observedAt,
      freshness,
      activeUsers:
        month === '2026-08-01' &&
        ['cust_acme', 'cust_london'].includes(customerId)
          ? 10
          : 50,
      category: 'monthly_active_users',
      note: 'Synthetic monthly usage summary',
    });
    if (month === '2026-08-01' && customerId !== 'cust_nordic') {
      rows.push({
        recordId: `synthetic_crm_${i}`,
        customerId,
        source: 'crm',
        month,
        observedAt,
        freshness: '2026-09-01T08:00:00Z',
        activeUsers: null,
        category:
          customerId === 'cust_riviera'
            ? 'pricing_objection'
            : customerId === 'cust_acme'
              ? 'budget_frozen'
              : 'renewal',
        note:
          customerId === 'cust_acme'
            ? 'Account owner recorded a budget freeze, conflicting with a general pricing explanation.'
            : 'Synthetic account event; reported reason is not causal proof.',
      });
    }
    if (month === '2026-07-01' && customerId === 'cust_acme')
      rows.push({
        recordId: 'synthetic_support_acme',
        customerId,
        source: 'support',
        month,
        observedAt: '2026-07-25T00:00:00Z',
        freshness,
        activeUsers: null,
        category: 'escalation',
        note: 'Synthetic performance escalation preceding cancellation; relationship unconfirmed.',
      });
  }
}
writeFileSync(
  new URL('./operations-2026.json', import.meta.url),
  JSON.stringify({ label: 'synthetic', rows }, null, 2) + '\n',
);
