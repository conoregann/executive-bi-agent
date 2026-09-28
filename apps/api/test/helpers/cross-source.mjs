import { readFileSync } from 'node:fs';
import { createMrrDeclineApi } from '../../dist/features/mrr/composition.js';
import { loadSyntheticMrrDeclineDependencies } from '../../dist/features/mrr/synthetic-source.js';
import { createOperationalRepository } from '@executive-bi/operations';
import { InMemoryInvestigationStore } from '@executive-bi/investigations';
const snapshot = JSON.parse(
  readFileSync(
    new URL('../../../../data/synthetic/operations-2026.json', import.meta.url),
  ),
);
export async function send(api, path, body, token) {
  return api.fetch(
    new Request(`http://test/v1/investigations/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );
}
export async function scenario(
  model,
  scope,
  question = 'Investigate revenue losses across sources',
  repository,
) {
  const store = new InMemoryInvestigationStore();
  const dependencies = await loadSyntheticMrrDeclineDependencies();
  const api = createMrrDeclineApi(
    dependencies,
    store,
    repository ?? createOperationalRepository(snapshot),
    model,
  );
  const parent = await (
    await send(api, 'mrr-decline', {
      investigationId: 'parent',
      month: '2026-08-01',
      ...(scope ? { permittedCustomerIds: scope } : {}),
    })
  ).json();
  const child = await (
    await send(
      api,
      'parent/cross-source-follow-ups',
      { investigationId: 'cross', question },
      parent.accessToken,
    )
  ).json();
  return { api, parent, child, store, dependencies };
}
