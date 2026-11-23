import { randomUUID } from 'node:crypto';

const columns = `id, resident_id AS "residentId", assignee_id AS "assigneeId",
  location, category, description, status, created_at AS "createdAt"`;

export const queueSql = `SELECT ${columns} FROM repair_requests
  WHERE ($1::text IS NULL OR resident_id = $1)
    AND ($2::text IS NULL OR status = $2)
    AND ($3::text IS NULL OR category = $3)
  ORDER BY created_at DESC, id DESC LIMIT $4 OFFSET $5`;

async function appendEvent(
  query,
  { id, previousStatus, status, actorId, note },
) {
  await query(
    'events.append',
    `INSERT INTO request_events (request_id, previous_status, status, actor_id, note)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, previousStatus, status, actorId, note],
  );
}

export function postgresRepository(db) {
  return {
    create(residentId, { key, location, category, description }) {
      return db.transaction(async (query) => {
        const {
          rows: [request],
        } = await query(
          'requests.create',
          `INSERT INTO repair_requests (id, resident_id, idempotency_key, location, category, description)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (resident_id, idempotency_key) DO NOTHING RETURNING ${columns}`,
          [randomUUID(), residentId, key, location, category, description],
        );
        if (request) {
          await appendEvent(query, {
            id: request.id,
            previousStatus: null,
            status: request.status,
            actorId: residentId,
            note: null,
          });
          return { created: true, request };
        }
        const {
          rows: [existing],
        } = await query(
          'requests.replay',
          `SELECT ${columns} FROM repair_requests WHERE resident_id = $1 AND idempotency_key = $2`,
          [residentId, key],
        );
        if (
          existing.location !== location ||
          existing.category !== category ||
          existing.description !== description
        ) {
          return null;
        }
        return { created: false, request: existing };
      });
    },

    async list(residentId, { status, category, limit, offset }) {
      const { rows } = await db.query('requests.list', queueSql, [
        residentId,
        status,
        category,
        limit,
        offset,
      ]);
      return rows;
    },

    async detail(id, residentId) {
      const {
        rows: [request],
      } = await db.query(
        'requests.detail',
        `SELECT ${columns}, (
           SELECT COALESCE(json_agg(json_build_object(
             'previousStatus', previous_status, 'status', e.status,
             'actorId', actor_id, 'note', note,
             'at', to_char(at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
           ) ORDER BY e.id), '[]')
           FROM request_events e WHERE e.request_id = r.id
         ) AS history
         FROM repair_requests r WHERE r.id = $1 AND ($2::text IS NULL OR resident_id = $2)`,
        [id, residentId],
      );
      return request ?? null;
    },

    transition(id, actorId, note, decide) {
      return db.transaction(async (query) => {
        const {
          rows: [current],
        } = await query(
          'requests.lock',
          'SELECT status, assignee_id AS "assigneeId" FROM repair_requests WHERE id = $1 FOR UPDATE',
          [id],
        );
        if (!current) {
          return null;
        }
        const status = decide(current);
        const {
          rows: [request],
        } = await query(
          'requests.transition',
          `UPDATE repair_requests SET status = $2, assignee_id = $3
           WHERE id = $1 AND status = $4 RETURNING ${columns}`,
          [id, status, actorId, current.status],
        );
        await appendEvent(query, {
          id,
          previousStatus: current.status,
          status,
          actorId,
          note,
        });
        return request;
      });
    },
  };
}
