import { z } from 'zod';

const calendarMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/u);
const opaqueIdentifier = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/u);
const customerIds = z
  .array(z.string().trim().min(1))
  .min(1)
  .max(50)
  .refine(
    (ids) => new Set(ids).size === ids.length,
    'Customer IDs must be unique.',
  );

export const mrrDeclineRequestSchema = z
  .object({
    investigationId: opaqueIdentifier,
    month: calendarMonth,
    permittedCustomerIds: customerIds.optional(),
  })
  .strict();

const investigationPlanSchema = z
  .object({
    investigationId: opaqueIdentifier,
    steps: z.tuple([
      z.literal('compare_mrr'),
      z.literal('get_mrr_movement'),
      z.literal('get_customer_mrr_movement'),
      z.literal('breakdown_mrr_by_plan'),
      z.literal('search_company_knowledge'),
    ]),
    maximumToolCalls: z.literal(5),
  })
  .strict();

export const mrrDeclineRecordSchema = z
  .object({
    investigationId: opaqueIdentifier,
    kind: z.literal('mrr_decline'),
    month: calendarMonth,
    permittedCustomerIds: z.array(z.string().min(1)),
    plan: investigationPlanSchema,
    status: z.enum(['completed', 'blocked']),
    evidenceIds: z.array(z.string().min(1)),
    warnings: z.array(z.string().min(1)),
    driverCustomerIds: z.array(z.string().min(1)),
  })
  .strict();

export const investigationEvidenceSchema = z
  .object({
    evidenceId: z.string().min(1),
    type: z.enum(['metric_query', 'calculation', 'document_chunk']),
    source: z.string().min(1),
    sourceRef: z.string().min(1),
    observedAt: z.union([calendarMonth, z.string().datetime()]),
    retrievedAt: z.string().datetime(),
    scope: z.record(z.string(), z.unknown()),
    content: z.record(z.string(), z.unknown()),
    freshness: z.string().datetime(),
    integrity: z.enum(['valid', 'warning', 'invalid']),
  })
  .strict();

export const followUpContextRequestSchema = z
  .object({
    month: calendarMonth,
    permittedCustomerIds: z
      .array(z.string().trim().min(1))
      .max(50)
      .refine(
        (ids) => new Set(ids).size === ids.length,
        'Customer IDs must be unique.',
      )
      .default([]),
  })
  .strict();

const completedOrBlockedResponseSchema = z
  .object({
    status: z.enum(['completed', 'blocked']),
    record: mrrDeclineRecordSchema,
    accessToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
    warnings: z.array(z.string().min(1)),
    error: z.string().min(1).optional(),
  })
  .strict();

const invalidRequestResponseSchema = z
  .object({
    status: z.literal('invalid_request'),
    warnings: z.array(z.string().min(1)),
    error: z.string().min(1),
  })
  .strict();

export const mrrDeclineResponseSchema = z.union([
  completedOrBlockedResponseSchema,
  invalidRequestResponseSchema,
]);

export type MrrDeclineApiRequest = z.infer<typeof mrrDeclineRequestSchema>;
export type MrrDeclineApiResponse = z.infer<typeof mrrDeclineResponseSchema>;
