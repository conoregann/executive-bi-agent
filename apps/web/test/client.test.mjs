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
