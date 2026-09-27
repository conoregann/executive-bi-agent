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

export const resolveQuestionRequestSchema = z
  .object({
    question: z.string().trim().min(1).max(1000),
  })
  .strict();

export const resolveQuestionResponseSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('resolved'),
      question: z.string().min(1).max(1000),
      metric: z.literal('mrr'),
      month: calendarMonth,
      comparison: z.literal('previous_period'),
      responseMode: z.literal('investigation'),
    })
    .strict(),
  z
    .object({
      status: z.enum(['clarification_required', 'unsupported']),
      message: z.string().min(1),
    })
    .strict(),
]);

export const countryFollowUpRequestSchema = z
  .object({
    investigationId: opaqueIdentifier,
    action: z.literal('breakdown_mrr_by_country').optional(),
    question: z.string().trim().min(1).max(1000).optional(),
  })
  .strict()
  .refine(
    (value) => (value.action !== undefined) !== (value.question !== undefined),
    'Provide exactly one action or question.',
  );

export const countryMrrComparisonSchema = z
  .object({
    currentMonth: calendarMonth,
    previousMonth: calendarMonth,
    previousMrrEurCents: z.number().int().nonnegative().safe(),
    currentMrrEurCents: z.number().int().nonnegative().safe(),
    mrrChangeEurCents: z.number().int().safe(),
    missingDimensions: z.boolean(),
    rows: z.array(
      z
        .object({
          country: z
            .string()
            .min(1)
            .refine((value) => value.trim().length > 0)
            .nullable(),
          previousMrrEurCents: z.number().int().nonnegative().safe(),
          currentMrrEurCents: z.number().int().nonnegative().safe(),
          mrrChangeEurCents: z.number().int().safe(),
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((value, ctx) => {
    const date = new Date(`${value.currentMonth}T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() - 1);
    if (
      date.toISOString().slice(0, 10) !== value.previousMonth ||
      new Set(value.rows.map((row) => row.country)).size !==
        value.rows.length ||
      value.missingDimensions !==
        value.rows.some((row) => row.country === null) ||
      value.rows.some(
        (row, index) =>
          index > 0 &&
          (value.rows[index - 1]!.mrrChangeEurCents > row.mrrChangeEurCents ||
            (value.rows[index - 1]!.mrrChangeEurCents ===
              row.mrrChangeEurCents &&
              (value.rows[index - 1]!.country ?? '').localeCompare(
                row.country ?? '',
              ) > 0)),
      ) ||
      value.rows.some(
        (row) =>
          row.currentMrrEurCents - row.previousMrrEurCents !==
          row.mrrChangeEurCents,
      ) ||
      value.currentMrrEurCents - value.previousMrrEurCents !==
        value.mrrChangeEurCents ||
      (
        [
          'previousMrrEurCents',
          'currentMrrEurCents',
          'mrrChangeEurCents',
        ] as const
      ).some(
        (key) =>
          value.rows.reduce((total, row) => total + row[key], 0) !== value[key],
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Country comparison must reconcile with consecutive months and unique rows.',
      });
    }
  });

export const countryFollowUpPlanSchema = z
  .object({
    investigationId: opaqueIdentifier,
    steps: z.tuple([
      z.literal('breakdown_mrr_by_country_previous'),
      z.literal('breakdown_mrr_by_country_current'),
    ]),
    maximumToolCalls: z.literal(2),
  })
  .strict();
export const countryFollowUpRecordSchema = z
  .object({
    investigationId: opaqueIdentifier,
    parentInvestigationId: opaqueIdentifier,
    kind: z.literal('mrr_country_follow_up'),
    month: calendarMonth,
    permittedCustomerIds: z.array(z.string().min(1)),
    plan: countryFollowUpPlanSchema,
    status: z.enum(['completed', 'blocked']),
    evidenceIds: z.array(z.string().min(1)),
    warnings: z.array(z.string().min(1)),
  })
  .strict();
export const storedInvestigationRecordSchema = z.union([
  mrrDeclineRecordSchema,
  countryFollowUpRecordSchema,
]);
export const countryFollowUpAnswerSchema = z
  .object({
    investigationId: opaqueIdentifier,
    parentInvestigationId: opaqueIdentifier,
    permittedCustomerIds: z.array(z.string().min(1)),
    comparison: countryMrrComparisonSchema,
    evidence: z.array(investigationEvidenceSchema).min(3),
    sourceEvidenceIds: z.array(z.string().min(1)).length(3),
    limitations: z.array(z.string().min(1)),
  })
  .strict()
  .refine(
    (value) =>
      value.sourceEvidenceIds.every((id, index) =>
        value.evidence.some(
          (item) =>
            item.evidenceId === id &&
            item.type === (index === 2 ? 'calculation' : 'metric_query') &&
            item.integrity !== 'invalid',
        ),
      ) && new Set(value.sourceEvidenceIds).size === 3,
    'Country values require inspectable query and calculation evidence.',
  );
export const countryFollowUpResponseSchema = z
  .object({
    status: z.enum(['completed', 'blocked']),
    record: countryFollowUpRecordSchema,
    accessToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
    warnings: z.array(z.string().min(1)),
  })
  .strict();
export const countryFollowUpFailureSchema = z
  .object({
    status: z.enum([
      'invalid_request',
      'unsupported',
      'invalid_parent',
      'conflict',
    ]),
    error: z.string().min(1).optional(),
  })
  .strict();

export type CountryFollowUpRecord = z.infer<typeof countryFollowUpRecordSchema>;
export type CountryFollowUpAnswer = z.infer<typeof countryFollowUpAnswerSchema>;
export type CountryFollowUpPlan = z.infer<typeof countryFollowUpPlanSchema>;
