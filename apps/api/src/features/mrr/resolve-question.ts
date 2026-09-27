import { resolveQuestionResponseSchema } from '@executive-bi/schemas';

const months = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

/** A bounded grammar: unmatched wording must never silently lose a filter. */
export function resolveQuestion(question: string, now = new Date()) {
  const match =
    /^why (?:did|has) (?:mrr|monthly recurring revenue) (?:fall|fallen|drop|dropped|decline|declined|decrease|decreased) (?:in |for |during )?(last month|\d{4}-\d{2}|[a-z]+(?: \d{4})?)\s*[?.]?$/iu.exec(
      question.trim(),
    );
  if (!match)
    return resolveQuestionResponseSchema.parse({
      status: 'unsupported',
      message:
        'This version supports MRR-decline questions only. Try “Why did MRR fall in August 2026?” Select customer scope separately; other metrics, filters, comparisons and follow-ups are not supported.',
    });
  const period = match[1]!.toLowerCase();
  let month: string;
  if (period === 'last month') {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
    );
    month = date.toISOString().slice(0, 7) + '-01';
  } else if (/^\d{4}-\d{2}$/u.test(period)) {
    month = period + '-01';
  } else {
    const [name, year] = period.split(' ');
    const index = months.indexOf(name!);
    if (index < 0)
      return resolveQuestionResponseSchema.parse({
        status: 'clarification_required',
        message:
          'Which reporting month and year do you mean? Use August 2026 or 2026-08.',
      });
    if (!year)
      return resolveQuestionResponseSchema.parse({
        status: 'clarification_required',
        message: `Which year do you mean for ${name}? Include it in your question.`,
      });
    month = `${year}-${String(index + 1).padStart(2, '0')}-01`;
  }
  const result = resolveQuestionResponseSchema.safeParse({
    status: 'resolved',
    question: question.trim(),
    metric: 'mrr',
    month,
    comparison: 'previous_period',
    responseMode: 'investigation',
  });
  return result.success
    ? result.data
    : resolveQuestionResponseSchema.parse({
        status: 'clarification_required',
        message: 'Use a valid reporting month and year, for example 2026-08.',
      });
}
