import 'dotenv/config';
import bcrypt from 'bcrypt';
import { query, getPool } from '../src/db.js';

/**
 * Creates a mock breakdown (incident) with full details for testing the contractor panel.
 * Also ensures there is a user with that tenant so you can log in and see the breakdown.
 * Run: npm run db:seed-mock-breakdown
 * Requires: tenants table and contractor tables (run db:schema, db:contractor, db:contractor-ensure first).
 */

const CONTRACTOR_USER_EMAIL = 'contractor@thinkers.africa';
const CONTRACTOR_USER_PASSWORD = 'Contractors1!';

const MOCK_BREAKDOWN = {
  type: 'breakdown',
  title: 'Axle failure on N4 near Middelburg',
  description: `Vehicle lost power and came to a stop on the N4 eastbound. Driver reported grinding noise from rear axle before failure.
Location: N4 km 42, approximately 15 km east of Middelburg.
No injuries. Load was secure.`,
  severity: 'High',
  actions_taken: `Driver pulled off to the emergency lane and placed warning triangles.
Recovery arranged via fleet manager. Truck towed to nearest workshop.
Client notified of delay. Replacement vehicle dispatched for load transfer.`,
  reported_at: new Date(),
};

async function seedMockBreakdown() {
  // 1. Get first tenant
  const tenants = await query(
    `SELECT TOP 1 id, name FROM tenants WHERE [status] = N'active' ORDER BY created_at ASC`
  );
  if (!tenants.recordset?.length) {
    console.error('No tenant found. Run npm run seed first to create a tenant.');
    process.exit(1);
  }
  const tenantId = tenants.recordset[0].id;
  const tenantName = tenants.recordset[0].name;
  console.log('Using tenant:', tenantName, tenantId);

  // 2. Get or create one truck
  let truckId = null;
  let trucks = await query(
    `SELECT TOP 1 id, registration FROM contractor_trucks WHERE tenant_id = @tenantId`,
    { tenantId }
  );
  if (trucks.recordset?.length) {
    truckId = trucks.recordset[0].id;
    console.log('Using existing truck:', trucks.recordset[0].registration, truckId);
  } else {
    const insertTruck = await query(
      `INSERT INTO contractor_trucks (tenant_id, registration, make_model, [status])
       OUTPUT INSERTED.id, INSERTED.registration
       VALUES (@tenantId, N'MOCK-001', N'Mock truck for testing', N'active')`,
      { tenantId }
    );
    truckId = insertTruck.recordset[0].id;
    console.log('Created mock truck: MOCK-001', truckId);
  }

  // 3. Get or create one driver
  let driverId = null;
  let drivers = await query(
    `SELECT TOP 1 id, full_name FROM contractor_drivers WHERE tenant_id = @tenantId`,
    { tenantId }
  );
  if (drivers.recordset?.length) {
    driverId = drivers.recordset[0].id;
    console.log('Using existing driver:', drivers.recordset[0].full_name, driverId);
  } else {
    const insertDriver = await query(
      `INSERT INTO contractor_drivers (tenant_id, full_name, license_number, phone, email)
       OUTPUT INSERTED.id, INSERTED.full_name
       VALUES (@tenantId, N'Mock Driver', N'MOCK-LIC-001', N'+27000000000', N'mock.driver@example.com')`,
      { tenantId }
    );
    driverId = insertDriver.recordset[0].id;
    console.log('Created mock driver: Mock Driver', driverId);
  }

  // 4. Insert mock breakdown with full details
  const result = await query(
    `INSERT INTO contractor_incidents (
       tenant_id, truck_id, driver_id, [type], title, description, severity,
       actions_taken, reported_at
     )
     OUTPUT INSERTED.id, INSERTED.[type], INSERTED.title, INSERTED.reported_at
     VALUES (
       @tenantId, @truck_id, @driver_id, @type, @title, @description, @severity,
       @actions_taken, @reported_at
     )`,
    {
      tenantId,
      truck_id: truckId,
      driver_id: driverId,
      type: MOCK_BREAKDOWN.type,
      title: MOCK_BREAKDOWN.title,
      description: MOCK_BREAKDOWN.description,
      severity: MOCK_BREAKDOWN.severity,
      actions_taken: MOCK_BREAKDOWN.actions_taken,
      reported_at: MOCK_BREAKDOWN.reported_at,
    }
  );

  const row = result.recordset[0];
  const ref = 'INC-' + String(row.id).replace(/-/g, '').slice(0, 8).toUpperCase();
  console.log('Mock breakdown created:', ref, row.type, row.title);
  console.log('  Reported at:', row.reported_at);

  // 5. Ensure a user exists for this tenant so you can see the breakdown (contractor APIs filter by tenant_id)
  const existingUser = await query(
    `SELECT TOP 1 id, email FROM users WHERE tenant_id = @tenantId`,
    { tenantId }
  );
  if (existingUser.recordset?.length) {
    console.log('\n  Log in with a user linked to tenant "' + tenantName + '" to see the mock breakdown.');
    console.log('  Example: any user with tenant_id =', tenantId);
  } else {
    const passwordHash = await bcrypt.hash(CONTRACTOR_USER_PASSWORD, 10);
    await query(
      `INSERT INTO users (tenant_id, email, password_hash, full_name, role, status)
       VALUES (@tenantId, @email, @passwordHash, N'Contractor Demo', N'contractor', N'active')`,
      { tenantId, email: CONTRACTOR_USER_EMAIL, passwordHash }
    );
    console.log('\n  Contractor user created so you can see the breakdown:');
    console.log('  → Log in with:', CONTRACTOR_USER_EMAIL);
    console.log('  → Password:  ', CONTRACTOR_USER_PASSWORD);
    console.log('  → Then go to Contractor → Operations → Breakdowns & incidents');
  }

  const pool = await getPool();
  await pool.close();
  process.exit(0);
}

seedMockBreakdown().catch((err) => {
  console.error(err);
  process.exit(1);
});
