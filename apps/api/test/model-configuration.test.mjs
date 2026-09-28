import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configuredModel } from '../dist/features/mrr/composition.js';
test('provider configuration enables Gemini, preserves OpenAI and rejects unsupported providers', () => {
  assert.equal(configuredModel({}), undefined);
  assert.ok(configuredModel({ GEMINI_API_KEY: 'synthetic-key' }));
  assert.ok(
    configuredModel({
      OPENAI_API_KEY: 'synthetic-key',
      OPENAI_INVESTIGATION_MODEL: 'test',
    }),
  );
  assert.equal(
    configuredModel({
      INVESTIGATION_MODEL_PROVIDER: 'gemini',
      OPENAI_API_KEY: 'synthetic-key',
      OPENAI_INVESTIGATION_MODEL: 'test',
    }),
    undefined,
  );
  assert.throws(
    () => configuredModel({ INVESTIGATION_MODEL_PROVIDER: 'unsupported' }),
    /Unsupported investigation model provider/,
  );
});
