import {
  customerFollowUpRequestSchema,
  churnFollowUpRequestSchema,
  churnFollowUpResponseSchema,
  churnFollowUpAnswerSchema,
  customerFollowUpResponseSchema,
  customerFollowUpAnswerSchema,
  countryFollowUpRequestSchema,
  countryFollowUpResponseSchema,
  countryFollowUpAnswerSchema,
  resolveQuestionRequestSchema,
  resolveQuestionResponseSchema,
  investigationAnswerSchema,
  investigationEvidenceSchema,
  mrrDeclineRequestSchema,
  mrrDeclineResponseSchema,
} from '@executive-bi/schemas';

export async function readJson(response: Response): Promise<unknown> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok && response.status !== 422)
    throw new Error(
      response.status === 401 || response.status === 404
        ? 'Investigation access unavailable. Start a new investigation.'
        : 'Investigation service unavailable. Please try again.',
    );
  return body;
}
export async function startInvestigation(month: string, customers: string) {
  const ids = customers
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (customers.trim() && !ids.length)
    throw new Error(
      'Enter customer IDs or clear the scope field for all customers.',
    );
  const request = mrrDeclineRequestSchema.safeParse({
    investigationId: crypto.randomUUID(),
    month: `${month}-01`,
    ...(ids.length ? { permittedCustomerIds: ids } : {}),
  });
  if (!request.success)
    throw new Error('Choose a valid month and at most 50 unique customer IDs.');
  const response = await fetch('/v1/investigations/mrr-decline', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request.data),
    cache: 'no-store',
  });
  const parsed = mrrDeclineResponseSchema.safeParse(await readJson(response));
  if (!parsed.success)
    throw new Error(
      'The service returned an invalid response. Please try again.',
    );
  const result = parsed.data;
  if (result.status === 'invalid_request') throw new Error(result.error);
  return result;
}
export async function readAnswer(id: string, token: string) {
  const response = await fetch(
    `/v1/investigations/${encodeURIComponent(id)}/answer`,
    { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' },
  );
  const body = await readJson(response);
  if (response.status === 422)
    throw new Error(
      'The stored evidence is insufficient for an executive answer.',
    );
  const parsed = investigationAnswerSchema.safeParse(
    body && typeof body === 'object' && 'answer' in body
      ? body.answer
      : undefined,
  );
  if (!parsed.success)
    throw new Error(
      'The service returned an invalid answer. Please try again.',
    );
  return parsed.data;
}
export async function readEvidence(
  id: string,
  token: string,
  evidenceId: string,
) {
  const response = await fetch(
    `/v1/investigations/${encodeURIComponent(id)}/evidence/${encodeURIComponent(evidenceId)}`,
    { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' },
  );
  return investigationEvidenceSchema.parse(
    ((await readJson(response)) as { evidence: unknown }).evidence,
  );
}

export async function resolveQuestion(question: string) {
  const request = resolveQuestionRequestSchema.safeParse({ question });
  if (!request.success)
    throw new Error('Enter a question of at most 1000 characters.');
  const response = await fetch('/v1/investigations/resolve-question', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request.data),
    cache: 'no-store',
  });
  const parsed = resolveQuestionResponseSchema.safeParse(
    await readJson(response),
  );
  if (!parsed.success)
    throw new Error(
      'The service returned an invalid resolution. Please try again.',
    );
  return parsed.data;
}

