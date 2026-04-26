import 'dotenv/config';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { getPool } from '../src/db.js';

const pool = await getPool();

for (const name of ['research-capture-schema.sql', 'add-research-page-role.sql']) {
  const schemaPath = fileURLToPath(new URL(name, import.meta.url));
  const sql = readFileSync(schemaPath, 'utf8');
  const batches = sql
    .split(/\bGO\b/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.replace(/--[^\n]*/g, '').trim().length > 0);
  for (const batch of batches) {
    await pool.request().query(batch);
  }
}

await pool.close();
console.log('Research capture schema and page role applied.');
process.exit(0);
