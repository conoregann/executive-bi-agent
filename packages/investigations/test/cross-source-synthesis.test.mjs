import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  MrrDeclineInvestigationService,
  readCrossSourceAnswer,
} from '../dist/index.js';
import { TrustedMrrService } from '../../metrics/dist/index.js';
import { createOperationalRepository } from '../../operations/dist/index.js';

const snapshot = JSON.parse(
  readFileSync(
    new URL('../../../data/synthetic/operations-2026.json', import.meta.url),
  ),
);
const hypothesis = (
  kind,
  supportingEvidenceIds,
  contradictoryEvidenceIds = [],
) => ({ kind, supportingEvidenceIds, contradictoryEvidenceIds });
async function run(hypotheses) {
  const metrics = new TrustedMrrService({
    async getMonth(month) {
      return ['cust_acme', 'cust_riviera'].map((customerId) => ({
        customerId,
        subscriptionId: `${customerId}-synthetic`,
        month,
        mrrEurCents: month === '2026-07-01' ? 240000 : 0,
        isActiveAtMonthEnd: month === '2026-07-01',
        plan: 'enterprise',
        country: 'DE',
        region: 'dach',
        industry: 'technology',
        companySize: 'mid_market',
      }));
    },
    async freshness() {
      return '2026-09-01T08:00:00Z';
    },
  });
  const service = new MrrDeclineInvestigationService(
    {
      compareMrr: (input) => metrics.compareMrr(input),
      getMrrMovement: (input) => metrics.getMrrMovement(input),
      getCustomerMrrMovement: (input) => metrics.getCustomerMrrMovement(input),
      breakdownMrr: (input) => metrics.breakdownMrr(input),
      searchCompanyKnowledge: async () => ({
        status: 'ok',
        hits: [],
        warnings: [],
      }),
    },
    undefined,
    {
      repository: createOperationalRepository(snapshot),
      model: {
        async complete(phase) {
          return phase === 'plan'
            ? { tools: ['crm', 'support', 'usage'] }
            : { hypotheses };
        },
      },
    },
  );
  const parent = await service.start({
    investigationId: 'synthetic_parent',
    month: '2026-08-01',
  });
  assert.equal(parent.status, 'completed');
  const child = await service.startCrossSourceFollowUp(
    'synthetic_parent',
    parent.accessToken,
    {
      investigationId: 'synthetic_child',
      question: 'Investigate revenue losses across sources',
    },
  );
  const retained = await service.getInvestigation(
    'synthetic_child',
    child.accessToken,
  );
  return { child, retained };
}

test('mixed synthesis retains supported hypotheses and rejects stale usage evidence', async () => {
  const valid = [
    hypothesis('pricing', ['ops_crm'], ['ops_crm']),
    hypothesis('support', ['ops_support']),
  ];
  const { child, retained } = await run([
    ...valid,
    hypothesis('usage', ['ops_usage']),
  ]);
  assert.equal(child.record.modelStatus, 'completed');
  assert.deepEqual(child.record.hypotheses, valid);
  assert.ok(
    child.warnings.includes(
      'Rejected usage hypothesis: cited evidence is stale, incomplete or invalid.',
    ),
  );
  assert.ok(
    child.warnings.includes(
      'Model synthesis is partial; only validated hypotheses are shown.',
    ),
  );
  assert.ok(!child.warnings.includes('model_synthesis_unavailable'));
  assert.deepEqual(retained.record, child.record);
  assert.equal(
    readCrossSourceAnswer(retained.record, retained.evidence).status,
    'ok',
  );
  const tampered = structuredClone(retained.record);
  tampered.hypotheses.push(hypothesis('usage', ['ops_usage']));
  assert.equal(
    readCrossSourceAnswer(tampered, retained.evidence).status,
    'answer_unavailable',
  );
});

for (const invalid of [
  hypothesis('usage', ['ops_usage']),
  hypothesis('pricing', ['unknown']),
  hypothesis('pricing', ['ops_crm'], ['ops_usage']),
  hypothesis('usage', ['ops_crm']),
]) {
  test(`rejects ${invalid.kind} with ${invalid.supportingEvidenceIds} and ${invalid.contradictoryEvidenceIds} independently`, async () => {
    const valid = hypothesis('support', ['ops_support']);
    const mixed = await run([valid, invalid]);
    assert.deepEqual(mixed.child.record.hypotheses, [valid]);
    const alone = await run([invalid]);
    assert.equal(alone.child.record.modelStatus, 'unavailable');
    assert.deepEqual(alone.child.record.hypotheses, []);
    assert.ok(alone.child.warnings.includes('model_synthesis_unavailable'));
    assert.ok(
      alone.child.warnings.some((w) =>
        w.startsWith(`Rejected ${invalid.kind} hypothesis:`),
      ),
    );
  });
}
