import {
  MrrDeclineInvestigationService,
  synthesizeMrrDeclineAnswer,
  type InvestigationRecord,
} from '@executive-bi/investigations';
import {
  mrrDeclineRequestSchema,
  followUpContextRequestSchema,
  investigationEvidenceSchema,
  mrrDeclineResponseSchema,
  type MrrDeclineApiResponse,
} from '@executive-bi/schemas';
import { resolveQuestion } from './resolve-question.js';
import { resolveQuestionRequestSchema } from '@executive-bi/schemas';
import { parseJson } from '../../http/json.js';
const MRR_DECLINE_PATH = '/v1/investigations/mrr-decline';

export class MrrDeclineApi {
  constructor(private readonly investigation: MrrDeclineInvestigationService) {}

  async fetch(request: Request): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    if (
      pathname === '/v1/investigations/resolve-question' &&
      request.method === 'POST'
    ) {
      if (!request.headers.get('content-type')?.includes('application/json'))
        return invalidResponse('Content-Type must be application/json.');
      const body = await parseJson(request);
      if (!body.ok) return invalidResponse(body.error);
      const parsed = resolveQuestionRequestSchema.safeParse(body.value);
      if (!parsed.success) return invalidResponse(parsed.error.message);
      return Response.json(resolveQuestion(parsed.data.question));
    }
    const detail =
      /^\/v1\/investigations\/([A-Za-z0-9_-]{1,100})(?:\/evidence\/([A-Za-z0-9_-]{1,100})|\/follow-up-context|\/answer)?$/u.exec(
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
    if (pathname === `/v1/investigations/${investigationId}/answer`) {
      const result = synthesizeMrrDeclineAnswer(found.record, found.evidence);
      return Response.json(result, {
        status: result.status === 'ok' ? 200 : 422,
      });
    }
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
