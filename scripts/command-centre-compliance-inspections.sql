-- Compliance inspections (Command Centre): inspection records with 8h contractor response window.
-- If no response within 8 hours, truck/driver are auto-suspended; contractor can submit appeal.
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'cc_compliance_inspections')
CREATE TABLE cc_compliance_inspections (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  truck_id UNIQUEIDENTIFIER NOT NULL,
  driver_id UNIQUEIDENTIFIER NOT NULL,
  inspector_user_id UNIQUEIDENTIFIER NULL REFERENCES users(id) ON DELETE NO ACTION,
  truck_registration NVARCHAR(100) NULL,
  truck_make_model NVARCHAR(255) NULL,
  driver_name NVARCHAR(255) NULL,
  driver_id_number NVARCHAR(100) NULL,
  license_number NVARCHAR(100) NULL,
  gps_status NVARCHAR(50) NULL,
  gps_comment NVARCHAR(MAX) NULL,
  camera_status NVARCHAR(50) NULL,
  camera_comment NVARCHAR(MAX) NULL,
  camera_visibility NVARCHAR(50) NULL,
  camera_visibility_comment NVARCHAR(MAX) NULL,
  driver_items_json NVARCHAR(MAX) NULL,
  recommend_suspend_truck BIT NOT NULL DEFAULT 0,
  recommend_suspend_driver BIT NOT NULL DEFAULT 0,
  response_due_at DATETIME2 NOT NULL,
  [status] NVARCHAR(50) NOT NULL DEFAULT N'pending_response',
  contractor_responded_at DATETIME2 NULL,
  contractor_response_text NVARCHAR(MAX) NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_cc_compliance_inspections_tenant' AND object_id = OBJECT_ID('cc_compliance_inspections'))
  CREATE INDEX IX_cc_compliance_inspections_tenant ON cc_compliance_inspections(tenant_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_cc_compliance_inspections_status_due' AND object_id = OBJECT_ID('cc_compliance_inspections'))
  CREATE INDEX IX_cc_compliance_inspections_status_due ON cc_compliance_inspections([status], response_due_at);
GO

-- Optional: link suspensions created from compliance to the inspection (entity_type = 'compliance_inspection', entity_id = inspection id already works)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_suspensions') AND name = 'compliance_inspection_id')
BEGIN
  ALTER TABLE contractor_suspensions ADD compliance_inspection_id UNIQUEIDENTIFIER NULL REFERENCES cc_compliance_inspections(id) ON DELETE NO ACTION;
END
GO
