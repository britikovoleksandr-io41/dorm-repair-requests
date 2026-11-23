import pg from 'pg';
import { createDatabase } from '../dist/database.js';
import { migrate } from '../dist/migrations.js';
import { actors } from './actors.js';

export async function prepareDatabase(t) {
  const url = process.env.DATABASE_URL;
  const db = createDatabase(url, () => {});
  try {
    await migrate(db);
  } finally {
    await db.close();
  }
  const pool = new pg.Pool({
    connectionString: url,
    connectionTimeoutMillis: 2500,
  });
  t.after(() => pool.end());
  for (const { id, role } of Object.values(actors)) {
    await pool.query(
      'INSERT INTO users (id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [id, role],
    );
  }
  return pool;
}
