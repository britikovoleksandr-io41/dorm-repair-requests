import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { actors } from '../test/actors.js';
import { client } from '../test/api-scenario.js';
import { prepareDatabase } from '../test/database-fixture.js';
import { startChild } from '../test/start-child.js';

test('replacement process reads a new token configuration', async (t) => {
  await prepareDatabase(t);
  const first = client((await startChild(t)).base);
  const { technician } = actors;
  const rotated = { ...technician, token: randomUUID() };

  await first(200, '/requests', { actor: technician });
  await first(401, '/requests', { actor: rotated });

  const configuration = { ...actors, technician: rotated };
  const second = client(
    (
      await startChild(t, {
        ACTOR_TOKENS: JSON.stringify(Object.values(configuration)),
      })
    ).base,
  );
  await second(200, '/requests', { actor: rotated });
  await second(401, '/requests', { actor: technician });
  await first(200, '/requests', { actor: technician });
});

test('inserting a newer item shifts an OFFSET page', async (t) => {
  await prepareDatabase(t);
  const call = client((await startChild(t)).base);
  const { resident } = actors;
  async function create(description) {
    const result = await call(201, '/requests', {
      method: 'POST',
      actor: resident,
      key: randomUUID(),
      body: { location: 'Кухня', category: 'plumbing', description },
    });
    return result.value.id;
  }

  await create('Перша заявка');
  const firstPage = await create('Друга заявка');
  const { value } = await call(200, '/requests?limit=1', { actor: resident });
  assert.equal(value.items[0].id, firstPage);

  const newest = await create('Третя заявка');
  const next = await call(200, '/requests?limit=1&offset=1', {
    actor: resident,
  });
  assert.equal(next.value.items[0].id, firstPage);
  assert.notEqual(next.value.items[0].id, newest);
});
