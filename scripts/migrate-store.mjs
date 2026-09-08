import postgres from 'postgres';
import { readFile } from 'node:fs/promises';

// Explicit input snapshot only. Never overwrite an existing database document.
if (!process.env.DATABASE_URL || !process.argv[2]) throw new Error('Usage: DATABASE_URL=... node scripts/migrate-store.mjs /path/to/backup.json');
const snapshot = JSON.parse(await readFile(process.argv[2], 'utf8'));
for (const key of ['users', 'accounts', 'runs', 'channels', 'posts', 'media', 'apiKeys']) {
  if (!Array.isArray(snapshot[key])) throw new Error(`Invalid snapshot: ${key}`);
}
const sql = postgres(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL, { max: 1 });
try {
  await sql.begin(async tx => {
    await tx`CREATE TABLE IF NOT EXISTS scrollshow_state (id integer PRIMARY KEY CHECK (id = 1), data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`;
    await tx`INSERT INTO scrollshow_state (id, data) VALUES (1, ${tx.json(snapshot)})`;
  });
  console.log('Snapshot imported transactionally. Existing data was not overwritten.');
} finally { await sql.end(); }
