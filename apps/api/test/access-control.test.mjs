import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createMrrDeclineApi,
  loadSyntheticMrrDeclineDependencies,
} from '../dist/index.js';
import { hashPassword, tokenHash } from '../dist/access.js';
import { InMemoryInvestigationStore } from '../../../packages/investigations/dist/index.js';

const base = 'http://api.test/v1';
class MemoryAccess {
  constructor(passwordHash) {
    this.users = new Map([
      [
        'alice',
        {
          userId: 'alice',
          role: 'restricted',
          active: true,
          customerIds: ['cust_acme'],
        },
      ],
      [
        'bob',
        {
          userId: 'bob',
          role: 'restricted',
          active: true,
          customerIds: ['cust_riviera'],
        },
      ],
    ]);
    this.passwordHash = passwordHash;
    this.sessions = new Map();
    this.owners = new Map();
  }
  async credentials(name) {
    return this.users.has(name)
      ? { userId: name, passwordHash: this.passwordHash }
      : undefined;
  }
  async user(id) {
    return this.users.get(id);
  }
  async saveSession(hash, id) {
    this.sessions.set(hash, id);
  }
  async sessionUser(hash) {
    return this.sessions.get(hash);
  }
  async owner(id) {
    return this.owners.get(id);
  }
  async bind(id, userId) {
    this.owners.set(id, userId);
  }
}
const json = (url, body, headers = {}) =>
  new Request(base + url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
const get = (url, session, token) =>
  new Request(base + url, {
    headers: { 'x-session-token': session, authorization: `Bearer ${token}` },
  });

test('identity scope survives omitted filters, changed IDs, token replay, follow-ups and revocation', async () => {
  const access = new MemoryAccess(await hashPassword('synthetic-password'));
  const api = createMrrDeclineApi(
    await loadSyntheticMrrDeclineDependencies(),
    undefined,
    undefined,
    undefined,
    access,
  );
  const login = async (user) => {
    const response = await api.fetch(
      json('/sessions', { username: user, password: 'synthetic-password' }),
    );
    assert.equal(response.status, 200);
    return (await response.json()).sessionToken;
  };
  assert.equal(
    (
      await api.fetch(
        json('/investigations/mrr-decline', {
          investigationId: 'anon',
          month: '2026-08-01',
        }),
      )
    ).status,
    401,
  );
  const alice = await login('alice');
  const bob = await login('bob');
  assert.equal(
    (
      await api.fetch(
        json(
          '/investigations/mrr-decline',
          {
            investigationId: 'changed',
            month: '2026-08-01',
            permittedCustomerIds: ['cust_riviera'],
          },
          { 'x-session-token': alice },
        ),
      )
    ).status,
    403,
  );
  const started = await api.fetch(
    json(
      '/investigations/mrr-decline',
      { investigationId: 'alice-scope', month: '2026-08-01' },
      { 'x-session-token': alice },
    ),
  );
  assert.equal(started.status, 201);
  const body = await started.json();
  assert.deepEqual(body.record.permittedCustomerIds, ['cust_acme']);
  const path = '/investigations/alice-scope';
  assert.equal(
    (await api.fetch(get(path + '/answer', alice, body.accessToken))).status,
    200,
  );
  assert.equal(
    (await api.fetch(get(path + '/answer', bob, body.accessToken))).status,
    404,
  );
  assert.equal(
    (
      await api.fetch(
        get(
          path + '/evidence/' + body.record.evidenceIds[0],
          bob,
          body.accessToken,
        ),
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await api.fetch(
        new Request(base + path + '/country-follow-ups', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-session-token': bob,
            authorization: `Bearer ${body.accessToken}`,
          },
          body: JSON.stringify({
            investigationId: 'stolen-child',
            action: 'breakdown_mrr_by_country',
          }),
        }),
      )
    ).status,
    404,
  );
  assert.equal(access.owners.has('stolen-child'), false);
  const child = await api.fetch(
    new Request(base + path + '/country-follow-ups', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-session-token': alice,
        authorization: `Bearer ${body.accessToken}`,
      },
      body: JSON.stringify({
        investigationId: 'alice-child',
        action: 'breakdown_mrr_by_country',
      }),
    }),
  );
  assert.equal(child.status, 201);
  const childBody = await child.json();
  assert.equal(access.owners.get('alice-child'), 'alice');
  assert.equal(
    (
      await api.fetch(
        get('/investigations/alice-child/answer', alice, childBody.accessToken),
      )
    ).status,
    200,
  );
  access.users.get('alice').customerIds = [];
  assert.equal(
    (await api.fetch(get(path + '/answer', alice, body.accessToken))).status,
    404,
  );
  access.users.get('alice').customerIds = ['cust_acme'];
  access.users.get('alice').active = false;
  assert.equal(
    (await api.fetch(get(path + '/answer', alice, body.accessToken))).status,
    401,
  );
  assert.equal(await access.sessionUser(tokenHash(alice)), 'alice');
});

