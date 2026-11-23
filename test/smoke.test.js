import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startChild } from './start-child.js';

test(
  'built service answers GET /health and rejects unknown routes',
  { timeout: 5000 },
  async (t) => {
    const { base } = await startChild(t);
    const response = await fetch(`${base}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
    assert.equal((await fetch(`${base}/missing`)).status, 404);
  },
);
