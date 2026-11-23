import { makeLogger } from './context.js';
import { createDatabase } from './database.js';
import { migrate } from './migrations.js';

const db = createDatabase(process.env.DATABASE_URL, makeLogger());
try {
  await migrate(db);
} finally {
  await db.close();
}
