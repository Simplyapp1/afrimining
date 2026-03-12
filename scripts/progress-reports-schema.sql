-- Project progress reports: created in Access Management, displayed on Rector Progress reports tab.
-- Run: node scripts/run-progress-reports-schema.js

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'project_progress_reports')
CREATE TABLE project_progress_reports (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title NVARCHAR(500) NOT NULL,
  report_date DATE NOT NULL,
  reporting_status NVARCHAR(500) NULL,
  narrative_updates NVARCHAR(MAX) NULL,
  phases_json NVARCHAR(MAX) NULL,
  contractor_status_json NVARCHAR(MAX) NULL,
  sanctions_text NVARCHAR(MAX) NULL,
  conclusion_text NVARCHAR(MAX) NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  created_by_user_id UNIQUEIDENTIFIER NULL REFERENCES users(id) ON DELETE NO ACTION ON UPDATE NO ACTION
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_project_progress_reports_tenant' AND object_id = OBJECT_ID('project_progress_reports'))
  CREATE INDEX IX_project_progress_reports_tenant ON project_progress_reports(tenant_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_project_progress_reports_report_date' AND object_id = OBJECT_ID('project_progress_reports'))
  CREATE INDEX IX_project_progress_reports_report_date ON project_progress_reports(report_date DESC);
GO
