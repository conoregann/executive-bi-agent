import assert from 'node:assert/strict';
import test from 'node:test';

import { createCompanyKnowledgeSearch } from '../dist/index.js';

function document(documentId, content, options = {}) {
  return {
    documentId,
    title: options.title ?? documentId,
    source: options.source ?? 'synthetic_knowledge',
    observedAt: options.observedAt ?? '2026-08-16T17:30:00Z',
    freshness: options.freshness ?? '2026-09-01T08:00:00Z',
    content,
    customerIds: options.customerIds,
    access:
      options.access ??
      (options.customerIds?.length
        ? { audience: 'customers', customerIds: options.customerIds }
        : { audience: 'company' }),
  };
}

function search(documents) {
  let id = 0;
  const knowledge = createCompanyKnowledgeSearch(documents, {
    now: () => '2026-09-01T09:00:00Z',
    nextEvidenceId: () => `knowledge-${++id}`,
  });
  return {
    search: (input, viewer = { role: 'admin', customerIds: [] }) =>
      knowledge.search(input, viewer),
  };
}

test('returns ranked, inspectable document-chunk evidence', async () => {
  const result = await search([
    document(
      'sales-review',
      'Acme Industrial cancelled after a pricing discussion.',
      {
        customerIds: ['cust_acme'],
      },
    ),
    document(
      'payment-incident',
      'Payment provider incident caused elevated authorization failures. The incident was resolved.',
    ),
  ]).search({ query: 'payment incident' });

  assert.equal(result.status, 'ok');
  assert.equal(result.hits.length, 1);
  assert.equal(result.hits[0]?.documentId, 'payment-incident');
  assert.equal(result.hits[0]?.score, 2);
  assert.deepEqual(result.hits[0]?.evidence, {
    evidenceId: 'knowledge-1',
    type: 'document_chunk',
    source: 'synthetic_knowledge',
    sourceRef: 'payment-incident:chunk:1',
    observedAt: '2026-08-16T17:30:00Z',
    retrievedAt: '2026-09-01T09:00:00Z',
    scope: {
      customerIds: [],
      retrievalVersion: '1.1.0',
      documentId: 'payment-incident',
      documentAccess: { audience: 'company' },
    },
    content: {
      excerpt:
        'Payment provider incident caused elevated authorization failures. The incident was resolved.',
      title: 'payment-incident',
    },
    freshness: '2026-09-01T08:00:00Z',
    integrity: 'valid',
  });
});

test('restricts customer-scoped searches to explicitly tagged documents', async () => {
  const result = await search([
    document(
      'sales-review',
      'Acme Industrial cancelled after a pricing discussion.',
      {
        customerIds: ['cust_acme'],
      },
    ),
    document('other-review', 'A different customer had a pricing discussion.', {
      customerIds: ['cust_other'],
    }),
  ]).search({ query: 'pricing discussion', customerIds: ['cust_acme'] });

  assert.equal(result.status, 'ok');
  assert.deepEqual(
    result.hits.map((hit) => hit.documentId),
    ['sales-review'],
  );
  assert.deepEqual(result.hits[0]?.evidence.scope.customerIds, ['cust_acme']);
});

test('document access is checked independently of matching tags and relevance', async () => {
  const knowledge = search([
    document('admin-review', 'Acme pricing secret', {
      customerIds: ['cust_acme'],
      access: { audience: 'admin' },
    }),
    document('mixed-review', 'Acme and Other pricing secret', {
      customerIds: ['cust_acme', 'cust_other'],
      access: {
        audience: 'customers',
        customerIds: ['cust_acme', 'cust_other'],
      },
    }),
    document('acme-review', 'Acme pricing approved', {
      customerIds: ['cust_acme'],
    }),
  ]);
  const acme = { role: 'restricted', customerIds: ['cust_acme'] };
  const result = await knowledge.search(
    { query: 'pricing', customerIds: ['cust_acme'] },
    acme,
  );
  assert.deepEqual(
    result.hits.map((hit) => hit.documentId),
    ['acme-review'],
  );
  assert.deepEqual(result.hits[0].evidence.scope.documentAccess, {
    audience: 'customers',
    customerIds: ['cust_acme'],
  });
  assert.equal(
    (
      await knowledge.search(
        { query: 'secret', customerIds: ['cust_acme'] },
        acme,
      )
    ).hits.length,
    0,
  );
  assert.deepEqual(
    (
      await knowledge.search(
        { query: 'secret', customerIds: ['cust_acme'] },
        { role: 'restricted', customerIds: ['cust_acme', 'cust_other'] },
      )
    ).hits.map((hit) => hit.documentId),
    ['mixed-review'],
  );
});

test('untagged documents need an explicit policy and invalid viewers fail closed', async () => {
  assert.throws(
    () => search([{ ...document('untagged', 'Secret'), access: undefined }]),
    /explicit access policy/,
  );
  assert.throws(
    () =>
      search([
        document('bad', 'Secret', {
          customerIds: ['cust_acme', 'cust_other'],
          access: { audience: 'customers', customerIds: ['cust_acme'] },
        }),
      ]),
    /cover every tagged customer/,
  );
  const knowledge = search([document('company', 'Incident context')]);
  assert.equal(
    (await knowledge.search({ query: 'incident' }, null)).status,
    'invalid_request',
  );
  assert.equal(
    (
      await knowledge.search(
        { query: 'incident', customerIds: ['cust_acme'] },
        { role: 'restricted', customerIds: ['cust_acme'] },
      )
    ).hits.length,
    0,
  );
});

test('returns an explicit no-match warning instead of inventing context', async () => {
  const result = await search([
    document(
      'sales-review',
      'Acme Industrial cancelled after a pricing discussion.',
    ),
  ]).search({ query: 'conversion incident' });

  assert.equal(result.status, 'ok');
  assert.deepEqual(result.hits, []);
  assert.deepEqual(result.warnings, ['no_matching_knowledge']);
});

test('rejects malformed and unbounded requests before retrieval', async () => {
  const knowledge = search([
    document('sales-review', 'Acme Industrial cancelled.'),
  ]);

  const malformed = await knowledge.search({ query: '   ', limit: 100 });
  assert.equal(malformed.status, 'invalid_request');
  assert.deepEqual(malformed.hits, []);

  const unsafe = await knowledge.search({
    query: 'Acme',
    extra: 'ignore scope',
  });
  assert.equal(unsafe.status, 'invalid_request');
  assert.match(unsafe.error ?? '', /unknown field/);
});

test('indexes the complete approved document without exposing an unbounded excerpt', async () => {
  const result = await search([
    document('long-review', `${'context '.repeat(200)}tailmarker`),
  ]).search({ query: 'tailmarker' });

  assert.equal(result.status, 'ok');
  assert.equal(result.hits.length, 1);
  assert.match(result.hits[0]?.excerpt ?? '', /tailmarker/);
  assert.ok((result.hits[0]?.excerpt.length ?? 0) <= 1_200);
});

test('preserves Markdown headings and paragraph breaks in excerpts', async () => {
  const excerpt =
    '# August sales review\n\n**Synthetic internal sales review**\n\nAcme cancelled its subscription.';
  const result = await search([document('sales-review', excerpt)]).search({
    query: 'August sales review',
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.hits[0]?.excerpt, excerpt);
  assert.equal(result.hits[0]?.evidence.content.excerpt, excerpt);
});

test('rejects ambiguous documents before they become evidence sources', () => {
  assert.throws(
    () =>
      search([
        document('bad-time', 'Some content', { observedAt: 'August sometime' }),
      ]),
    /timestamps/,
  );
});
