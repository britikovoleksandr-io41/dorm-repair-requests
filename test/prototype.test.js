import assert from 'node:assert/strict';
import { test } from 'node:test';
import { client, repairJourney } from './api-scenario.js';
import { actors } from './actors.js';
import { startChild } from './start-child.js';

test(
  'static fixture and all five API routes work without a database',
  { timeout: 5000 },
  async (t) => {
    const { base } = await startChild(t);
    const call = client(base);
    const sample = '978ab589-526c-43a8-b458-b1ac8fd80001';
    const { value } = await call(200, `/requests/${sample}`, {
      actor: actors.resident,
    });
    assert.equal(value.description, 'Протікає кран');
    await repairJourney(call, 'prototype');
  },
);
