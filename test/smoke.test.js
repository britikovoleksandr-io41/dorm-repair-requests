import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { test } from 'node:test';

test(
  'built service answers GET /health and rejects unknown routes',
  { timeout: 5000 },
  async (t) => {
    const child = spawn(process.execPath, ['dist/main.js'], {
      env: { ...process.env, HOST: '127.0.0.1', PORT: '0' },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    const exited = once(child, 'exit');
    t.after(async () => {
      child.kill();
      await exited;
    });
    const lines = createInterface({ input: child.stdout });
    const [line] = await Promise.race([
      once(lines, 'line'),
      exited.then(([code]) => {
        throw new Error(`Service exited before listening (${code})`);
      }),
    ]);
    const { port } = JSON.parse(line);
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
    assert.equal((await fetch(`http://127.0.0.1:${port}/missing`)).status, 404);
  },
);
