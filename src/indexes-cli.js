import pg from 'pg';
import { ensureQueueIndex } from './queue-index.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');
const client = new pg.Client({
  connectionString,
  connectionTimeoutMillis: 3000,
});
try {
  await client.connect();
  console.log(await ensureQueueIndex(client));
} finally {
  await client.end();
}