test('retained admin document evidence is hidden after a role downgrade', async () => {
  const access = new MemoryAccess(await hashPassword('synthetic-password'));
  access.users.get('alice').role = 'admin';
  const dependencies = await loadSyntheticMrrDeclineDependencies();
  const api = createMrrDeclineApi(
    {
      ...dependencies,
      documents: [
        ...dependencies.documents,
        {
          documentId: 'admin-pricing',
          title: 'Synthetic admin pricing review',
          source: 'synthetic_knowledge',
          observedAt: '2026-08-20T12:00:00Z',
          freshness: '2026-09-01T08:00:00Z',
          content: 'Acme cancelled after a confidential pricing review.',
          customerIds: ['cust_acme'],
          access: { audience: 'admin' },
        },
      ],
    },
    undefined,
    undefined,
    undefined,
    access,
  );
  const login = await api.fetch(
    json('/sessions', {
      username: 'alice',
      password: 'synthetic-password',
    }),
  );
  const session = (await login.json()).sessionToken;
  const started = await api.fetch(
    json(
      '/investigations/mrr-decline',
      {
        investigationId: 'admin-document',
        month: '2026-08-01',
      },
      { 'x-session-token': session },
    ),
  );
  assert.equal(started.status, 201);
  const body = await started.json();
  let evidencePath;
  for (const id of body.record.evidenceIds) {
    const path = `/investigations/admin-document/evidence/${id}`;
    const citation = await api.fetch(get(path, session, body.accessToken));
    if (
      (await citation.json()).evidence.scope.documentAccess?.audience ===
      'admin'
    )
      evidencePath = path;
  }
  assert.ok(evidencePath, 'admin document was retained');
  access.users.get('alice').role = 'restricted';
  assert.equal(
    (await api.fetch(get(evidencePath, session, body.accessToken))).status,
    404,
  );
  assert.equal(
    (
      await api.fetch(
        get('/investigations/admin-document/answer', session, body.accessToken),
      )
    ).status,
    404,
  );
});

test('retained citations fail closed after the source document is reclassified', async () => {
  const access = new MemoryAccess(await hashPassword('synthetic-password'));
  access.users.get('alice').role = 'admin';
  const store = new InMemoryInvestigationStore();
  const dependencies = await loadSyntheticMrrDeclineDependencies();
  const api = createMrrDeclineApi(
    dependencies,
    store,
    undefined,
    undefined,
    access,
  );
  const session = (
    await (
      await api.fetch(
        json('/sessions', {
          username: 'alice',
          password: 'synthetic-password',
        }),
      )
    ).json()
  ).sessionToken;
  const started = await api.fetch(
    json(
      '/investigations/mrr-decline',
      {
        investigationId: 'reclassified-document',
        month: '2026-08-01',
        permittedCustomerIds: ['cust_acme'],
      },
      { 'x-session-token': session },
    ),
  );
  assert.equal(started.status, 201);
  const { accessToken, record } = await started.json();
  assert.ok(record.evidenceIds.some((id) => id.startsWith('knowledge_')));
  const documentIds = [];
  for (const id of record.evidenceIds.filter((id) =>
    id.startsWith('knowledge_'),
  )) {
    const citation = await api.fetch(
      get(
        `/investigations/reclassified-document/evidence/${id}`,
        session,
        accessToken,
      ),
    );
    documentIds.push((await citation.json()).evidence.scope.documentId);
  }
  assert.ok(
    documentIds.includes('august-sales-review'),
    JSON.stringify(documentIds),
  );
  access.users.get('alice').role = 'restricted';
  const answer = get(
    '/investigations/reclassified-document/answer',
    session,
    accessToken,
  );
  assert.equal((await api.fetch(answer)).status, 200);
  const reclassified = createMrrDeclineApi(
    {
      ...dependencies,
      documents: dependencies.documents.map((document) =>
        document.documentId === 'august-sales-review'
          ? { ...document, access: { audience: 'admin' } }
          : document,
      ),
    },
    store,
    undefined,
    undefined,
    access,
  );
  assert.equal((await reclassified.fetch(answer)).status, 404);
});
