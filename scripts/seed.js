import 'dotenv/config';
import bcrypt from 'bcrypt';
import { query, getPool } from '../src/db.js';

const SALT_ROUNDS = 10;
const DEFAULT_PASSWORD = 'Admin123!'; // Change after first login

async function seed() {
  const existing = await query(`SELECT 1 FROM users WHERE email = N'admin@thinkers.africa'`);
  if (existing.recordset.length > 0) {
    console.log('Super admin already exists. Skipping seed.');
    const pool = await getPool();
    await pool.close();
    process.exit(0);
    return;
  }

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS);

  const tenantResult = await query(
    `INSERT INTO tenants (name, slug, [plan], [status])
     OUTPUT INSERTED.id, INSERTED.name, INSERTED.slug, INSERTED.[plan], INSERTED.[status], INSERTED.created_at
     VALUES (N'Simplyapp', N'simplyapp', N'enterprise', N'active')`
  );
  const tenant = tenantResult.recordset[0];
  const tenantId = tenant.id;
  console.log('Tenant created:', tenant.name, tenantId);

  await query(
    `INSERT INTO users (tenant_id, email, password_hash, full_name, role, status)
     VALUES (NULL, N'admin@thinkers.africa', @passwordHash, N'Super Admin', N'super_admin', N'active')`,
    { passwordHash }
  );
  console.log('Super admin created: admin@thinkers.africa /', DEFAULT_PASSWORD, '(no company link; use for Command Centre only)');

  await query(
    `INSERT INTO users (tenant_id, email, password_hash, full_name, role, status)
     VALUES (@tenantId, N'contractor@thinkers.africa', @passwordHash, N'Contractor Demo', N'user', N'active')`,
    { tenantId, passwordHash }
  );
  console.log('Contractor user created: contractor@thinkers.africa /', DEFAULT_PASSWORD, '(linked to Simplyapp tenant; use this to see Contractor page data)');

  const pool = await getPool();
  await pool.close();
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
