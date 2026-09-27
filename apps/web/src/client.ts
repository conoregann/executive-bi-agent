import {
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
      'Enter customer IDs or clear the scope field for the full synthetic dataset.',
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
