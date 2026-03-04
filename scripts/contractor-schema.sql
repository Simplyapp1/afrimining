-- Contractor module (commodity industry): trucks, drivers, incidents, expiries, suspensions, messages
-- Run after main schema: node scripts/run-schema.js (point at this file) or run manually

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'contractor_trucks')
CREATE TABLE contractor_trucks (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  registration NVARCHAR(50) NOT NULL,
  make_model NVARCHAR(255) NULL,
  commodity_type NVARCHAR(100) NULL,
  capacity_tonnes DECIMAL(10,2) NULL,
  [status] NVARCHAR(50) NOT NULL DEFAULT N'active',
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'contractor_drivers')
CREATE TABLE contractor_drivers (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  full_name NVARCHAR(255) NOT NULL,
  license_number NVARCHAR(100) NULL,
  license_expiry DATE NULL,
  phone NVARCHAR(50) NULL,
  email NVARCHAR(255) NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'contractor_incidents')
CREATE TABLE contractor_incidents (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  truck_id UNIQUEIDENTIFIER NULL,
  driver_id UNIQUEIDENTIFIER NULL,
  [type] NVARCHAR(50) NOT NULL,
  title NVARCHAR(255) NOT NULL,
  description NVARCHAR(MAX) NULL,
  severity NVARCHAR(50) NULL,
  reported_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  resolved_at DATETIME2 NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'contractor_expiries')
CREATE TABLE contractor_expiries (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  item_type NVARCHAR(50) NOT NULL,
  item_ref NVARCHAR(255) NULL,
  expiry_date DATE NOT NULL,
  description NVARCHAR(500) NULL,
  alert_sent BIT NOT NULL DEFAULT 0,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'contractor_suspensions')
CREATE TABLE contractor_suspensions (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type NVARCHAR(50) NOT NULL,
  entity_id NVARCHAR(100) NULL,
  reason NVARCHAR(MAX) NOT NULL,
  [status] NVARCHAR(50) NOT NULL DEFAULT N'suspended',
  appeal_notes NVARCHAR(MAX) NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'contractor_messages')
CREATE TABLE contractor_messages (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sender_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE NO ACTION,
  subject NVARCHAR(255) NOT NULL,
  body NVARCHAR(MAX) NULL,
  read_at DATETIME2 NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ct_trucks_tenant' AND object_id = OBJECT_ID('contractor_trucks')) CREATE INDEX IX_ct_trucks_tenant ON contractor_trucks(tenant_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ct_drivers_tenant' AND object_id = OBJECT_ID('contractor_drivers')) CREATE INDEX IX_ct_drivers_tenant ON contractor_drivers(tenant_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ct_incidents_tenant' AND object_id = OBJECT_ID('contractor_incidents')) CREATE INDEX IX_ct_incidents_tenant ON contractor_incidents(tenant_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ct_expiries_tenant' AND object_id = OBJECT_ID('contractor_expiries')) CREATE INDEX IX_ct_expiries_tenant ON contractor_expiries(tenant_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ct_suspensions_tenant' AND object_id = OBJECT_ID('contractor_suspensions')) CREATE INDEX IX_ct_suspensions_tenant ON contractor_suspensions(tenant_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ct_messages_tenant' AND object_id = OBJECT_ID('contractor_messages')) CREATE INDEX IX_ct_messages_tenant ON contractor_messages(tenant_id);
