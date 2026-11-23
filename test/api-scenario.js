import assert from 'node:assert/strict';
import { actors } from './actors.js';

export function client(base) {
  return async (expected, path, { actor, body, key, method = 'GET' } = {}) => {
    const headers = {};
    if (actor) headers.authorization = `Bearer ${actor.token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (key) headers['idempotency-key'] = key;
    const response = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const value = await response.json();
    assert.equal(response.status, expected, JSON.stringify(value));
    return { value, processId: response.headers.get('x-business-process-id') };
  };
}

export async function repairJourney(call, key) {
  const { resident, otherResident, technician, otherTech } = actors;
  const body = {
    location: 'Кухня, 2 поверх',
    category: 'plumbing',
    description: 'Тече кран',
  };
  const creation = { method: 'POST', actor: resident, key, body };
  const { value: original, processId } = await call(201, '/requests', creation);
  const { id } = original;
  assert.equal(original.status, 'open');
  assert.equal((await call(200, '/requests', creation)).value.id, id);
  await call(409, '/requests', {
    ...creation,
    body: { ...body, location: 'Підвал' },
  });
  await call(404, `/requests/${id}`, { actor: otherResident });
  const { items } = (
    await call(200, '/requests?status=open&category=plumbing', {
      actor: technician,
    })
  ).value;
  assert.ok(items.some((item) => item.id === id));
  await call(403, `/requests/${id}/claim`, { method: 'POST', actor: resident });
  const claim = { method: 'POST', actor: technician };
  assert.equal(
    (await call(200, `/requests/${id}/claim`, claim)).value.assigneeId,
    technician.id,
  );
  await call(409, `/requests/${id}/claim`, { ...claim, actor: otherTech });
  const close = { ...claim, body: { note: 'Замінено прокладку' } };
  await call(403, `/requests/${id}/resolve`, { ...close, actor: otherTech });
  assert.equal(
    (await call(200, `/requests/${id}/resolve`, close)).value.status,
    'resolved',
  );
  const { history } = (await call(200, `/requests/${id}`, { actor: resident }))
    .value;
  assert.deepEqual(
    history.map(({ previousStatus, status, actorId, note }) => [
      previousStatus,
      status,
      actorId,
      note,
    ]),
    [
      [null, 'open', resident.id, null],
      ['open', 'in_progress', technician.id, null],
      ['in_progress', 'resolved', technician.id, close.body.note],
    ],
  );
  return { id, processId };
}
