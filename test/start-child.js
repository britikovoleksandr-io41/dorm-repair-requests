import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { actors } from './actors.js';

export async function startChild(t, env = {}) {
  const child = spawn(process.execPath, ['dist/main.js'], {
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: '0',
      ACTOR_TOKENS: JSON.stringify(Object.values(actors)),
      ...env,
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const exited = once(child, 'exit');
  t.after(async () => {
    child.kill();
    await exited;
  });
  const records = [];
  const lines = createInterface({ input: child.stdout });
  const listening = new Promise((resolve) => {
    lines.on('line', (line) => {
      const record = JSON.parse(line);
      records.push(record);
      if (record.event === 'server.listening') {
        resolve(record.port);
      }
    });
  });
  const port = await Promise.race([
    listening,
    exited.then(([code]) => {
      throw new Error(`Service exited before listening (${code})`);
    }),
  ]);
  return { base: `http://127.0.0.1:${port}`, records };
}
