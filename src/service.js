import { initiator } from './context.js';
import { AppError } from './errors.js';
import { nextStatus } from './policy.js';

export function repairService(repository, log) {
  function visibleOwner(actor) {
    return actor.role === 'resident' ? actor.id : null;
  }

  return {
    async create(input) {
      const actor = initiator();
      log('request.create');
      if (actor.role !== 'resident') {
        throw new AppError(403, 'resident_required');
      }
      const result = await repository.create(actor.id, input);
      if (!result) {
        throw new AppError(409, 'idempotency_conflict');
      }
      log('request.created', {
        requestId: result.request.id,
        replayed: !result.created,
      });
      return result;
    },

    async list(filters) {
      log('queue.read');
      const items = await repository.list(visibleOwner(initiator()), filters);
      log('queue.read.done', { rows: items.length });
      return { items };
    },

    async detail(id) {
      log('history.read', { requestId: id });
      const request = await repository.detail(id, visibleOwner(initiator()));
      if (!request) {
        throw new AppError(404, 'request_not_found');
      }
      log('history.read.done', { events: request.history.length });
      return request;
    },

    async transition(id, action, note) {
      const actor = initiator();
      log('request.transition', { requestId: id, action });
      if (actor.role !== 'technician') {
        throw new AppError(403, 'technician_required');
      }
      const request = await repository.transition(
        id,
        actor.id,
        note,
        (current) => nextStatus(action, current, actor, note),
      );
      if (!request) {
        throw new AppError(404, 'request_not_found');
      }
      log('request.transition.done', { requestId: id, status: request.status });
      return request;
    },
  };
}
