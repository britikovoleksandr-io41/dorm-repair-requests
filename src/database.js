import pg from 'pg';
import { AppError } from './errors.js';

export function createDatabase(connectionString, log) {
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }
  const pool = new pg.Pool({
    connectionString,
    connectionTimeoutMillis: 3000,
    statement_timeout: 5000,
    max: 10,
  });
  pool.on('error', (error) =>
    log('db.pool.error', { databaseCode: error.code }),
  );

  function reportFailure(error) {
    const code = error.code ?? '';
    if (
      /^(08|57P0[123]$)/.test(code) ||
      [
        '40001',
        '40P01',
        '53300',
        '57014',
        'ECONNREFUSED',
        'ECONNRESET',
        'ETIMEDOUT',
        'EPIPE',
        'ENOTFOUND',
        'EAI_AGAIN',
      ].includes(code) ||
      /timeout|connection terminated/i.test(error.message)
    ) {
      return new AppError(503, 'database_unavailable');
    }
    return error;
  }

  async function query(target, operation, sql, values = []) {
    log('db.query.start', { operation });
    const started = performance.now();
    try {
      const result = await target.query(sql, values);
      log('db.query.finish', {
        operation,
        rows: result.rowCount,
        durationMs: performance.now() - started,
      });
      return result;
    } catch (error) {
      log('db.query.error', {
        operation,
        databaseCode: error.code,
        durationMs: performance.now() - started,
      });
      throw reportFailure(error);
    }
  }

  return {
    query: (operation, sql, values) => query(pool, operation, sql, values),

    async transaction(work) {
      log('db.connect.start');
      let client;
      try {
        client = await pool.connect();
      } catch (error) {
        log('db.connect.error', { databaseCode: error.code });
        throw reportFailure(error);
      }
      log('db.connect.finish');
      const run = (operation, sql, values) =>
        query(client, operation, sql, values);
      let releaseError;
      try {
        await run('transaction.begin', 'BEGIN');
        const result = await work(run);
        await run('transaction.commit', 'COMMIT');
        return result;
      } catch (error) {
        try {
          await run('transaction.rollback', 'ROLLBACK');
        } catch (rollbackError) {
          releaseError = rollbackError;
        }
        throw error;
      } finally {
        client.release(releaseError);
      }
    },

    close: () => pool.end(),
  };
}
