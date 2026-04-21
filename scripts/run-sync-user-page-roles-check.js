import 'dotenv/config';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { getPool } from '../src/db.js';

const schemaPath = fileURLToPath(new URL('sync-user-page-roles-check-constraint.sql', import.meta.url));
const sql = readFileSync(schemaPath, 'utf8');
const batches = sql
  .split(/\bGO\b/i)
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && s.replace(/--[^\n]*/g, '').trim().length > 0);

const pool = await getPool();
for (const batch of batches) {
  await pool.request().query(batch);
}
await pool.close();
console.log('user_page_roles CHECK constraint synced (all page_id values).');
process.exit(0);
