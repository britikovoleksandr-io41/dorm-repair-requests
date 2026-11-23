import { createRepairQueue } from '@dorm/repair-queue';
import { createAuthenticator } from './auth.js';
import { makeLogger } from './context.js';
import { createDatabase } from './database.js';
import { createHttpServer } from './http.js';
import { migrate } from './migrations.js';
import { postgresQueueReader } from './postgres-queue.js';
import { postgresRepository } from './postgres.js';
import { repairService } from './service.js';

const log = makeLogger();
const actors = JSON.parse(process.env.ACTOR_TOKENS ?? '[]');
const authenticate = createAuthenticator(actors);
const db = createDatabase(process.env.DATABASE_URL, log);
try {
  await db.query('startup.ping', 'SELECT now()');
  if (process.env.AUTO_MIGRATE === '1') {
    await migrate(db);
  }
  const { rows } = await db.query(
    'startup.actors',
    'SELECT id, role FROM users WHERE id = ANY($1)',
    [actors.map(({ id }) => id)],
  );
  const roles = new Map(rows.map(({ id, role }) => [id, role]));
  if (actors.some(({ id, role }) => roles.get(id) !== role)) {
    throw new Error('Actor configuration does not match database users');
  }
} catch (error) {
  await db.close();
  throw error;
}

const queue = createRepairQueue(postgresQueueReader(db));
const service = repairService({
  repository: postgresRepository(db),
  queue,
  log,
});
const server = createHttpServer({
  authenticate,
  service,
  log,
  version: process.env.APP_SHA ?? 'local',
  ready: () => db.query('readiness.ping', 'SELECT 1'),
});
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => server.close(() => void db.close()));
}
server.listen(
  Number(process.env.PORT ?? 3000),
  process.env.HOST ?? '127.0.0.1',
  () => log('server.listening', { port: server.address().port }),
);
