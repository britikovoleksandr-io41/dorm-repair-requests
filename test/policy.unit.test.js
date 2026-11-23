import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextStatus } from '../src/policy.js';

const technician = { id: 'tech', role: 'technician' };
const resident = { id: 'resident', role: 'resident' };
const open = { status: 'open', assigneeId: null };
const active = { status: 'in_progress', assigneeId: technician.id };
const closed = { status: 'resolved', assigneeId: technician.id };

test('open requests can be claimed by a technician', () => {
  assert.equal(nextStatus('claim', open, technician), 'in_progress');
});

test('assigned technician resolves a request with a note', () => {
  assert.equal(
    nextStatus('resolve', active, technician, 'Repair complete'),
    'resolved',
  );
});

test('residents cannot claim a request', () => {
  assert.throws(() => nextStatus('claim', open, resident), {
    status: 403,
    code: 'technician_required',
  });
});

test('another technician cannot resolve an assigned request', () => {
  assert.throws(
    () =>
      nextStatus('resolve', active, { ...technician, id: 'other' }, 'Complete'),
    {
      status: 403,
      code: 'assignee_required',
    },
  );
});

for (const [action, request] of [
  ['claim', active],
  ['claim', closed],
  ['resolve', open],
  ['resolve', closed],
  ['reopen', active],
  ['reopen', open],
]) {
  test(`${action} cannot change a request in ${request.status}`, () => {
    assert.throws(() => nextStatus(action, request, technician, 'Complete'), {
      status: 409,
      code: 'invalid_transition',
    });
  });
}

test('assigned technician must include a repair note', () => {
  for (const note of [undefined, '']) {
    assert.throws(() => nextStatus('resolve', active, technician, note), {
      status: 400,
      code: 'repair_note_required',
    });
  }
});
