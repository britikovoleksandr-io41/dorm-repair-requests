import type { QueueItem, QueueReader } from '@dorm/repair-queue';
import { requestColumns } from './postgres.js';

type QueueRow = Omit<QueueItem, 'createdAt'> & { createdAt: Date };

interface QueueDatabase {
  query(
    operation: string,
    sql: string,
    values: (string | number | null)[],
  ): Promise<{ rows: QueueRow[] }>;
}

export const queueSql = `SELECT ${requestColumns} FROM repair_requests
  WHERE ($1::text IS NULL OR resident_id = $1)
    AND ($2::text IS NULL OR status = $2)
    AND ($3::text IS NULL OR category = $3)
  ORDER BY created_at DESC, id DESC LIMIT $4 OFFSET $5`;

export function postgresQueueReader(db: QueueDatabase): QueueReader {
  return {
    async read({ ownerId, status, category, limit, offset }) {
      const { rows } = await db.query('requests.list', queueSql, [
        ownerId,
        status,
        category,
        limit,
        offset,
      ]);
      return rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      }));
    },
  };
}
