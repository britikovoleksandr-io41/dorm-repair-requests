import { AppError } from './errors.js';

const categories = ['plumbing', 'electrical', 'furniture', 'other'];
const statuses = ['open', 'in_progress', 'resolved'];

function text(input, name, max) {
  const value = typeof input[name] === 'string' ? input[name].trim() : '';
  if (
    !value ||
    value.length > max ||
    value.includes('\0') ||
    !value.isWellFormed()
  ) {
    throw new AppError(400, `invalid_${name}`);
  }
  return value;
}

export async function readObject(req) {
  if (
    !/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')
  ) {
    throw new AppError(415, 'json_required');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > 16_384) {
      req.resume();
      throw new AppError(413, 'body_too_large');
    }
    chunks.push(chunk);
  }
  let value;
  try {
    value = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)),
    );
  } catch {
    throw new AppError(400, 'invalid_json');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError(400, 'invalid_body');
  }
  return value;
}

export function creation(input, key) {
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(key)) {
    throw new AppError(400, 'invalid_idempotency_key');
  }
  const category = text(input, 'category', 20);
  if (!categories.includes(category)) {
    throw new AppError(400, 'invalid_category');
  }
  return {
    key,
    location: text(input, 'location', 120),
    category,
    description: text(input, 'description', 1200),
  };
}

export function repairNote(input) {
  return text(input, 'note', 600);
}

export function queueFilters(params) {
  const status = params.get('status');
  const category = params.get('category');
  const rawLimit = params.get('limit') ?? '20';
  const rawOffset = params.get('offset') ?? '0';
  const limit = Number(rawLimit);
  const offset = Number(rawOffset);
  if (status !== null && !statuses.includes(status)) {
    throw new AppError(400, 'invalid_status');
  }
  if (category !== null && !categories.includes(category)) {
    throw new AppError(400, 'invalid_category');
  }
  if (!/^\d+$/.test(rawLimit) || limit < 1 || limit > 100) {
    throw new AppError(400, 'invalid_limit');
  }
  if (!/^\d+$/.test(rawOffset) || offset > 100_000) {
    throw new AppError(400, 'invalid_offset');
  }
  return { status, category, limit, offset };
}
