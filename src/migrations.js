import { readFile, readdir } from 'node:fs/promises';

export async function migrate(db) {
  const directory = new URL('../migrations/', import.meta.url);
  const filenames = (await readdir(directory))
    .filter((name) => /^\d+-.*\.sql$/.test(name))
    .sort();
  await db.transaction(async (query) => {
    await query('migrations.lock', 'SELECT pg_advisory_xact_lock(119872156)');
    await query(
      'migrations.bookkeeping',
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    for (const name of filenames) {
      const applied = await query(
        'migrations.lookup',
        'SELECT 1 FROM schema_migrations WHERE name = $1',
        [name],
      );
      if (!applied.rowCount) {
        const sql = await readFile(new URL(name, directory), 'utf8');
        await query(`migrations.apply.${name}`, sql);
        await query(
          'migrations.record',
          'INSERT INTO schema_migrations (name) VALUES ($1)',
          [name],
        );
      }
    }
  });
}
