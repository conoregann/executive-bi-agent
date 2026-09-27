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
      assert.ok(body.text.format.schema.properties.tools);
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

test('Gemini uses a header credential, structured schema and abort signal for both phases', async () => {
  const { createGeminiModel } = await import('../dist/index.js');
  const controller = new AbortController();
  const model = createGeminiModel({
    apiKey: 'synthetic-key',
    model: 'gemini-3.8-flash',
    fetch: async (url, options) => {
      assert.equal(
        url,
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
      );
      assert.equal(new URL(url).search, '');
      assert.equal(options.headers['x-goog-api-key'], 'synthetic-key');
      assert.equal(options.signal, controller.signal);
      const body = JSON.parse(options.body);
      assert.equal(body.generationConfig.responseMimeType, 'application/json');
      assert.equal(body.generationConfig.candidateCount, 1);
      assert.match(body.systemInstruction.parts[0].text, /untrusted evidence/);
      const phase = JSON.parse(body.contents[0].parts[0].text).phase;
      assert.ok(
        body.generationConfig.responseJsonSchema.properties[
          phase === 'plan' ? 'tools' : 'hypotheses'
        ],
      );
      return Response.json({
        candidates: [
          {
            finishReason: 'STOP',
            content: {
              parts: [
                { thought: true, text: 'Private reasoning' },
                {
                  text:
                    phase === 'plan'
                      ? '{"tools":["crm"]}'
                      : '{"hypotheses":[]}',
                },
              ],
            },
          },
        ],
      });
    },
  });
  assert.deepEqual(await model.complete('plan', {}, controller.signal), {
    tools: ['crm'],
  });
  assert.deepEqual(await model.complete('synthesis', {}, controller.signal), {
    hypotheses: [],
  });
});
test('Gemini rejects provider errors, refusals, truncation and malformed JSON without leaking details', async () => {
  const { createGeminiModel } = await import('../dist/index.js');
  for (const body of [
    { promptFeedback: { blockReason: 'SAFETY' } },
    { candidates: [] },
    {
      candidates: [
        { finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{}' }] } },
      ],
    },
    {
      candidates: [
        { finishReason: 'STOP', content: { parts: [{ text: 'invalid' }] } },
      ],
    },
    {
      candidates: [
        {
          finishReason: 'STOP',
          content: { parts: [{ thought: true, text: '{}' }] },
        },
      ],
    },
  ]) {
    const model = createGeminiModel({
      apiKey: 'synthetic-key',
      model: 'test',
      fetch: async () => Response.json(body),
    });
    await assert.rejects(() =>
      model.complete('plan', {}, new AbortController().signal),
    );
  }
  const failed = createGeminiModel({
    apiKey: 'synthetic-key',
    model: 'test',
    fetch: async () => new Response('secret-provider-detail', { status: 429 }),
  });
  await assert.rejects(
    () => failed.complete('plan', {}, new AbortController().signal),
    /Model provider unavailable/,
  );
});
