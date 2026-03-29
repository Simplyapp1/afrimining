-- Truck update analysis sessions: save, handover, 12h idle prune of working payload.
-- Run: npm run db:truck-analysis-handovers

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'truck_analysis_handovers')
CREATE TABLE truck_analysis_handovers (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  tenant_id UNIQUEIDENTIFIER NOT NULL,
  reference_code NVARCHAR(16) NOT NULL,
  status NVARCHAR(20) NOT NULL DEFAULT 'active',
  payload_json NVARCHAR(MAX) NULL,
  summary_json NVARCHAR(MAX) NULL,
  last_referenced_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  handed_over_at DATETIME2 NULL,
  pruned_at DATETIME2 NULL,
  created_by_user_id UNIQUEIDENTIFIER NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT UQ_truck_analysis_tenant_ref UNIQUE (tenant_id, reference_code),
  CONSTRAINT FK_truck_analysis_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE NO ACTION,
  CONSTRAINT FK_truck_analysis_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE NO ACTION
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_truck_analysis_tenant_status' AND object_id = OBJECT_ID('truck_analysis_handovers'))
  CREATE INDEX IX_truck_analysis_tenant_status ON truck_analysis_handovers(tenant_id, status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_truck_analysis_last_ref' AND object_id = OBJECT_ID('truck_analysis_handovers'))
  CREATE INDEX IX_truck_analysis_last_ref ON truck_analysis_handovers(tenant_id, last_referenced_at);
GO
