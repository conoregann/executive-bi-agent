export const KNOWLEDGE_RETRIEVAL_VERSION = '1.1.0';

const MAX_DOCUMENT_CONTENT_LENGTH = 10_000;
const MAX_CHUNK_LENGTH = 1_200;
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

export interface KnowledgeDocument {
  documentId: string;
  title: string;
  source: string;
  observedAt: string;
  freshness: string;
  content: string;
  customerIds?: readonly string[];
  access: DocumentAccess;
}

export type DocumentAccess =
  | { audience: 'company' }
  | { audience: 'admin' }
  | { audience: 'customers'; customerIds: readonly string[] };

export interface KnowledgeViewer {
  role: 'admin' | 'restricted';
  customerIds: readonly string[];
}

export interface KnowledgeChunkEvidence {
  evidenceId: string;
  type: 'document_chunk';
  source: string;
  sourceRef: string;
  observedAt: string;
  retrievedAt: string;
  scope: {
    customerIds: readonly string[];
    retrievalVersion: typeof KNOWLEDGE_RETRIEVAL_VERSION;
    documentId: string;
    documentAccess: DocumentAccess;
  };
  content: { excerpt: string; title: string };
  freshness: string;
  integrity: 'valid';
}

export interface KnowledgeSearchHit {
  documentId: string;
  chunkId: string;
  title: string;
  excerpt: string;
  score: number;
  evidence: KnowledgeChunkEvidence;
}

export interface KnowledgeSearchResult {
  status: 'ok' | 'invalid_request';
  hits: readonly KnowledgeSearchHit[];
  warnings: readonly string[];
  error?: string;
}

export interface CompanyKnowledgeSearch {
  search(
    input: unknown,
    viewer: KnowledgeViewer,
  ): Promise<KnowledgeSearchResult>;
}

export interface CompanyKnowledgeSearchOptions {
  now?: () => string;
  nextEvidenceId?: () => string;
}

interface KnowledgeChunk {
  chunkId: string;
  document: KnowledgeDocument;
  excerpt: string;
  tokens: ReadonlySet<string>;
  order: number;
}

interface SearchRequest {
  queryTokens: readonly string[];
  customerIds: readonly string[];
  limit: number;
}

/**
 * Creates a deterministic, read-only search boundary over pre-approved company
 * documents. Its lexical scoring is deliberately inspectable; it returns source
 * excerpts and evidence, never generated conclusions or causal assertions.
 */
export function createCompanyKnowledgeSearch(
  documents: readonly KnowledgeDocument[],
  options: CompanyKnowledgeSearchOptions = {},
): CompanyKnowledgeSearch {
  const chunks = indexDocuments(documents);
  const now = options.now ?? (() => new Date().toISOString());
  let evidenceSequence = 0;
  const nextEvidenceId =
    options.nextEvidenceId ??
    (() => {
      evidenceSequence += 1;
      return `knowledge_${evidenceSequence}`;
    });

  return {
    async search(input, viewer) {
      const request = parseSearchRequest(input);
      if (
        !request.ok ||
        !isViewer(viewer) ||
        (viewer.role === 'restricted' &&
          request.value.customerIds.some(
            (id) => !viewer.customerIds.includes(id),
          ))
      ) {
        return {
          status: 'invalid_request',
          hits: [],
          warnings: [],
          error: request.ok
            ? 'Valid viewer access is required.'
            : request.error,
        };
      }

      const scored = chunks
        .filter(
          (chunk) =>
            canReadDocument(chunk.document.access, viewer) &&
            isInCustomerScope(chunk.document, request.value.customerIds),
        )
        .map((chunk) => ({
          chunk,
          score: score(chunk, request.value.queryTokens),
        }))
        .filter((candidate) => candidate.score > 0)
        .sort(
          (left, right) =>
            right.score - left.score || left.chunk.order - right.chunk.order,
        )
        .slice(0, request.value.limit);

      const retrievedAt = now();
      return {
        status: 'ok',
        hits: scored.map(({ chunk, score }) => ({
          documentId: chunk.document.documentId,
          chunkId: chunk.chunkId,
          title: chunk.document.title,
          excerpt: chunk.excerpt,
          score,
          evidence: {
            evidenceId: nextEvidenceId(),
            type: 'document_chunk',
            source: chunk.document.source,
            sourceRef: chunk.chunkId,
            observedAt: chunk.document.observedAt,
            retrievedAt,
            scope: {
              customerIds: [...request.value.customerIds],
              retrievalVersion: KNOWLEDGE_RETRIEVAL_VERSION,
              documentId: chunk.document.documentId,
              documentAccess: chunk.document.access,
            },
            content: { excerpt: chunk.excerpt, title: chunk.document.title },
            freshness: chunk.document.freshness,
            integrity: 'valid',
          },
        })),
        warnings: scored.length === 0 ? ['no_matching_knowledge'] : [],
      };
    },
  };
}

