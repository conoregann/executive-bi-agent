import { readFile } from 'node:fs/promises';

import {
  createSubscriptionMonthRepository,
  type SubscriptionMonthSnapshot,
} from '@executive-bi/analytics';
import {
  MrrDeclineInvestigationService,
  type InvestigationStore,
  type InvestigationRecord,
} from '@executive-bi/investigations';
import { TrustedMrrService } from '@executive-bi/metrics';
import {
  createCompanyKnowledgeSearch,
  type KnowledgeDocument,
} from '@executive-bi/retrieval';
import {
  mrrDeclineRequestSchema,
  mrrDeclineResponseSchema,
  followUpContextRequestSchema,
  investigationEvidenceSchema,
  type MrrDeclineApiResponse,
} from '@executive-bi/schemas';

const MRR_DECLINE_PATH = '/v1/investigations/mrr-decline';

export { createMrrDeclineServer } from './http-server.js';

export interface SyntheticMrrDeclineDependencies {
  snapshot: SubscriptionMonthSnapshot;
  documents: readonly KnowledgeDocument[];
}

/**
 * Loads the explicitly labeled development fixtures used by this narrow API
 * boundary. Production data sources are intentionally outside this adapter.
 */
export async function loadSyntheticMrrDeclineDependencies(): Promise<SyntheticMrrDeclineDependencies> {
  const [snapshotFile, paymentIncident, salesReview] = await Promise.all([
    readFile(
      new URL(
        '../../../data/synthetic/subscription-month-2026.json',
        import.meta.url,
      ),
      'utf8',
    ),
    readFile(
      new URL(
        '../../../data/synthetic/knowledge/2026-08-payment-incident-281.md',
        import.meta.url,
      ),
      'utf8',
    ),
    readFile(
      new URL(
        '../../../data/synthetic/knowledge/2026-08-sales-review.md',
        import.meta.url,
      ),
      'utf8',
    ),
  ]);
  const snapshot = parseSyntheticSnapshot(JSON.parse(snapshotFile) as unknown);

  return {
    snapshot,
    documents: [
      {
        documentId: 'payment-incident-281',
        title: 'Payment provider incident #281',
        source: 'synthetic_knowledge',
        observedAt: '2026-08-16T17:30:00Z',
        freshness: snapshot.freshness,
        content: paymentIncident,
      },
      {
        documentId: 'august-sales-review',
        title: 'August sales review',
        source: 'synthetic_knowledge',
        observedAt: '2026-08-31T17:00:00Z',
        freshness: snapshot.freshness,
        content: salesReview,
        customerIds: ['cust_acme'],
      },
    ],
  };
}

export function createMrrDeclineApi(
  dependencies: SyntheticMrrDeclineDependencies,
  store?: InvestigationStore,
): MrrDeclineApi {
  const metrics = new TrustedMrrService(
    createSubscriptionMonthRepository(dependencies.snapshot),
  );
  const knowledge = createCompanyKnowledgeSearch(dependencies.documents);
  const investigation = new MrrDeclineInvestigationService(
    {
      compareMrr: metrics.compareMrr.bind(metrics),
      getMrrMovement: metrics.getMrrMovement.bind(metrics),
      getCustomerMrrMovement: metrics.getCustomerMrrMovement.bind(metrics),
      breakdownMrr: metrics.breakdownMrr.bind(metrics),
      searchCompanyKnowledge: knowledge.search.bind(knowledge),
    },
    store,
  );
  return new MrrDeclineApi(investigation);
}

export async function createSyntheticMrrDeclineApi(
  store?: InvestigationStore,
): Promise<MrrDeclineApi> {
  return createMrrDeclineApi(
    await loadSyntheticMrrDeclineDependencies(),
    store,
  );
}

export class MrrDeclineApi {
  constructor(private readonly investigation: MrrDeclineInvestigationService) {}

  async fetch(request: Request): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    const detail =
      /^\/v1\/investigations\/([A-Za-z0-9_-]{1,100})(?:\/evidence\/([A-Za-z0-9_-]{1,100})|\/follow-up-context)?$/u.exec(
        pathname,
      );
    if (detail && pathname !== MRR_DECLINE_PATH)
      return this.fetchStored(request, detail[1]!, detail[2]);
    if (request.method !== 'POST' || pathname !== MRR_DECLINE_PATH) {
      return Response.json(
        { status: 'not_found', error: 'Route not found.' },
        { status: 404 },
      );
    }
    if (!request.headers.get('content-type')?.includes('application/json')) {
      return invalidResponse('Content-Type must be application/json.');
    }

    const body = await parseJson(request);
    if (!body.ok) return invalidResponse(body.error);
    const parsed = mrrDeclineRequestSchema.safeParse(body.value);
    if (!parsed.success) return invalidResponse(parsed.error.message);

