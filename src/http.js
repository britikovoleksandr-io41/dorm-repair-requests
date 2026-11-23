import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { withRequestContext } from './context.js';
import { AppError } from './errors.js';
import { creation, queueFilters, readObject, repairNote } from './input.js';

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

export function createHttpServer({
  authenticate,
  service,
  log,
  ready,
  version,
}) {
  async function dispatch(req, res, url) {
    if (req.method === 'GET' && url.pathname === '/health') {
      return send(res, 200, { status: 'ok' });
    }
    if (req.method === 'GET' && url.pathname === '/ready') {
      await ready();
      return send(res, 200, { status: 'ready' });
    }
    if (req.method === 'GET' && url.pathname === '/version') {
      return send(res, 200, { sha: version });
    }
    if (url.pathname === '/requests' && req.method === 'POST') {
      const input = creation(
        await readObject(req),
        req.headers['idempotency-key'],
      );
      const result = await service.create(input);
      return send(res, result.created ? 201 : 200, result.request);
    }
    if (url.pathname === '/requests' && req.method === 'GET') {
      return send(res, 200, await service.list(queueFilters(url.searchParams)));
    }
    const path =
      /^\/requests\/([0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12})(?:\/(claim|resolve))?$/.exec(
        url.pathname,
      );
    if (path) {
      const [, id, action] = path;
      if (req.method === 'GET' && !action) {
        return send(res, 200, await service.detail(id.toLowerCase()));
      }
      if (req.method === 'POST' && action) {
        const note =
          action === 'resolve' ? repairNote(await readObject(req)) : null;
        return send(
          res,
          200,
          await service.transition(id.toLowerCase(), action, note),
        );
      }
    } else if (url.pathname.startsWith('/requests/')) {
      throw new AppError(400, 'invalid_request_path');
    }
    throw new AppError(404, 'not_found');
  }

  return createServer((req, res) => {
    const context = { businessProcessId: randomUUID(), initiator: null };
    res.setHeader('X-Business-Process-Id', context.businessProcessId);
    return withRequestContext(context, async () => {
      const started = performance.now();
      try {
        const url = new URL(req.url, 'http://localhost');
        if (
          url.pathname === '/requests' ||
          url.pathname.startsWith('/requests/')
        ) {
          context.initiator = authenticate(req.headers.authorization);
        }
        log('http.start', { method: req.method });
        await dispatch(req, res, url);
      } catch (error) {
        const known = error instanceof AppError;
        const code = known ? error.code : 'internal_error';
        log('http.error', { code, cause: known ? undefined : error.name });
        if (!res.headersSent) {
          if (known && error.status === 401) {
            res.setHeader('WWW-Authenticate', 'Bearer');
          }
          send(res, known ? error.status : 500, { error: code });
        } else {
          res.destroy();
        }
      } finally {
        log('http.finish', {
          status: res.statusCode,
          durationMs: performance.now() - started,
        });
      }
    });
  });
}
