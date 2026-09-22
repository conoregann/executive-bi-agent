export const KNOWLEDGE_RETRIEVAL_VERSION = '1.0.0';

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
  search(input: unknown): Promise<KnowledgeSearchResult>;
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
    async search(input) {
      const request = parseSearchRequest(input);
      if (!request.ok) {
        return {
          status: 'invalid_request',
          hits: [],
          warnings: [],
          error: request.error,
        };
      }

      const scored = chunks
        .filter((chunk) =>
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
}

function freezeDocument(document: KnowledgeDocument): KnowledgeDocument {
  return Object.freeze({
    ...document,
    customerIds: Object.freeze([...(document.customerIds ?? [])]),
  });
}

function chunkContent(content: string): readonly string[] {
  const paragraphs = content
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.replace(/\s+/gu, ' ').trim())
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
      current.length + paragraph.length + 1 > MAX_CHUNK_LENGTH
    ) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = current ? `${current}\n${paragraph}` : paragraph;
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
