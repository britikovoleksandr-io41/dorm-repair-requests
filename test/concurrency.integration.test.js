import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { actors } from './actors.js';
import { client } from './api-scenario.js';
import { prepareDatabase } from './database-fixture.js';
import { startChild } from './start-child.js';

test(
  'both concurrent claims reach PostgreSQL before release and only one event is written',
  { timeout: 12000 },
  async (t) => {
    const pool = await prepareDatabase(t);
    const { base } = await startChild(t);
    const { resident, technician, otherTech } = actors;
    const {
      value: { id },
    } = await client(base)(201, '/requests', {
      method: 'POST',
      actor: resident,
      key: randomUUID(),
      body: {
        location: 'Підвал',
        category: 'electrical',
        description: 'Світло не працює',
      },
    });

    const blocker = await pool.connect();
    await blocker.query('BEGIN');
    await blocker.query(
      'SELECT id FROM repair_requests WHERE id = $1 FOR UPDATE',
      [id],
    );
    const claims = Promise.all(
      [technician, otherTech].map((actor) =>
        fetch(`${base}/requests/${id}/claim`, {
          method: 'POST',
          headers: { authorization: `Bearer ${actor.token}` },
        }),
      ),
    );
    try {
      const deadline = Date.now() + 3000;
      let waiting = 0;
      while (Date.now() < deadline && waiting < 2) {
        const result = await pool.query(`SELECT count(*)::int AS waiting
        FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'
          AND query LIKE '%repair_requests WHERE id = $1 FOR UPDATE'`);
        waiting = result.rows[0].waiting;
        if (waiting < 2) await delay(20);
      }
      assert.equal(waiting, 2);
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
    }

    const responses = await claims;
    assert.deepEqual(
      responses.map((response) => response.status).sort(),
      [200, 409],
    );
    const winner = responses[0].status === 200 ? technician : otherTech;
    const { value } = await client(base)(200, `/requests/${id}`, {
      actor: resident,
    });
    assert.equal(value.assigneeId, winner.id);
    assert.equal(value.status, 'in_progress');
    assert.deepEqual(
      value.history.map((entry) => entry.actorId),
      [resident.id, winner.id],
    );
  },
);
