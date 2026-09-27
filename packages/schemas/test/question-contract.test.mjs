import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveQuestionRequestSchema,
  resolveQuestionResponseSchema,
} from '../dist/index.js';

test('question contracts bound input and expose only supported typed interpretations', () => {
  assert.equal(
    resolveQuestionRequestSchema.parse({ question: ' hello ' }).question,
    'hello',
  );
  for (const body of [
    { question: ' ' },
    { question: 'x'.repeat(1001) },
    { question: 'hello', month: '2026-08-01' },
  ])
    assert.equal(resolveQuestionRequestSchema.safeParse(body).success, false);
  const resolved = {
    status: 'resolved',
    question: 'Why did MRR fall in August 2026?',
    metric: 'mrr',
    month: '2026-08-01',
    comparison: 'previous_period',
    responseMode: 'investigation',
  };
  assert.deepEqual(resolveQuestionResponseSchema.parse(resolved), resolved);
  for (const change of [
    { metric: 'arr' },
    { month: '2026-13-01' },
    { comparison: 'custom' },
    { permittedCustomerIds: ['cust_acme'] },
    { value: 123 },
  ])
    assert.equal(
      resolveQuestionResponseSchema.safeParse({ ...resolved, ...change })
        .success,
      false,
    );
  for (const status of ['clarification_required', 'unsupported'])
    assert.equal(
      resolveQuestionResponseSchema.safeParse({
        status,
        message: 'Edit the question.',
      }).success,
      true,
    );
});
