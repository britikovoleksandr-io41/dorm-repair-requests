const indexName = 'repair_requests_status_category_order';
const lockKey = 119872157;

export async function ensureQueueIndex(client) {
  // A session-scoped lock serializes retries without wrapping concurrent index DDL in a transaction.
  await client.query('SELECT pg_advisory_lock($1)', [lockKey]);
  try {
    const {
      rows: [stored],
    } = await client.query(
      'SELECT indisvalid FROM pg_index WHERE indexrelid = to_regclass($1)',
      [indexName],
    );
    if (stored?.indisvalid) {
      return 'index already valid';
    }
    if (stored) {
      await client.query(`DROP INDEX CONCURRENTLY ${indexName}`);
    }
    await client.query(`CREATE INDEX CONCURRENTLY ${indexName}
      ON repair_requests (status, category, created_at DESC, id DESC)`);
    return 'index created';
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [lockKey]);
  }
}
