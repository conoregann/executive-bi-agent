import {
  readCrossSourceAnswer,
  MrrDeclineInvestigationService,
  synthesizeMrrDeclineAnswer,
  synthesizeCountryFollowUpAnswer,
  synthesizeCustomerFollowUpAnswer,
  synthesizeChurnFollowUpAnswer,
  type InvestigationRecord,
} from '@executive-bi/investigations';
import {
  crossSourceResponseSchema,
  churnFollowUpResponseSchema,
  mrrDeclineRequestSchema,
  countryFollowUpResponseSchema,
  customerFollowUpResponseSchema,
  countryFollowUpFailureSchema,
  storedInvestigationRecordSchema,
  followUpContextRequestSchema,
  investigationEvidenceSchema,
  mrrDeclineResponseSchema,
  type MrrDeclineApiResponse,
} from '@executive-bi/schemas';
import { resolveQuestion } from './resolve-question.js';
import { resolveQuestionRequestSchema } from '@executive-bi/schemas';
import { parseJson } from '../../http/json.js';
import {
  newToken,
  tokenHash,
  verifyPassword,
  resolveScope,
  permitsRecord,
  type AccessStore,
  type UserAccess,
} from '../../access.js';
const MRR_DECLINE_PATH = '/v1/investigations/mrr-decline';

