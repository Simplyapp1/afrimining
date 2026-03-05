-- Multiple contractors per tenant (e.g. Teshuah Trucks, Sofrans under one tenant).
-- Run: node scripts/run-contractors-multi-schema.js
-- Fleet/drivers/incidents etc. are scoped by contractor_id; users see only their assigned contractors.

-- Contractors table: one tenant has many contractors (companies)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'contractors')
CREATE TABLE contractors (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name NVARCHAR(255) NOT NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_contractors_tenant' AND object_id = OBJECT_ID('contractors'))
  CREATE INDEX IX_contractors_tenant ON contractors(tenant_id);
GO

-- User -> contractor access (which contractors can this user see; empty = all under tenant)
-- Use NO ACTION on contractor_id to avoid multiple cascade paths (contractors already CASCADE from tenants).
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'user_contractors')
CREATE TABLE user_contractors (
  user_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contractor_id UNIQUEIDENTIFIER NOT NULL REFERENCES contractors(id) ON DELETE NO ACTION,
  PRIMARY KEY (user_id, contractor_id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_user_contractors_contractor' AND object_id = OBJECT_ID('user_contractors'))
  CREATE INDEX IX_user_contractors_contractor ON user_contractors(contractor_id);
GO

-- Add contractor_id to fleet/data tables (nullable for migration; NULL = legacy tenant-level)
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'contractor_trucks')
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_trucks') AND name = 'contractor_id')
    ALTER TABLE contractor_trucks ADD contractor_id UNIQUEIDENTIFIER NULL REFERENCES contractors(id) ON DELETE NO ACTION;
GO
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'contractor_drivers')
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_drivers') AND name = 'contractor_id')
    ALTER TABLE contractor_drivers ADD contractor_id UNIQUEIDENTIFIER NULL REFERENCES contractors(id) ON DELETE NO ACTION;
GO
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'contractor_incidents')
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_incidents') AND name = 'contractor_id')
    ALTER TABLE contractor_incidents ADD contractor_id UNIQUEIDENTIFIER NULL REFERENCES contractors(id) ON DELETE NO ACTION;
GO
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'contractor_expiries')
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_expiries') AND name = 'contractor_id')
    ALTER TABLE contractor_expiries ADD contractor_id UNIQUEIDENTIFIER NULL REFERENCES contractors(id) ON DELETE NO ACTION;
GO
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'contractor_suspensions')
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_suspensions') AND name = 'contractor_id')
    ALTER TABLE contractor_suspensions ADD contractor_id UNIQUEIDENTIFIER NULL REFERENCES contractors(id) ON DELETE NO ACTION;
GO
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'contractor_messages')
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_messages') AND name = 'contractor_id')
    ALTER TABLE contractor_messages ADD contractor_id UNIQUEIDENTIFIER NULL REFERENCES contractors(id) ON DELETE NO ACTION;
GO
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'contractor_library_documents')
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_library_documents') AND name = 'contractor_id')
    ALTER TABLE contractor_library_documents ADD contractor_id UNIQUEIDENTIFIER NULL REFERENCES contractors(id) ON DELETE NO ACTION;
GO
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'contractor_subcontractors')
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_subcontractors') AND name = 'contractor_id')
    ALTER TABLE contractor_subcontractors ADD contractor_id UNIQUEIDENTIFIER NULL REFERENCES contractors(id) ON DELETE NO ACTION;
GO

-- contractor_info: allow multiple per tenant (one per contractor); add contractor_id, drop UNIQUE(tenant_id)
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'contractor_info')
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_info') AND name = 'contractor_id')
    ALTER TABLE contractor_info ADD contractor_id UNIQUEIDENTIFIER NULL REFERENCES contractors(id) ON DELETE NO ACTION;
  -- Drop unique constraint on tenant_id if present (SQL Server names it automatically)
  DECLARE @uq nvarchar(128);
  SELECT @uq = k.name FROM sys.key_constraints k
  INNER JOIN sys.index_columns ic ON ic.object_id = k.parent_object_id AND ic.index_id = k.unique_index_id
  INNER JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id AND c.name = N'tenant_id'
  WHERE k.parent_object_id = OBJECT_ID('contractor_info') AND k.type = N'UQ';
  IF @uq IS NOT NULL
    EXEC('ALTER TABLE contractor_info DROP CONSTRAINT ' + @uq);
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_contractor_info_tenant' AND object_id = OBJECT_ID('contractor_info'))
    CREATE INDEX IX_contractor_info_tenant ON contractor_info(tenant_id);
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_contractor_info_contractor' AND object_id = OBJECT_ID('contractor_info'))
    CREATE INDEX IX_contractor_info_contractor ON contractor_info(contractor_id);
END
GO

-- Indexes for contractor_id on main tables (for filtering)
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'contractor_trucks')
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_contractor_trucks_contractor' AND object_id = OBJECT_ID('contractor_trucks'))
    CREATE INDEX IX_contractor_trucks_contractor ON contractor_trucks(contractor_id);
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'contractor_drivers')
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_contractor_drivers_contractor' AND object_id = OBJECT_ID('contractor_drivers'))
    CREATE INDEX IX_contractor_drivers_contractor ON contractor_drivers(contractor_id);
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'contractor_incidents')
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_contractor_incidents_contractor' AND object_id = OBJECT_ID('contractor_incidents'))
    CREATE INDEX IX_contractor_incidents_contractor ON contractor_incidents(contractor_id);
GO
