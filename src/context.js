import { AsyncLocalStorage } from 'node:async_hooks';

const requestContext = new AsyncLocalStorage();

export function withRequestContext(context, callback) {
  return requestContext.run(context, callback);
}

export function initiator() {
  return requestContext.getStore().initiator;
}

export function makeLogger(
  write = (record) => console.log(JSON.stringify(record)),
) {
  return (event, data = {}) => {
    const context = requestContext.getStore();
    write({
      ...data,
      event,
      businessProcessId: context?.businessProcessId ?? null,
      initiator: context?.initiator ?? null,
    });
  };
}
