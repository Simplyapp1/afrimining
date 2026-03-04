-- Link driver to a truck (run once: npm run db:contractor-driver-linked-truck or run manually)
-- Enables "Link to truck" on Driver register
-- Use dbo. so OBJECT_ID and table name resolve to the same table.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.contractor_drivers') AND name = 'linked_truck_id')
  ALTER TABLE dbo.contractor_drivers ADD linked_truck_id UNIQUEIDENTIFIER NULL;

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_contractor_drivers_linked_truck')
  ALTER TABLE dbo.contractor_drivers
  ADD CONSTRAINT FK_contractor_drivers_linked_truck
  FOREIGN KEY (linked_truck_id) REFERENCES dbo.contractor_trucks(id) ON DELETE NO ACTION;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_contractor_drivers_linked_truck_id' AND object_id = OBJECT_ID('dbo.contractor_drivers'))
  CREATE INDEX IX_contractor_drivers_linked_truck_id ON dbo.contractor_drivers(linked_truck_id);
