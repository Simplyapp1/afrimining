-- Monthly performance reports: composed in Access Management, viewed on Rector.
-- Run: node scripts/run-monthly-performance-reports-schema.js

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'monthly_performance_reports')
CREATE TABLE monthly_performance_reports (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title NVARCHAR(500) NOT NULL,
  reporting_period_start DATE NOT NULL,
  reporting_period_end DATE NOT NULL,
  submitted_date DATE NOT NULL,
  prepared_by NVARCHAR(500) NULL,
  executive_summary NVARCHAR(MAX) NULL,
  key_metrics_json NVARCHAR(MAX) NULL,
  sections_json NVARCHAR(MAX) NULL,
  breakdowns_json NVARCHAR(MAX) NULL,
  fleet_performance_json NVARCHAR(MAX) NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  created_by_user_id UNIQUEIDENTIFIER NULL REFERENCES users(id) ON DELETE NO ACTION ON UPDATE NO ACTION
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_monthly_performance_reports_tenant' AND object_id = OBJECT_ID('monthly_performance_reports'))
  CREATE INDEX IX_monthly_performance_reports_tenant ON monthly_performance_reports(tenant_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_monthly_performance_reports_submitted' AND object_id = OBJECT_ID('monthly_performance_reports'))
  CREATE INDEX IX_monthly_performance_reports_submitted ON monthly_performance_reports(submitted_date DESC);
GO
