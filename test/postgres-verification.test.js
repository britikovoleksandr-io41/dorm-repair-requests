import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { actors } from './actors.js';
import { client, repairJourney } from './api-scenario.js';
import { prepareDatabase } from './database-fixture.js';
import { startChild } from './start-child.js';

test(
  'PostgreSQL API works, correlates SQL results, survives lost source',
  { timeout: 20000 },
  async (t) => {
    const pool = await prepareDatabase(t);
    const { base, records } = await startChild(t);
    const call = client(base);
    const { resident, technician, otherTech } = actors;
    const journey = await repairJourney(call, randomUUID());
    const body = {
      location: 'Підвал',
      category: 'plumbing',
      description: 'Розхитана труба',
    };
    const create = { method: 'POST', actor: resident, key: randomUUID(), body };
    const bad = await call(400, '/requests', {
      ...create,
      body: { ...body, description: ' ' },
    });
    assert.equal(bad.value.error, 'invalid_description');

    const creation = await Promise.all(
      [201, 200].map(async () => {
        const response = await fetch(`${base}/requests`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${resident.token}`,
            'content-type': 'application/json',
            'idempotency-key': create.key,
          },
          body: JSON.stringify(body),
        });
        return { status: response.status, request: await response.json() };
      }),
    );
    assert.deepEqual(creation.map(({ status }) => status).sort(), [200, 201]);
    const id = creation[0].request.id;
    assert.ok(id);
    assert.equal(creation[1].request.id, id);

    const claims = await Promise.all(
      [technician, otherTech].map((actor) =>
        fetch(`${base}/requests/${id}/claim`, {
          method: 'POST',
          headers: { authorization: `Bearer ${actor.token}` },
        }),
      ),
    );
    assert.deepEqual(claims.map(({ status }) => status).sort(), [200, 409]);
    const winner = claims[0].status === 200 ? technician : otherTech;
    await pool.query(`
    CREATE FUNCTION test_reject_note() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.note = 'forbidden_test_note' THEN RAISE EXCEPTION 'injected event failure'; END IF;
      RETURN NEW;
    END
    $$;
    CREATE TRIGGER test_reject_note BEFORE INSERT ON request_events
      FOR EACH ROW EXECUTE FUNCTION test_reject_note();
  `);
    try {
      await call(500, `/requests/${id}/resolve`, {
        method: 'POST',
        actor: winner,
        body: { note: 'forbidden_test_note' },
      });
      const { value } = await call(200, `/requests/${id}`, { actor: resident });
      assert.equal(value.status, 'in_progress');
      assert.equal(value.history.length, 2);
      assert.equal(value.history[1].actorId, winner.id);
    } finally {
      await pool.query(
        'DROP TRIGGER test_reject_note ON request_events; DROP FUNCTION test_reject_note()',
      );
    }

    const queue = await call(200, '/requests?limit=20', { actor: technician });
    for (
      let attempt = 0;
      attempt < 50 &&
      !records.some(
        (row) =>
          row.businessProcessId === queue.processId &&
          row.event === 'http.finish',
      );
      attempt++
    ) {
      await delay(10);
    }
    const requestRecords = records.filter(
      (entry) => entry.businessProcessId === journey.processId,
    );
    assert.ok(requestRecords.length > 8);
    for (const record of requestRecords) {
      assert.deepEqual(record.initiator, {
        id: resident.id,
        role: resident.role,
      });
    }
    assert.ok(
      requestRecords.some(
        (row) =>
          row.event === 'db.query.finish' &&
          row.operation === 'events.append' &&
          row.rows === 1,
      ),
    );
    assert.ok(
      records.some(
        (row) =>
          row.event === 'db.query.finish' &&
          row.operation === 'transaction.rollback',
      ),
    );
    const queueQueries = records.filter(
      (row) =>
        row.businessProcessId === queue.processId &&
        row.event === 'db.query.finish',
    );
    assert.deepEqual(
      queueQueries.map((row) => row.operation),
      ['requests.list'],
    );

    // Hold an exclusive lock long enough to go through PostgreSQL's real statement timeout.
    const locked = await pool.connect();
    try {
      await locked.query(
        'BEGIN; LOCK TABLE repair_requests IN ACCESS EXCLUSIVE MODE',
      );
      const failure = await call(503, '/requests', { actor: technician });
      assert.equal(failure.value.error, 'database_unavailable');
    } finally {
      await locked.query('ROLLBACK');
      locked.release();
    }
    assert.ok(
      (await call(200, '/requests', { actor: technician })).value.items
        .length >= 2,
    );
  },
);
