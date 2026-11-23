import { randomUUID } from 'node:crypto';

const sample = {
  id: '978ab589-526c-43a8-b458-b1ac8fd80001',
  residentId: 'resident-1',
  assigneeId: null,
  location: 'Спільна кухня',
  category: 'plumbing',
  description: 'Протікає кран',
  status: 'open',
  createdAt: '2026-01-01T00:00:00.000Z',
};

function event(previousStatus, status, actorId, note) {
  return {
    previousStatus,
    status,
    actorId,
    note,
    at: new Date().toISOString(),
  };
}

export function memoryRepository(log) {
  const requests = new Map([[sample.id, sample]]);
  const histories = new Map([
    [
      sample.id,
      [
        {
          ...event(null, 'open', sample.residentId, null),
          at: sample.createdAt,
        },
      ],
    ],
  ]);
  const keys = new Map();

  function operation(name, callback) {
    log('store.start', { operation: name });
    try {
      const result = callback();
      log('store.finish', { operation: name, found: Boolean(result) });
      return result;
    } catch (error) {
      log('store.error', { operation: name, code: error.code });
      throw error;
    }
  }

  return {
    create(residentId, { key, location, category, description }) {
      return operation('create', () => {
        const scope = `${residentId}:${key}`;
        const existing = requests.get(keys.get(scope));
        if (existing) {
          return existing.location === location &&
            existing.category === category &&
            existing.description === description
            ? { created: false, request: existing }
            : null;
        }
        const first = event(null, 'open', residentId, null);
        const request = {
          id: randomUUID(),
          residentId,
          assigneeId: null,
          location,
          category,
          description,
          status: 'open',
          createdAt: first.at,
        };
        requests.set(request.id, request);
        histories.set(request.id, [first]);
        keys.set(scope, request.id);
        return { created: true, request };
      });
    },

    list(residentId, { status, category, limit, offset }) {
      return operation('list', () =>
        [...requests.values()]
          .filter(
            (item) =>
              (!residentId || item.residentId === residentId) &&
              (!status || item.status === status) &&
              (!category || item.category === category),
          )
          .sort(
            (a, b) =>
              b.createdAt.localeCompare(a.createdAt) ||
              b.id.localeCompare(a.id),
          )
          .slice(offset, offset + limit),
      );
    },

    detail(id, residentId) {
      return operation('detail', () => {
        const request = requests.get(id);
        return request && (!residentId || request.residentId === residentId)
          ? { ...request, history: histories.get(id) }
          : null;
      });
    },

    transition(id, actorId, note, decide) {
      return operation('transition', () => {
        const current = requests.get(id);
        if (!current) {
          return null;
        }
        const status = decide(current);
        const request = { ...current, assigneeId: actorId, status };
        const history = [
          ...histories.get(id),
          event(current.status, status, actorId, note),
        ];
        requests.set(id, request);
        histories.set(id, history);
        return request;
      });
    },
  };
}
