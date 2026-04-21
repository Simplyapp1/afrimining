import 'dotenv/config';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { getPool } from '../src/db.js';

const schemaPath = new URL('work-schedule-time-columns.sql', import.meta.url);
const sql = readFileSync(schemaPath, 'utf8');
const pool = await getPool();
const batches = sql
  .split(/\bGO\b/i)
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && s.replace(/--[^\n]*/g, '').trim().length > 0);
for (const batch of batches) {
  await pool.request().query(batch);
}
await pool.close();
console.log('Work schedule time columns applied.');
process.exit(0);
