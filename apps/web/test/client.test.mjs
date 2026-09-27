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
