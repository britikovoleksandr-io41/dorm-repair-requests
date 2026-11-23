import { createAuthenticator } from './auth.js';
import { makeLogger } from './context.js';
import { createHttpServer } from './http.js';
import { memoryRepository } from './memory.js';
import { repairService } from './service.js';

const log = makeLogger();
const actors = JSON.parse(process.env.ACTOR_TOKENS ?? '[]');
const authenticate = createAuthenticator(actors);
const service = repairService(memoryRepository(log), log);
const server = createHttpServer({ authenticate, service, log });

server.listen(
  Number(process.env.PORT ?? 3000),
  process.env.HOST ?? '127.0.0.1',
  () => log('server.listening', { port: server.address().port }),
);
