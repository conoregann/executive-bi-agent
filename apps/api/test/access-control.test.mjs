import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createMrrDeclineApi,
  loadSyntheticMrrDeclineDependencies,
} from '../dist/index.js';
import { hashPassword, tokenHash } from '../dist/access.js';

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
