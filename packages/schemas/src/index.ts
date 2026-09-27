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

const answerClaimSchema = z
  .object({
    classification: z.enum(['observed_fact', 'calculated_delta', 'context']),
    text: z.string().min(1),
    evidenceIds: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const mrrPlanChartSchema = z
  .object({
    chartType: z.literal('bar'),
    month: calendarMonth,
    permittedCustomerIds: z.array(z.string().min(1)),
    sourceEvidenceId: z.string().min(1),
    reconciles: z.boolean(),
    unassignedMrrEurCents: z.number().int().nonnegative().safe(),
    data: z.array(
      z
        .object({
          dimensionValue: z.string().min(1),
          mrrEurCents: z.number().int().nonnegative().safe(),
        })
        .strict(),
    ),
  })
  .strict()
  .refine(
    (chart) =>
      new Set(chart.data.map((row) => row.dimensionValue)).size ===
        chart.data.length &&
      chart.reconciles === (chart.unassignedMrrEurCents === 0),
    'Chart rows must be unique and reconciliation must match unassigned MRR.',
  );

export const investigationAnswerSchema = z
  .object({
    investigationId: opaqueIdentifier,
    scope: z
      .object({
        month: calendarMonth,
        comparison: z.literal('previous_period'),
        permittedCustomerIds: z.array(z.string().min(1)),
      })
      .strict(),
    answer: answerClaimSchema.extend({
      classification: z.literal('calculated_delta'),
    }),
    drivers: z.array(
      answerClaimSchema.extend({ classification: z.literal('observed_fact') }),
    ),
    context: z.array(
      answerClaimSchema.extend({ classification: z.literal('context') }),
    ),
    limitations: z.array(z.string().min(1)),
    evidence: z
      .array(
        z
          .object({
            evidenceId: z.string().min(1),
            sourceRef: z.string().min(1),
            type: z.enum(['metric_query', 'calculation', 'document_chunk']),
            freshness: z.string().datetime(),
          })
          .strict(),
      )
      .min(1),
    chart: mrrPlanChartSchema.optional(),
    recommendedNextStep: z
      .object({
        owner: z.literal('Revenue operations'),
        text: z.string().min(1),
        customerIds: z.array(z.string().min(1)).max(5),
      })
      .strict(),
  })
  .strict()
  .superRefine((answer, ctx) => {
    const evidence = new Map(
      answer.evidence.map((item) => [item.evidenceId, item]),
    );
    if (evidence.size !== answer.evidence.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Duplicate evidence IDs.',
      });
    }
    if (
      answer.chart &&
      (evidence.get(answer.chart.sourceEvidenceId)?.type !== 'metric_query' ||
        answer.chart.month !== answer.scope.month ||
        answer.chart.permittedCustomerIds.length !==
          answer.scope.permittedCustomerIds.length ||
        new Set(answer.chart.permittedCustomerIds).size !==
          answer.chart.permittedCustomerIds.length ||
        !answer.chart.permittedCustomerIds.every((id) =>
          answer.scope.permittedCustomerIds.includes(id),
        ))
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Chart requires matching scope and inspectable metric evidence.',
      });
    for (const claim of [answer.answer, ...answer.drivers, ...answer.context]) {
      const citations = claim.evidenceIds.map((id) => evidence.get(id));
      if (
        citations.some((citation) => citation === undefined) ||
        !citations.some(
          (citation) =>
            citation?.type ===
            (claim.classification === 'context'
              ? 'document_chunk'
              : claim.classification === 'calculated_delta'
                ? 'calculation'
                : 'metric_query'),
        )
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Claim requires matching inspectable evidence.',
        });
      }
    }
  });

export type InvestigationAnswer = z.infer<typeof investigationAnswerSchema>;
