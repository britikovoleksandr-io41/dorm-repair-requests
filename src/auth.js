import { createHash } from 'node:crypto';
import { AppError } from './errors.js';

const digest = (token) => createHash('sha256').update(token).digest('hex');

export function createAuthenticator(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('Configure at least one actor token');
  }
  const identities = new Map();
  for (const { token, id, role } of entries) {
    if (
      typeof token !== 'string' ||
      !/^[A-Za-z0-9_-]{24,256}$/.test(token) ||
      typeof id !== 'string' ||
      !/^[a-z0-9_-]{1,40}$/.test(id) ||
      !['resident', 'technician'].includes(role)
    ) {
      throw new Error('Invalid actor token configuration');
    }
    const key = digest(token);
    if (identities.has(key)) {
      throw new Error('Duplicate actor token');
    }
    identities.set(key, { id, role });
  }
  return (authorization) => {
    const match = /^Bearer ([A-Za-z0-9_-]{24,256})$/i.exec(authorization ?? '');
    const identity = match && identities.get(digest(match[1]));
    if (!identity) {
      throw new AppError(401, 'unauthorized');
    }
    return identity;
  };
}
