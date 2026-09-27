import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOpenAIModel } from '../dist/index.js';
test('Responses structured output, privacy and failures', async () => {
  const model = createOpenAIModel({
    apiKey: 'synthetic-key',
    model: 'test-model',
    fetch: async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/responses');
      const body = JSON.parse(options.body);
      assert.equal(body.store, false);
      assert.equal(body.text.format.strict, true);
      return Response.json({
        status: 'completed',
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: '{"tools":["crm"]}' }],
          },
        ],
      });
    },
  });
  assert.deepEqual(
    await model.complete('plan', {}, new AbortController().signal),
    { tools: ['crm'] },
  );
  const failed = createOpenAIModel({
    apiKey: 'synthetic-key',
    model: 'test',
    fetch: async () => Response.json({ status: 'incomplete' }),
  });
  await assert.rejects(() =>
    failed.complete('plan', {}, new AbortController().signal),
  );
});
