import { actors } from '../test/actors.js';

export const populatedRows = 120_000;
export const actionsPerRun = 120;
export const repetitions = 3;

export function fixtureId(tag, index) {
  return [tag, String(index).padStart(12, '0')].join('-');
}

export async function seed(database) {
  const {
    rows: [present],
  } = await database.query('SELECT EXISTS (SELECT 1 FROM users) AS present');
  if (present.present) {
    throw new Error('Benchmark requires a fresh database');
  }
  for (const { id, role } of Object.values(actors)) {
    await database.query('INSERT INTO users (id, role) VALUES ($1, $2)', [
      id,
      role,
    ]);
  }
  await database.query(`INSERT INTO users (id, role)
    SELECT 'bench-resident-' || i, 'resident' FROM generate_series(1, 63) AS i`);
  await database.query(
    `
    INSERT INTO repair_requests
      (id, resident_id, assignee_id, idempotency_key, location, category, description, status, created_at)
    SELECT md5('dorm-benchmark-' || i)::uuid,
           CASE WHEN i % 64 = 0 THEN 'resident-1' ELSE 'bench-resident-' || (i % 64) END,
           CASE WHEN i % 5 = 0 THEN 'tech-1' ELSE NULL END,
           'bench-' || i,
           'Корпус ' || ((i % 9) + 1),
           CASE WHEN i % 17 = 0 THEN 'plumbing'
                WHEN i % 3 = 0 THEN 'furniture' ELSE 'electrical' END,
           'Перевірити несправність ' || i,
           CASE WHEN i % 10 = 0 THEN 'resolved'
                WHEN i % 5 = 0 THEN 'in_progress' ELSE 'open' END,
           timestamptz '2026-01-01T00:00:00Z' + i * interval '1 second'
    FROM generate_series(1, $1::int) AS i
  `,
    [populatedRows],
  );
  await database.query(`
    INSERT INTO request_events (request_id, status, actor_id, at)
    SELECT id, 'open', resident_id, created_at FROM repair_requests
  `);
  await database.query(`
    INSERT INTO request_events (request_id, previous_status, status, actor_id, at)
    SELECT id, 'open', 'in_progress', 'tech-1', created_at + interval '1 hour'
    FROM repair_requests WHERE status IN ('in_progress', 'resolved')
  `);
  await database.query(`
    INSERT INTO request_events (request_id, previous_status, status, actor_id, note, at)
    SELECT id, 'in_progress', 'resolved', 'tech-1', 'Виконано', created_at + interval '2 hours'
    FROM repair_requests WHERE status = 'resolved'
  `);
  await database.query(
    `
    WITH actions AS (
      INSERT INTO repair_requests (id, resident_id, idempotency_key, location, category, description, created_at)
      SELECT ('aa9b7a92-7711-45cc-8e7b-' || lpad(i::text, 12, '0'))::uuid, 'resident-1',
        'action-' || i, 'Поверх 2', 'electrical', 'Перевірити світло',
        timestamptz '2026-01-03T00:00:00Z' + i * interval '1 second'
      FROM generate_series(1, $1::int) AS i
      RETURNING id, resident_id, created_at
    )
    INSERT INTO request_events (request_id, status, actor_id, at)
    SELECT id, 'open', resident_id, created_at FROM actions
  `,
    [actionsPerRun * repetitions],
  );
  await database.query('ANALYZE repair_requests; ANALYZE request_events');
  const {
    rows: [counts],
  } = await database.query(`SELECT
    (SELECT count(*)::int FROM repair_requests) AS requests,
    (SELECT count(*)::int FROM request_events) AS events,
    (SELECT count(*)::int FROM repair_requests WHERE status = 'open' AND category = 'plumbing') AS filtered,
    (SELECT count(*)::int FROM repair_requests WHERE resident_id = 'resident-1' AND status = 'open' AND category = 'plumbing') AS "residentFiltered",
    version() AS postgres`);
  return counts;
}