export async function startCountryFollowUp(
  id: string,
  token: string,
  question?: string,
) {
  const body = countryFollowUpRequestSchema.parse({
    investigationId: crypto.randomUUID(),
    ...(question === undefined
      ? { action: 'breakdown_mrr_by_country' }
      : { question }),
  });
  const response = await fetch(
    `/v1/investigations/${encodeURIComponent(id)}/country-follow-ups`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    },
  );
  const json = await readJson(response);
  if (
    json &&
    typeof json === 'object' &&
    'status' in json &&
    (json.status === 'unsupported' || json.status === 'invalid_parent')
  )
    throw new Error(
      json.status === 'unsupported'
        ? 'Only “Break that down by country” is supported. Start a new investigation for different dates, metrics or filters.'
        : 'A completed parent investigation with usable evidence is required.',
    );
  const parsed = countryFollowUpResponseSchema.safeParse(json);
  if (!parsed.success)
    throw new Error(
      'The service returned an invalid follow-up. Please try again.',
    );
  return parsed.data;
}
export async function startChurnFollowUp(id: string, token: string) {
  const body = churnFollowUpRequestSchema.parse({
    investigationId: crypto.randomUUID(),
    action: 'get_customer_churn_rate',
  });
  const response = await fetch(
    `/v1/investigations/${encodeURIComponent(id)}/customer-churn-follow-ups`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    },
  );
  const parsed = churnFollowUpResponseSchema.safeParse(
    await readJson(response),
  );
  if (!parsed.success)
    throw new Error('The service returned an invalid churn follow-up.');
  return parsed.data;
}
export async function readChurnFollowUpAnswer(id: string, token: string) {
  const response = await fetch(
    `/v1/investigations/${encodeURIComponent(id)}/answer`,
    {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
    },
  );
  const body = await readJson(response);
  const parsed = churnFollowUpAnswerSchema.safeParse(
    body && typeof body === 'object' && 'answer' in body
      ? body.answer
      : undefined,
  );
  if (!parsed.success)
    throw new Error(
      'Retained customer churn evidence is insufficient for an answer.',
    );
  return parsed.data;
}
export async function readCountryFollowUpAnswer(id: string, token: string) {
  const response = await fetch(
    `/v1/investigations/${encodeURIComponent(id)}/answer`,
    { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' },
  );
  const body = await readJson(response);
  const parsed = countryFollowUpAnswerSchema.safeParse(
    body && typeof body === 'object' && 'answer' in body
      ? body.answer
      : undefined,
  );
  if (!parsed.success)
    throw new Error('Retained country evidence is insufficient for an answer.');
  return parsed.data;
}

export async function startCustomerFollowUp(
  id: string,
  token: string,
  country: string | null,
) {
  const body = customerFollowUpRequestSchema.parse({
    investigationId: crypto.randomUUID(),
    country,
  });
  const response = await fetch(
    `/v1/investigations/${encodeURIComponent(id)}/customer-follow-ups`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    },
  );
  const parsed = customerFollowUpResponseSchema.safeParse(
    await readJson(response),
  );
  if (!parsed.success)
    throw new Error(
      'Customer drill-down unavailable. A completed country comparison is required.',
    );
  return parsed.data;
}
export async function readCustomerFollowUpAnswer(id: string, token: string) {
  const response = await fetch(
    `/v1/investigations/${encodeURIComponent(id)}/answer`,
    { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' },
  );
  const body = await readJson(response);
  const parsed = customerFollowUpAnswerSchema.safeParse(
    body && typeof body === 'object' && 'answer' in body
      ? body.answer
      : undefined,
  );
  if (!parsed.success)
    throw new Error(
      'Retained customer evidence is insufficient for an answer.',
    );
  return parsed.data;
}

export async function investigateCrossSource(
  id: string,
  token: string,
  question: string,
) {
  const {
    crossSourceRequestSchema,
    crossSourceResponseSchema,
    crossSourceAnswerSchema,
  } = await import('@executive-bi/schemas');
  const request = crossSourceRequestSchema.parse({
    investigationId: crypto.randomUUID(),
    question,
  });
  const response = await fetch(
    `/v1/investigations/${encodeURIComponent(id)}/cross-source-follow-ups`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(request),
      cache: 'no-store',
    },
  );
  const child = crossSourceResponseSchema.parse(await readJson(response));
  if (child.status === 'blocked')
    throw new Error(`Investigation blocked: ${child.warnings.join(' ')}`);
  const answerResponse = await fetch(
    `/v1/investigations/${encodeURIComponent(child.record.investigationId)}/answer`,
    {
      headers: { authorization: `Bearer ${child.accessToken}` },
      cache: 'no-store',
    },
  );
  const body = (await readJson(answerResponse)) as { answer: unknown };
  return {
    answer: crossSourceAnswerSchema.parse(body.answer),
    session: { id: child.record.investigationId, token: child.accessToken },
  };
}