export class MrrDeclineApi {
  constructor(
    private readonly investigation: MrrDeclineInvestigationService,
    private readonly access?: AccessStore,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/v1/sessions' && request.method === 'POST')
      return this.login(request);
    const user = this.access ? await this.authenticate(request) : undefined;
    if (this.access && !user) return unauthorized();
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
      /^\/v1\/investigations\/([A-Za-z0-9_-]{1,100})(?:\/evidence\/([A-Za-z0-9_-]{1,100})|\/follow-up-context|\/country-follow-ups|\/customer-follow-ups|\/customer-churn-follow-ups|\/cross-source-follow-ups|\/answer)?$/u.exec(
        pathname,
      );
    if (detail && pathname !== MRR_DECLINE_PATH)
      return this.fetchStored(request, detail[1]!, detail[2], user);
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

    const scope = user
      ? resolveScope(user, parsed.data.permittedCustomerIds)
      : (parsed.data.permittedCustomerIds ?? []);
    if (!scope) return forbidden();
    const result = await this.investigation.start({
      ...parsed.data,
      ...(scope.length ? { permittedCustomerIds: scope } : {}),
    });
    if (user && result.record)
      await this.access!.bind(result.record.investigationId, user.userId);
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

  private async login(request: Request): Promise<Response> {
    if (!this.access) return notFound();
    if (!request.headers.get('content-type')?.includes('application/json'))
      return invalidResponse('Content-Type must be application/json.');
    const body = await parseJson(request);
    if (!body.ok || !body.value || typeof body.value !== 'object')
      return unauthorized();
    const { username, password } = body.value as Record<string, unknown>;
    if (
      typeof username !== 'string' ||
      typeof password !== 'string' ||
      username.length > 100 ||
      password.length > 1024
    )
      return unauthorized();
    const credentials = await this.access.credentials(username);
    if (
      !credentials ||
      !(await verifyPassword(password, credentials.passwordHash))
    )
      return unauthorized();
    const user = await this.access.user(credentials.userId);
    if (!user?.active) return unauthorized();
    const token = newToken();
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
    await this.access.saveSession(tokenHash(token), user.userId, expiresAt);
    return Response.json({
      status: 'ok',
      sessionToken: token,
      expiresAt: expiresAt.toISOString(),
      role: user.role,
      customerIds: user.customerIds,
    });
  }

  private async authenticate(
    request: Request,
  ): Promise<UserAccess | undefined> {
    const token = request.headers.get('x-session-token');
    if (!token || !/^[A-Za-z0-9_-]{43}$/u.test(token)) return undefined;
    const userId = await this.access!.sessionUser(tokenHash(token));
    if (!userId) return undefined;
    const user = await this.access!.user(userId);
    return user?.active ? user : undefined;
  }

  private async authorizedRecord(
    id: string,
    user: UserAccess,
  ): Promise<boolean> {
    return (await this.access!.owner(id)) === user.userId;
  }

  private async fetchStored(
    request: Request,
    investigationId: string,
    evidenceId?: string,
    user?: UserAccess,
  ): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    if (user) {
      const bearer = request.headers.get('authorization');
      if (
        !bearer?.startsWith('Bearer ') ||
        !/^[A-Za-z0-9_-]{43}$/u.test(bearer.slice(7))
      )
        return Response.json(
          { status: 'unauthorized', error: 'Bearer access token required.' },
          { status: 401 },
        );
      if (!(await this.authorizedRecord(investigationId, user)))
        return notFound();
      const parent = await this.investigation.getInvestigation(
        investigationId,
        bearer.slice(7),
      );
      if (
        parent.status !== 'ok' ||
        !permitsRecord(user, parent.record.permittedCustomerIds)
      )
        return notFound();
    }
    const crossSource = pathname.endsWith('/cross-source-follow-ups');
    const churnFollowUp = pathname.endsWith('/customer-churn-follow-ups');
    const customerFollowUp = pathname.endsWith('/customer-follow-ups');
    const countryFollowUp = pathname.endsWith('/country-follow-ups');
    const followUp = pathname.endsWith('/follow-up-context');
    if (
      request.method !==
      (followUp ||
      countryFollowUp ||
      customerFollowUp ||
      churnFollowUp ||
      crossSource
        ? 'POST'
        : 'GET')
    )
      return notFound();
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
    if (countryFollowUp || customerFollowUp || churnFollowUp || crossSource) {
      if (!request.headers.get('content-type')?.includes('application/json'))
        return invalidResponse('Content-Type must be application/json.');
      const body = await parseJson(request);
      if (!body.ok) return invalidResponse(body.error);
      const result = churnFollowUp
        ? await this.investigation.startChurnFollowUp(
            investigationId,
            token,
            body.value,
          )
        : crossSource
          ? await this.investigation.startCrossSourceFollowUp(
              investigationId,
              token,
              body.value,
            )
          : customerFollowUp
            ? await this.investigation.startCustomerFollowUp(
                investigationId,
                token,
                body.value,
              )
            : await this.investigation.startCountryFollowUp(
                investigationId,
                token,
                body.value,
              );
      if (result.status === 'not_found') return notFound();
      if (
        user &&
        (result.status === 'completed' || result.status === 'blocked')
      )
        await this.access!.bind(result.record.investigationId, user.userId);
      if (result.status === 'completed' || result.status === 'blocked')
        return Response.json(
          (churnFollowUp
            ? churnFollowUpResponseSchema
            : crossSource
              ? crossSourceResponseSchema
              : customerFollowUp
                ? customerFollowUpResponseSchema
                : countryFollowUpResponseSchema
          ).parse(result),
          {
            status: result.status === 'completed' ? 201 : 422,
          },
        );
      return Response.json(countryFollowUpFailureSchema.parse(result), {
        status:
          result.status === 'conflict'
            ? 409
            : result.status === 'invalid_request'
              ? 400
              : 422,
      });
    }
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
    if (user && !permitsRecord(user, found.record.permittedCustomerIds))
      return notFound();
    if (pathname === `/v1/investigations/${investigationId}/answer`) {
      const result =
        found.record.kind === 'mrr_cross_source'
          ? readCrossSourceAnswer(found.record, found.evidence)
          : found.record.kind === 'customer_churn_follow_up'
            ? synthesizeChurnFollowUpAnswer(found.record, found.evidence)
            : found.record.kind === 'mrr_decline'
              ? synthesizeMrrDeclineAnswer(found.record, found.evidence)
              : found.record.kind === 'mrr_country_follow_up'
                ? synthesizeCountryFollowUpAnswer(found.record, found.evidence)
                : synthesizeCustomerFollowUpAnswer(
                    found.record,
                    found.evidence,
                  );
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
    return Response.json({
      status: 'ok',
      record: storedInvestigationRecordSchema.parse(found.record),
    });
  }
}

function unauthorized(): Response {
  return Response.json(
    { status: 'unauthorized', error: 'Valid user session required.' },
    { status: 401 },
  );
}

function forbidden(): Response {
  return Response.json(
    { status: 'forbidden', error: 'Requested customer scope is unavailable.' },
    { status: 403 },
  );
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
