import {
  randomBytes,
  scrypt as scryptCallback,
  createHash,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import type { Pool } from 'pg';

const scrypt = promisify(scryptCallback);
export type UserAccess = {
  userId: string;
  role: 'admin' | 'restricted';
  customerIds: string[];
  active: boolean;
};
export interface AccessStore {
  credentials(
    username: string,
  ): Promise<{ userId: string; passwordHash: string } | undefined>;
  user(userId: string): Promise<UserAccess | undefined>;
  saveSession(hash: string, userId: string, expiresAt: Date): Promise<void>;
  sessionUser(hash: string): Promise<string | undefined>;
  owner(investigationId: string): Promise<string | undefined>;
  bind(investigationId: string, userId: string): Promise<void>;
}
export const tokenHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [salt, hex] = stored.split(':');
  if (
    !salt ||
    !hex ||
    !/^[0-9a-f]{32}$/u.test(salt) ||
    !/^[0-9a-f]{128}$/u.test(hex)
  )
    return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  return timingSafeEqual(actual, Buffer.from(hex, 'hex'));
}
export class PostgresAccessStore implements AccessStore {
  constructor(private readonly pool: Pick<Pool, 'query'>) {}
  async credentials(username: string) {
    const result = await this.pool.query(
      'SELECT user_id, password_hash FROM app.users WHERE username = $1',
      [username],
    );
    const row = result.rows[0];
    return row
      ? { userId: String(row.user_id), passwordHash: String(row.password_hash) }
      : undefined;
  }
  async user(userId: string): Promise<UserAccess | undefined> {
    const result = await this.pool.query(
      `SELECT u.user_id, u.role, u.active, COALESCE(array_agg(s.customer_id ORDER BY s.customer_id) FILTER (WHERE s.customer_id IS NOT NULL), '{}') AS customer_ids
      FROM app.users u LEFT JOIN app.user_customer_scopes s ON s.user_id = u.user_id
      WHERE u.user_id = $1 GROUP BY u.user_id`,
      [userId],
    );
    const row = result.rows[0];
    return row
      ? {
          userId: String(row.user_id),
          role: row.role,
          active: Boolean(row.active),
          customerIds: row.customer_ids,
        }
      : undefined;
  }
  async saveSession(hash: string, userId: string, expiresAt: Date) {
    await this.pool.query(
      'INSERT INTO app.sessions (token_hash, user_id, expires_at) VALUES ($1,$2,$3)',
      [hash, userId, expiresAt],
    );
  }
  async sessionUser(hash: string): Promise<string | undefined> {
    const result = await this.pool.query(
      'SELECT user_id FROM app.sessions WHERE token_hash = $1 AND expires_at > now()',
      [hash],
    );
    return result.rows[0]?.user_id;
  }
  async owner(investigationId: string): Promise<string | undefined> {
    const result = await this.pool.query(
      'SELECT user_id FROM app.investigation_owners WHERE investigation_id = $1',
      [investigationId],
    );
    return result.rows[0]?.user_id;
  }
  async bind(investigationId: string, userId: string): Promise<void> {
    await this.pool.query(
      'INSERT INTO app.investigation_owners (investigation_id, user_id) VALUES ($1,$2)',
      [investigationId, userId],
    );
  }
}
export function resolveScope(
  user: UserAccess,
  requested?: readonly string[],
): string[] | undefined {
  if (!user.active) return undefined;
  if (user.role === 'admin') return requested ? [...requested] : [];
  if (!user.customerIds.length) return undefined;
  if (requested?.some((id) => !user.customerIds.includes(id))) return undefined;
  return requested ? [...requested] : [...user.customerIds];
}
export function permitsRecord(
  user: UserAccess,
  customerIds: readonly string[],
): boolean {
  return (
    user.active &&
    (user.role === 'admin' ||
      (customerIds.length > 0 &&
        customerIds.every((id) => user.customerIds.includes(id))))
  );
}
