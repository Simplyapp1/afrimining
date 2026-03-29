import 'dotenv/config';
import { readFileSync } from 'fs';
import { getPool } from '../src/db.js';

const schemaPath = new URL('truck-analysis-handovers.sql', import.meta.url);
const sqlText = readFileSync(schemaPath, 'utf8');

const batches = sqlText
  .split(/\bGO\b/i)
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && s.replace(/--[^\n]*/g, '').trim().length > 0);

const pool = await getPool();
for (const batch of batches) {
  await pool.request().query(batch);
}
await pool.close();
console.log('truck_analysis_handovers schema applied.');
process.exit(0);
