import type { Pool } from 'pg';

import type {
  InvestigationEvidence,
  InvestigationPlan,
  InvestigationRecord,
  InvestigationStore,
  StoredInvestigation,
} from '@executive-bi/investigations';
import {
  investigationEvidenceSchema,
  mrrDeclineRecordSchema,
} from '@executive-bi/schemas';

/** The app's write boundary never queries analytics tables or accepts SQL text. */
export class PostgresInvestigationStore implements InvestigationStore {
  constructor(private readonly pool: Pick<Pool, 'query'>) {}

  async reserve(
    plan: InvestigationPlan,
    accessTokenHash: string,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `INSERT INTO app.investigations (investigation_id, plan, access_token_hash)
       VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (investigation_id) DO NOTHING`,
      [plan.investigationId, JSON.stringify(plan), accessTokenHash],
    );
    return result.rowCount === 1;
  }

  async finalize(
    investigationId: string,
    record: InvestigationRecord,
    evidence: readonly InvestigationEvidence[],
  ): Promise<void> {
    if (
      record.investigationId !== investigationId ||
      !evidence.every(
        (item, index) => item.evidenceId === record.evidenceIds[index],
      ) ||
      evidence.length !== record.evidenceIds.length
    ) {
      throw new Error('Investigation evidence does not match its record.');
    }
    const result = await this.pool.query(
      `UPDATE app.investigations
       SET record = $2::jsonb, evidence = $3::jsonb, finalized_at = now()
       WHERE investigation_id = $1 AND record IS NULL`,
      [investigationId, JSON.stringify(record), JSON.stringify(evidence)],
    );
    if (result.rowCount !== 1)
      throw new Error('Investigation cannot be finalized.');
  }

  async get(investigationId: string): Promise<StoredInvestigation | undefined> {
    const result = await this.pool.query(
      `SELECT plan, access_token_hash, record, evidence
       FROM app.investigations WHERE investigation_id = $1`,
      [investigationId],
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) return undefined;
    const plan = row.plan as InvestigationPlan;
    const record =
      row.record === null
        ? undefined
        : mrrDeclineRecordSchema.parse(row.record);
    const evidence = investigationEvidenceSchema.array().parse(row.evidence);
    return {
      plan,
      accessTokenHash: String(row.access_token_hash),
      ...(record === undefined ? {} : { record }),
      evidence,
    };
  }
}
