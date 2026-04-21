import 'dotenv/config';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { getPool } from '../src/db.js';

const schemaPath = fileURLToPath(new URL('tasks-tracker-expand.sql', import.meta.url));
const sql = readFileSync(schemaPath, 'utf8');
const batches = sql
  .split(/\bGO\b/i)
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && s.replace(/--[^\n]*/g, '').trim().length > 0);

const pool = await getPool();
let run = 0;
for (const batch of batches) {
  await pool.request().query(batch);
  run++;
}
await pool.close();
console.log('Tasks tracker schema expanded.', run, 'batch(es).');
process.exit(0);
