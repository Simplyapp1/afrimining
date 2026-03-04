import 'dotenv/config';
import { readFileSync } from 'fs';
import { getPool } from '../src/db.js';

const schemaPath = new URL('contractor-schema-expand.sql', import.meta.url);
const sql = readFileSync(schemaPath, 'utf8');

const statements = sql
  .split(';')
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && !s.startsWith('--'));

const pool = await getPool();
for (const stmt of statements) {
  await pool.request().query(stmt);
}
await pool.close();
console.log('Contractor schema expanded.');
process.exit(0);
