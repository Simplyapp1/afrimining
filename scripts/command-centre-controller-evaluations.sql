-- Controller evaluations and override requests for shift reports. Run: node scripts/run-command-centre-controller-evaluations.js

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'controller_evaluations')
CREATE TABLE controller_evaluations (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  tenant_id UNIQUEIDENTIFIER NULL,
  shift_report_id UNIQUEIDENTIFIER NOT NULL,
  evaluator_user_id UNIQUEIDENTIFIER NOT NULL,
  answers NVARCHAR(MAX) NOT NULL,
  overall_comment NVARCHAR(MAX) NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_ce_shift_report FOREIGN KEY (shift_report_id) REFERENCES command_centre_shift_reports(id) ON DELETE CASCADE,
  CONSTRAINT FK_ce_evaluator FOREIGN KEY (evaluator_user_id) REFERENCES users(id) ON DELETE NO ACTION ON UPDATE NO ACTION
);
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'shift_report_override_requests')
CREATE TABLE shift_report_override_requests (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  shift_report_id UNIQUEIDENTIFIER NOT NULL,
  requested_by_user_id UNIQUEIDENTIFIER NOT NULL,
  code NVARCHAR(20) NOT NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  used_at DATETIME2 NULL,
  CONSTRAINT FK_sror_report FOREIGN KEY (shift_report_id) REFERENCES command_centre_shift_reports(id) ON DELETE CASCADE,
  CONSTRAINT FK_sror_user FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE NO ACTION ON UPDATE NO ACTION
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ce_shift_report' AND object_id = OBJECT_ID('controller_evaluations'))
  CREATE INDEX IX_ce_shift_report ON controller_evaluations(shift_report_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ce_evaluator' AND object_id = OBJECT_ID('controller_evaluations'))
  CREATE INDEX IX_ce_evaluator ON controller_evaluations(evaluator_user_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ce_tenant' AND object_id = OBJECT_ID('controller_evaluations'))
  CREATE INDEX IX_ce_tenant ON controller_evaluations(tenant_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_sror_report' AND object_id = OBJECT_ID('shift_report_override_requests'))
  CREATE INDEX IX_sror_report ON shift_report_override_requests(shift_report_id);
