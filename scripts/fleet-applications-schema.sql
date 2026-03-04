-- Fleet & driver applications: contract additions (manual + import) require Command Centre approval for facility access.
-- Run: node scripts/run-fleet-applications-schema.js

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'cc_fleet_applications')
CREATE TABLE cc_fleet_applications (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type NVARCHAR(20) NOT NULL,
  entity_id UNIQUEIDENTIFIER NOT NULL,
  source NVARCHAR(20) NOT NULL DEFAULT N'manual',
  [status] NVARCHAR(20) NOT NULL DEFAULT N'pending',
  reviewed_by_user_id UNIQUEIDENTIFIER NULL,
  reviewed_at DATETIME2 NULL,
  decline_reason NVARCHAR(MAX) NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT CK_cc_fleet_app_entity_type CHECK (entity_type IN (N'truck', N'driver')),
  CONSTRAINT CK_cc_fleet_app_source CHECK (source IN (N'manual', N'import')),
  CONSTRAINT CK_cc_fleet_app_status CHECK ([status] IN (N'pending', N'approved', N'declined'))
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_cc_fleet_app_reviewed_by' AND parent_object_id = OBJECT_ID('cc_fleet_applications'))
  ALTER TABLE cc_fleet_applications ADD CONSTRAINT FK_cc_fleet_app_reviewed_by FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE NO ACTION ON UPDATE NO ACTION;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_cc_fleet_app_tenant_status' AND object_id = OBJECT_ID('cc_fleet_applications'))
  CREATE INDEX IX_cc_fleet_app_tenant_status ON cc_fleet_applications(tenant_id, [status]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_cc_fleet_app_entity' AND object_id = OBJECT_ID('cc_fleet_applications'))
  CREATE INDEX IX_cc_fleet_app_entity ON cc_fleet_applications(entity_type, entity_id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_trucks') AND name = 'facility_access')
  ALTER TABLE contractor_trucks ADD facility_access BIT NOT NULL DEFAULT 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_trucks') AND name = 'last_decline_reason')
  ALTER TABLE contractor_trucks ADD last_decline_reason NVARCHAR(MAX) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_drivers') AND name = 'facility_access')
  ALTER TABLE contractor_drivers ADD facility_access BIT NOT NULL DEFAULT 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_drivers') AND name = 'last_decline_reason')
  ALTER TABLE contractor_drivers ADD last_decline_reason NVARCHAR(MAX) NULL;
GO
