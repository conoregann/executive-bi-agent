import { readFile } from 'node:fs/promises';
import type { SubscriptionMonthSnapshot } from '@executive-bi/analytics';
import type { KnowledgeDocument } from '@executive-bi/retrieval';

export interface SyntheticMrrDeclineDependencies {
  snapshot: SubscriptionMonthSnapshot;
  documents: readonly KnowledgeDocument[];
}

/**
 * Loads the explicitly labeled development fixtures used by this narrow API
 * boundary. Production data sources are intentionally outside this adapter.
 */
export async function loadSyntheticMrrDeclineDependencies(): Promise<SyntheticMrrDeclineDependencies> {
  const snapshotFile = await readFile(
    new URL(
      '../../../../../data/synthetic/subscription-month-2026.json',
      import.meta.url,
    ),
    'utf8',
  );
  return {
    snapshot: parseSyntheticSnapshot(JSON.parse(snapshotFile) as unknown),
    documents: await loadSyntheticKnowledgeDocuments(),
  };
}

export async function loadSyntheticKnowledgeDocuments(): Promise<
  readonly KnowledgeDocument[]
> {
  const [paymentIncident, salesReview] = await Promise.all([
    readFile(
      new URL(
        '../../../../../data/synthetic/knowledge/2026-08-payment-incident-281.md',
        import.meta.url,
      ),
      'utf8',
    ),
    readFile(
      new URL(
        '../../../../../data/synthetic/knowledge/2026-08-sales-review.md',
        import.meta.url,
      ),
      'utf8',
    ),
  ]);
  return [
    {
      documentId: 'payment-incident-281',
      title: 'Payment provider incident #281',
      source: 'synthetic_knowledge',
      observedAt: '2026-08-16T17:30:00Z',
      freshness: '2026-09-01T08:00:00Z',
      content: paymentIncident,
    },
    {
      documentId: 'august-sales-review',
      title: 'August sales review',
      source: 'synthetic_knowledge',
      observedAt: '2026-08-31T17:00:00Z',
      freshness: '2026-09-01T08:00:00Z',
      content: salesReview,
      customerIds: ['cust_acme'],
    },
  ];
}

function parseSyntheticSnapshot(value: unknown): SubscriptionMonthSnapshot {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !('label' in value) ||
    !('freshness' in value) ||
    !('coverage' in value) ||
    !('rows' in value) ||
    typeof value.label !== 'string' ||
    !value.label.startsWith('Synthetic data') ||
    typeof value.freshness !== 'string' ||
    !Array.isArray(value.coverage) ||
    !Array.isArray(value.rows)
  ) {
    throw new Error(
      'Synthetic subscription snapshot is malformed or unlabeled.',
    );
  }
  return {
    freshness: value.freshness,
    coverage: value.coverage as SubscriptionMonthSnapshot['coverage'],
    rows: value.rows as SubscriptionMonthSnapshot['rows'],
  };
}
