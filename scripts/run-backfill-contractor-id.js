import 'dotenv/config';
import { readFileSync } from 'fs';
import { getPool } from '../src/db.js';

const schemaPath = new URL('backfill-contractor-id.sql', import.meta.url);
const sql = readFileSync(schemaPath, 'utf8');

const batches = sql
  .split(/\bGO\b/i)
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && s.replace(/--[^\n]*/g, '').trim().length > 0);

const pool = await getPool();
let run = 0;
for (const batch of batches) {
  const result = await pool.request().query(batch);
  const rowsAffected = result.rowsAffected?.[0] ?? 0;
  console.log('Batch', run + 1, ':', rowsAffected, 'row(s) updated');
  run++;
}
await pool.close();
console.log('Backfill done.', run, 'batch(es) run.');
process.exit(0);
