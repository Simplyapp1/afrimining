-- Comments on fleet/driver applications. Run with: node scripts/run-fleet-application-comments.js

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'cc_fleet_application_comments')
CREATE TABLE cc_fleet_application_comments (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  fleet_application_id UNIQUEIDENTIFIER NOT NULL REFERENCES cc_fleet_applications(id) ON DELETE CASCADE,
  user_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE NO ACTION,
  body NVARCHAR(MAX) NOT NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_cc_fleet_app_comments_app' AND object_id = OBJECT_ID('cc_fleet_application_comments'))
  CREATE INDEX IX_cc_fleet_app_comments_app ON cc_fleet_application_comments(fleet_application_id);
GO