function indexDocuments(
  documents: readonly KnowledgeDocument[],
): readonly KnowledgeChunk[] {
  const documentIds = new Set<string>();
  const chunks: KnowledgeChunk[] = [];
  for (const document of documents) {
    validateDocument(document);
    if (documentIds.has(document.documentId)) {
      throw new Error(
        `Duplicate knowledge document ID: ${document.documentId}.`,
      );
    }
    documentIds.add(document.documentId);
    const normalizedDocument = freezeDocument(document);
    const excerpts = chunkContent(normalizedDocument.content);
    for (const [index, excerpt] of excerpts.entries()) {
      chunks.push({
        chunkId: `${normalizedDocument.documentId}:chunk:${index + 1}`,
        document: normalizedDocument,
        excerpt,
        tokens: new Set(tokenize(excerpt)),
        order: chunks.length,
      });
    }
  }
  return Object.freeze(chunks);
}

function parseSearchRequest(
  input: unknown,
): { ok: true; value: SearchRequest } | { ok: false; error: string } {
  if (!isRecord(input))
    return { ok: false, error: 'Request must be an object.' };
  if (!hasOnlyKeys(input, ['query', 'customerIds', 'limit'])) {
    return { ok: false, error: 'Request includes an unknown field.' };
  }
  if (typeof input.query !== 'string') {
    return { ok: false, error: 'query must be a non-empty string.' };
  }
  const queryTokens = tokenize(input.query);
  if (queryTokens.length === 0) {
    return {
      ok: false,
      error: 'query must include at least one searchable term.',
    };
  }
  if (
    input.customerIds !== undefined &&
    (!Array.isArray(input.customerIds) ||
      input.customerIds.length === 0 ||
      input.customerIds.some(
        (value) => typeof value !== 'string' || value.trim() === '',
      ))
  ) {
    return {
      ok: false,
      error: 'customerIds must be a non-empty list of customer IDs.',
    };
  }
  if (
    input.limit !== undefined &&
    (typeof input.limit !== 'number' ||
      !Number.isInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > MAX_LIMIT)
  ) {
    return {
      ok: false,
      error: `limit must be an integer from 1 to ${MAX_LIMIT}.`,
    };
  }
  return {
    ok: true,
    value: {
      queryTokens,
      customerIds:
        input.customerIds === undefined ? [] : [...input.customerIds],
      limit: input.limit === undefined ? DEFAULT_LIMIT : input.limit,
    },
  };
}

function validateDocument(document: KnowledgeDocument): void {
  for (const field of [
    document.documentId,
    document.title,
    document.source,
    document.content,
  ]) {
    if (typeof field !== 'string' || field.trim() === '') {
      throw new Error(
        'Knowledge document identity, source, title, and content must be non-empty strings.',
      );
    }
  }
  if (document.content.length > MAX_DOCUMENT_CONTENT_LENGTH) {
    throw new Error(
      `Knowledge document content cannot exceed ${MAX_DOCUMENT_CONTENT_LENGTH} characters.`,
    );
  }
  if (
    !isIsoTimestamp(document.observedAt) ||
    !isIsoTimestamp(document.freshness)
  ) {
    throw new Error('Knowledge document timestamps must be ISO timestamps.');
  }
  if (
    document.customerIds !== undefined &&
    (!Array.isArray(document.customerIds) ||
      document.customerIds.some(
        (value) => typeof value !== 'string' || value.trim() === '',
      ))
  ) {
    throw new Error(
      'Knowledge document customer IDs must be non-empty strings.',
    );
  }
  if (!isDocumentAccess(document.access)) {
    throw new Error('Knowledge document requires an explicit access policy.');
  }
  if (
    document.access.audience === 'company' &&
    (document.customerIds?.length ?? 0) > 0
  ) {
    throw new Error(
      'Customer-tagged documents require customer or admin access.',
    );
  }
  const accessIds =
    document.access.audience === 'customers' ? document.access.customerIds : [];
  if (
    document.access.audience === 'customers' &&
    document.customerIds?.some((customerId) => !accessIds.includes(customerId))
  ) {
    throw new Error('Document access must cover every tagged customer.');
  }
}

