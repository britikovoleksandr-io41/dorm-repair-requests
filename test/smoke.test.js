import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createHttpServer } from '../dist/http.js';

test(
  'built HTTP server answers GET /health and rejects unknown routes',
  { timeout: 5000 },
  async (t) => {
    const server = createHttpServer({ log: () => {} });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${base}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
    assert.equal((await fetch(`${base}/missing`)).status, 404);
  },
);
