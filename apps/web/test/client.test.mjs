import assert from 'node:assert/strict';
import test from 'node:test';
import { readJson } from '../src/client.ts';
test('rejects unavailable, unauthorized and malformed upstream responses', async () => {
  for (const status of [401, 404, 500, 503])
    await assert.rejects(
      readJson(Response.json({}, { status })),
      /unavailable/,
    );
  assert.equal(await readJson(new Response('not json')), null);
});

test('question resolution fails closed for malformed upstream interpretations', async (t) => {
  const { resolveQuestion } = await import('../src/client.ts');
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async () =>
    Response.json({ status: 'resolved', month: '2026-08-01' });
  await assert.rejects(
    resolveQuestion('Why did MRR fall in August 2026?'),
    /invalid resolution/,
  );
  await assert.rejects(resolveQuestion(' '), /Enter a question/);
});

test('country follow-up client rejects malformed evidence responses and surfaces unsupported wording', async (t) => {
  const { startCountryFollowUp, readCountryFollowUpAnswer } =
    await import('../src/client.ts');
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async () =>
    Response.json({ status: 'unsupported' }, { status: 422 });
  await assert.rejects(
    startCountryFollowUp(
      'parent',
      'x'.repeat(43),
      'Break that down by country in September',
    ),
    /Only/,
  );
  globalThis.fetch = async () => Response.json({ status: 'completed' });
  await assert.rejects(
    startCountryFollowUp('parent', 'x'.repeat(43)),
    /invalid follow-up/,
  );
  globalThis.fetch = async () => Response.json({ answer: { comparison: {} } });
  await assert.rejects(
    readCountryFollowUpAnswer('child', 'x'.repeat(43)),
    /insufficient/,
  );
});