    const result = await this.investigation.start(parsed.data);
    if (result.status === 'invalid_request') {
      return validatedResponse(
        {
          status: 'invalid_request',
          warnings: [],
          error: result.error ?? 'Invalid request.',
        },
        result.error?.includes('already been used') ? 409 : 400,
      );
    }

    return validatedResponse(
      {
        status: result.status,
        record: toApiRecord(result.record!),
        accessToken: result.accessToken!,
        warnings: [...result.warnings],
        ...(result.error === undefined ? {} : { error: result.error }),
      },
      result.status === 'completed' ? 201 : 422,
    );
  }

  private async fetchStored(
    request: Request,
    investigationId: string,
    evidenceId?: string,
  ): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    const followUp = pathname.endsWith('/follow-up-context');
    if (request.method !== (followUp ? 'POST' : 'GET')) return notFound();
    const authorization = request.headers.get('authorization');
    if (
      !authorization?.startsWith('Bearer ') ||
      !/^[A-Za-z0-9_-]{43}$/u.test(authorization.slice(7))
    ) {
      return Response.json(
        { status: 'unauthorized', error: 'Bearer access token required.' },
        { status: 401 },
      );
    }
    const token = authorization.slice(7);
    if (followUp) {
      if (!request.headers.get('content-type')?.includes('application/json'))
        return invalidResponse('Content-Type must be application/json.');
      const body = await parseJson(request);
      if (!body.ok) return invalidResponse(body.error);
      const parsed = followUpContextRequestSchema.safeParse(body.value);
      if (!parsed.success) return invalidResponse(parsed.error.message);
      const context = await this.investigation.getFollowUpContext(
        investigationId,
        token,
        parsed.data.month,
        parsed.data.permittedCustomerIds,
      );
      if (context.status === 'scope_mismatch')
        return Response.json(
          {
            status: 'scope_mismatch',
            error: 'Follow-up scope must match the original investigation.',
          },
          { status: 403 },
        );
      if (context.status !== 'ok') return notFound();
      return Response.json({
        status: 'ok',
        record: toApiRecord(context.record!),
      });
    }
    const found = await this.investigation.getInvestigation(
      investigationId,
      token,
    );
    if (found.status !== 'ok') return notFound();
    if (evidenceId !== undefined) {
      const evidence = found.evidence.find(
        (item) => item.evidenceId === evidenceId,
      );
      if (!evidence) return notFound();
      return Response.json({
        status: 'ok',
        evidence: investigationEvidenceSchema.parse(evidence),
      });
    }
    return Response.json({ status: 'ok', record: toApiRecord(found.record) });
  }
}

function notFound(): Response {
  return Response.json(
    { status: 'not_found', error: 'Resource not found.' },
    { status: 404 },
  );
}

function parseSyntheticSnapshot(value: unknown): SubscriptionMonthSnapshot {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !('label' in value) ||
    !('freshness' in value) ||
    !('rows' in value) ||
    typeof value.label !== 'string' ||
    !value.label.startsWith('Synthetic data') ||
    typeof value.freshness !== 'string' ||
    !Array.isArray(value.rows)
  ) {
    throw new Error(
      'Synthetic subscription snapshot is malformed or unlabeled.',
    );
  }
  return {
    freshness: value.freshness,
    rows: value.rows as SubscriptionMonthSnapshot['rows'],
  };
}

async function parseJson(
  request: Request,
): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
  try {
    const reader = request.body?.getReader();
    if (!reader)
      return { ok: false, error: 'Request body must contain valid JSON.' };
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 16_384) {
        await reader.cancel();
        return { ok: false, error: 'Request body exceeds 16 KiB.' };
      }
      chunks.push(chunk.value);
    }
    return {
      ok: true,
      value: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown,
    };
  } catch {
    return { ok: false, error: 'Request body must contain valid JSON.' };
  }
}

function invalidResponse(error: string): Response {
  return validatedResponse(
    { status: 'invalid_request', warnings: [], error },
    400,
  );
}

function toApiRecord(record: InvestigationRecord) {
  return {
    ...record,
    permittedCustomerIds: [...record.permittedCustomerIds],
    plan: {
      ...record.plan,
      steps: [...record.plan.steps] as [
        'compare_mrr',
        'get_mrr_movement',
        'get_customer_mrr_movement',
        'breakdown_mrr_by_plan',
        'search_company_knowledge',
      ],
    },
    evidenceIds: [...record.evidenceIds],
    warnings: [...record.warnings],
    driverCustomerIds: [...record.driverCustomerIds],
  };
}

function validatedResponse(
  body: MrrDeclineApiResponse,
  status: number,
): Response {
  const parsed = mrrDeclineResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error(
      `MRR-decline response contract violation: ${parsed.error.message}`,
    );
  }
  return Response.json(parsed.data, { status });
}
