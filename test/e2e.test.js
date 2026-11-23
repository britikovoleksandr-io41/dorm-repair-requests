import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { actors } from './actors.js';
import { client, repairJourney } from './api-scenario.js';
import { prepareDatabase } from './database-fixture.js';
import { startChild } from './start-child.js';

test(
  'HTTP clients complete a repair, then read its persisted queue entry and history',
  { timeout: 15000 },
  async (t) => {
    await prepareDatabase(t);
    const { base } = await startChild(t);
    const call = client(base);
    const { id } = await repairJourney(call, randomUUID());
    const list = '/requests?status=resolved&category=plumbing';
    const find = (items) => items.some((item) => item.id === id);
    assert.ok(
      find((await call(200, list, { actor: actors.resident })).value.items),
    );
    assert.equal(
      find(
        (await call(200, list, { actor: actors.otherResident })).value.items,
      ),
      false,
    );
    const secondProcess = await startChild(t);
    const { value } = await client(secondProcess.base)(200, `/requests/${id}`, {
      actor: actors.technician,
    });
    assert.equal(value.status, 'resolved');
    assert.equal(value.history.length, 3);
  },
);
