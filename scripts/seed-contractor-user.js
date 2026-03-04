/**
 * Add a contractor user linked to the first tenant so the Contractor page shows data.
 * Run: node scripts/seed-contractor-user.js
 * Then log in as contractor@thinkers.africa / Admin123! to see the Contractor page.
 */
import 'dotenv/config';
import bcrypt from 'bcrypt';
import { query, getPool } from '../src/db.js';

const SALT_ROUNDS = 10;
const EMAIL = 'contractor@thinkers.africa';
const PASSWORD = 'Admin123!';

async function main() {
  const existing = await query(`SELECT id FROM users WHERE email = @email`, { email: EMAIL });
  if (existing.recordset?.length > 0) {
    console.log('Contractor user already exists:', EMAIL);
    const pool = await getPool();
    await pool.close();
    process.exit(0);
    return;
  }

  const tenants = await query(`SELECT TOP 1 id, name FROM tenants WHERE status = N'active' ORDER BY created_at ASC`);
  if (!tenants.recordset?.length) {
    console.log('No tenant found. Run npm run db:schema and npm run seed first.');
    process.exit(1);
  }
  const tenant = tenants.recordset[0];
  const tenantId = tenant.id;

  const passwordHash = await bcrypt.hash(PASSWORD, SALT_ROUNDS);
  await query(
    `INSERT INTO users (tenant_id, email, password_hash, full_name, role, status)
     VALUES (@tenantId, @email, @passwordHash, N'Contractor Demo', N'user', N'active')`,
    { tenantId, email: EMAIL, passwordHash }
  );
  console.log('Contractor user created:', EMAIL, '/', PASSWORD);
  console.log('Linked to tenant:', tenant.name);
  console.log('Log in with this account to see data on the Contractor page.');

  const pool = await getPool();
  await pool.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
