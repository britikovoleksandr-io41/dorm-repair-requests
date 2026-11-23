import { AppError } from './errors.js';

export function nextStatus(action, request, actor, note) {
  if (actor.role !== 'technician') {
    throw new AppError(403, 'technician_required');
  }
  if (action === 'claim' && request.status === 'open') {
    return 'in_progress';
  }
  if (action === 'resolve' && request.status === 'in_progress') {
    if (request.assigneeId !== actor.id) {
      throw new AppError(403, 'assignee_required');
    }
    if (!note) {
      throw new AppError(400, 'repair_note_required');
    }
    return 'resolved';
  }
  throw new AppError(409, 'invalid_transition');
}
