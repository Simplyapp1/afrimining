import 'dotenv/config';
import { readFileSync } from 'fs';
import { getPool } from '../src/db.js';

const schemaPath = new URL('user-page-roles.sql', import.meta.url);
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
console.log('User page roles schema applied.', run, 'batch(es) run.');
process.exit(0);