function freezeDocument(document: KnowledgeDocument): KnowledgeDocument {
  return Object.freeze({
    ...document,
    customerIds: Object.freeze([...(document.customerIds ?? [])]),
    access: Object.freeze(
      document.access.audience === 'customers'
        ? {
            audience: 'customers',
            customerIds: Object.freeze([...document.access.customerIds]),
          }
        : { audience: document.access.audience },
    ),
  });
}

function chunkContent(content: string): readonly string[] {
  const paragraphs = content
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.replace(/[ \t]+/gu, ' ').trim())
    .filter((paragraph) => paragraph !== '');
  const chunks: string[] = [];
  let current = '';
  for (const paragraph of paragraphs) {
    if (paragraph.length > MAX_CHUNK_LENGTH) {
      if (current) chunks.push(current);
      for (let start = 0; start < paragraph.length; start += MAX_CHUNK_LENGTH) {
        chunks.push(paragraph.slice(start, start + MAX_CHUNK_LENGTH));
      }
      current = '';
    } else if (
      current &&
      current.length + paragraph.length + 2 > MAX_CHUNK_LENGTH
    ) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function score(chunk: KnowledgeChunk, queryTokens: readonly string[]): number {
  return queryTokens.reduce(
    (total, token) => total + (chunk.tokens.has(token) ? 1 : 0),
    0,
  );
}

function isInCustomerScope(
  document: KnowledgeDocument,
  requestedCustomerIds: readonly string[],
): boolean {
  if (requestedCustomerIds.length === 0) return true;
  return (
    document.customerIds?.some((customerId) =>
      requestedCustomerIds.includes(customerId),
    ) ?? false
  );
}

export function canReadDocument(
  access: DocumentAccess,
  viewer: KnowledgeViewer,
): boolean {
  if (!isDocumentAccess(access) || !isViewer(viewer)) return false;
  if (viewer.role === 'admin') return true;
  if (access.audience === 'admin') return false;
  if (access.audience === 'company') return true;
  return access.customerIds.every((id) => viewer.customerIds.includes(id));
}

function isDocumentAccess(value: unknown): value is DocumentAccess {
  if (!isRecord(value)) return false;
  if (value.audience === 'company' || value.audience === 'admin')
    return hasOnlyKeys(value, ['audience']);
  return (
    value.audience === 'customers' &&
    hasOnlyKeys(value, ['audience', 'customerIds']) &&
    Array.isArray(value.customerIds) &&
    value.customerIds.length > 0 &&
    new Set(value.customerIds).size === value.customerIds.length &&
    value.customerIds.every((id) => typeof id === 'string' && id.trim() !== '')
  );
}

function isViewer(value: unknown): value is KnowledgeViewer {
  return (
    isRecord(value) &&
    (value.role === 'admin' || value.role === 'restricted') &&
    Array.isArray(value.customerIds) &&
    value.customerIds.every((id) => typeof id === 'string' && id.trim() !== '')
  );
}

function tokenize(value: string): readonly string[] {
  return [...new Set(normalize(value).match(/[a-z0-9]+/gu) ?? [])];
}

function normalize(value: string): string {
  return value.toLocaleLowerCase('en-US');
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIsoTimestamp(value: string): boolean {
  return !Number.isNaN(Date.parse(value)) && value.includes('T');
}
