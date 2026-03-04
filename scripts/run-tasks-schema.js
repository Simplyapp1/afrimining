import 'dotenv/config';
import { readFileSync } from 'fs';
import { getPool } from '../src/db.js';

const pool = await getPool();

const schemaPath = new URL('tasks-schema.sql', import.meta.url);
const sql = readFileSync(schemaPath, 'utf8');
const batches = sql
  .split(/\bGO\b/i)
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && s.replace(/--[^\n]*/g, '').trim().length > 0);
for (const batch of batches) {
  await pool.request().query(batch);
}

const pageRolePath = new URL('tasks-add-page-role.sql', import.meta.url);
const pageRoleSql = readFileSync(pageRolePath, 'utf8');
const pageRoleBatches = pageRoleSql
  .split(/\bGO\b/i)
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && s.replace(/--[^\n]*/g, '').trim().length > 0);
for (const batch of pageRoleBatches) {
  await pool.request().query(batch);
}

await pool.close();
console.log('Tasks schema and page role applied.');
process.exit(0);
