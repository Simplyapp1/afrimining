import 'dotenv/config';
import { getPool } from '../src/db.js';

// Run as separate batches so ADD column is committed before FK/index (Azure SQL / SQL Server).
const batch1 = `
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.contractor_drivers') AND name = 'linked_truck_id')
  ALTER TABLE dbo.contractor_drivers ADD linked_truck_id UNIQUEIDENTIFIER NULL;
`;
const batch2 = `
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_contractor_drivers_linked_truck')
  ALTER TABLE dbo.contractor_drivers
  ADD CONSTRAINT FK_contractor_drivers_linked_truck
  FOREIGN KEY (linked_truck_id) REFERENCES dbo.contractor_trucks(id) ON DELETE NO ACTION;
`;
const batch3 = `
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_contractor_drivers_linked_truck_id' AND object_id = OBJECT_ID('dbo.contractor_drivers'))
  CREATE INDEX IX_contractor_drivers_linked_truck_id ON dbo.contractor_drivers(linked_truck_id);
`;

const pool = await getPool();
for (const [name, stmt] of [
  ['ADD linked_truck_id column', batch1],
  ['FK_contractor_drivers_linked_truck', batch2],
  ['IX_contractor_drivers_linked_truck_id', batch3],
]) {
  try {
    await pool.request().query(stmt);
    console.log(name, 'OK');
  } catch (err) {
    console.error(name, 'failed:', err.message);
    if (err.precedingErrors) err.precedingErrors.forEach((e) => console.error('  ', e.message));
    await pool.close();
    process.exit(1);
  }
}
await pool.close();
console.log('Contractor driver linked_truck_id column added.');
process.exit(0);
