-- Investigation reports for Command Centre (saved to library when approved). Run: node scripts/run-command-centre-investigation-reports.js

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'command_centre_investigation_reports')
CREATE TABLE command_centre_investigation_reports (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  created_by_user_id UNIQUEIDENTIFIER NOT NULL,
  case_number NVARCHAR(100) NULL,
  [type] NVARCHAR(50) NULL,
  [status] NVARCHAR(50) NOT NULL DEFAULT N'draft',
  priority NVARCHAR(50) NULL,
  date_occurred DATE NULL,
  date_reported DATE NULL,
  [location] NVARCHAR(255) NULL,
  investigator_name NVARCHAR(255) NULL,
  badge_number NVARCHAR(50) NULL,
  [rank] NVARCHAR(100) NULL,
  reported_by_name NVARCHAR(255) NULL,
  reported_by_position NVARCHAR(255) NULL,
  [description] NVARCHAR(MAX) NULL,
  transactions NVARCHAR(MAX) NULL,
  parties NVARCHAR(MAX) NULL,
  evidence_notes NVARCHAR(MAX) NULL,
  finding_summary NVARCHAR(MAX) NULL,
  finding_operational_trigger NVARCHAR(MAX) NULL,
  finding_incident NVARCHAR(MAX) NULL,
  finding_workaround NVARCHAR(MAX) NULL,
  finding_system_integrity NVARCHAR(MAX) NULL,
  finding_resolution NVARCHAR(MAX) NULL,
  recommendations NVARCHAR(MAX) NULL,
  additional_notes NVARCHAR(MAX) NULL,
  approved_at DATETIME2 NULL,
  approved_by_user_id UNIQUEIDENTIFIER NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_cc_inv_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT FK_cc_inv_approved_by FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE NO ACTION ON UPDATE NO ACTION
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_cc_inv_created_by' AND object_id = OBJECT_ID('command_centre_investigation_reports'))
  CREATE INDEX IX_cc_inv_created_by ON command_centre_investigation_reports(created_by_user_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_cc_inv_status' AND object_id = OBJECT_ID('command_centre_investigation_reports'))
  CREATE INDEX IX_cc_inv_status ON command_centre_investigation_reports([status]);
GO
