-- Project Tracker: projects, phases, members, implementation logs, finance, attachments, notes.
-- Run: npm run db:project-tracker

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'project_tracker_projects')
CREATE TABLE project_tracker_projects (
  id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title NVARCHAR(500) NOT NULL,
  code NVARCHAR(80) NULL,
  description NVARCHAR(MAX) NULL,
  sponsor NVARCHAR(500) NULL,
  site_location NVARCHAR(500) NULL,
  planned_start_date DATE NULL,
  planned_end_date DATE NULL,
  actual_start_date DATE NULL,
  actual_end_date DATE NULL,
  overall_budget DECIMAL(18, 2) NULL,
  status NVARCHAR(40) NOT NULL DEFAULT N'draft',
  owner_user_id UNIQUEIDENTIFIER NULL REFERENCES users(id) ON DELETE NO ACTION,
  created_by UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE NO ACTION,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT CK_project_tracker_projects_status CHECK (status IN (N'draft', N'registered', N'active', N'on_hold', N'completed', N'cancelled'))
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'project_tracker_phases')
CREATE TABLE project_tracker_phases (
  id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  project_id UNIQUEIDENTIFIER NOT NULL REFERENCES project_tracker_projects(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  name NVARCHAR(300) NOT NULL,
  description NVARCHAR(MAX) NULL,
  actions_required NVARCHAR(MAX) NULL,
  budget_allocated DECIMAL(18, 2) NULL,
  requirements_summary NVARCHAR(MAX) NULL,
  status NVARCHAR(30) NOT NULL DEFAULT N'planned',
  planned_start DATE NULL,
  planned_end DATE NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT CK_project_tracker_phases_status CHECK (status IN (N'planned', N'open', N'in_progress', N'completed', N'blocked'))
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'project_tracker_phase_members')
CREATE TABLE project_tracker_phase_members (
  id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  phase_id UNIQUEIDENTIFIER NOT NULL REFERENCES project_tracker_phases(id) ON DELETE CASCADE,
  user_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE NO ACTION,
  role_title NVARCHAR(200) NOT NULL,
  requirements_notes NVARCHAR(MAX) NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT UQ_project_tracker_phase_member UNIQUE (phase_id, user_id, role_title)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'project_tracker_implementation_logs')
CREATE TABLE project_tracker_implementation_logs (
  id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  phase_id UNIQUEIDENTIFIER NOT NULL REFERENCES project_tracker_phases(id) ON DELETE CASCADE,
  work_transcript NVARCHAR(MAX) NULL,
  progress_percent INT NOT NULL DEFAULT 0,
  finances_note NVARCHAR(MAX) NULL,
  created_by UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE NO ACTION,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT CK_project_tracker_log_progress CHECK (progress_percent >= 0 AND progress_percent <= 100)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'project_tracker_finance_lines')
CREATE TABLE project_tracker_finance_lines (
  id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  project_id UNIQUEIDENTIFIER NOT NULL REFERENCES project_tracker_projects(id) ON DELETE CASCADE,
  phase_id UNIQUEIDENTIFIER NULL REFERENCES project_tracker_phases(id) ON DELETE NO ACTION,
  entry_type NVARCHAR(20) NOT NULL,
  label NVARCHAR(300) NOT NULL,
  amount DECIMAL(18, 2) NOT NULL,
  entry_date DATE NULL,
  notes NVARCHAR(MAX) NULL,
  created_by UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE NO ACTION,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT CK_project_tracker_finance_type CHECK (entry_type IN (N'income', N'expense', N'forecast'))
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'project_tracker_attachments')
CREATE TABLE project_tracker_attachments (
  id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  project_id UNIQUEIDENTIFIER NOT NULL REFERENCES project_tracker_projects(id) ON DELETE CASCADE,
  phase_id UNIQUEIDENTIFIER NULL REFERENCES project_tracker_phases(id) ON DELETE NO ACTION,
  file_name NVARCHAR(500) NOT NULL,
  file_path NVARCHAR(1000) NOT NULL,
  uploaded_by UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE NO ACTION,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'project_tracker_notes')
CREATE TABLE project_tracker_notes (
  id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  project_id UNIQUEIDENTIFIER NOT NULL REFERENCES project_tracker_projects(id) ON DELETE CASCADE,
  phase_id UNIQUEIDENTIFIER NULL REFERENCES project_tracker_phases(id) ON DELETE NO ACTION,
  body NVARCHAR(MAX) NOT NULL,
  created_by UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE NO ACTION,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_project_tracker_projects_tenant' AND object_id = OBJECT_ID('project_tracker_projects'))
  CREATE INDEX IX_project_tracker_projects_tenant ON project_tracker_projects(tenant_id, created_at DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_project_tracker_phases_project' AND object_id = OBJECT_ID('project_tracker_phases'))
  CREATE INDEX IX_project_tracker_phases_project ON project_tracker_phases(project_id, sort_order);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_project_tracker_phase_members_phase' AND object_id = OBJECT_ID('project_tracker_phase_members'))
  CREATE INDEX IX_project_tracker_phase_members_phase ON project_tracker_phase_members(phase_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_project_tracker_logs_phase' AND object_id = OBJECT_ID('project_tracker_implementation_logs'))
  CREATE INDEX IX_project_tracker_logs_phase ON project_tracker_implementation_logs(phase_id, created_at DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_project_tracker_finance_project' AND object_id = OBJECT_ID('project_tracker_finance_lines'))
  CREATE INDEX IX_project_tracker_finance_project ON project_tracker_finance_lines(project_id, entry_date);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_project_tracker_attachments_project' AND object_id = OBJECT_ID('project_tracker_attachments'))
  CREATE INDEX IX_project_tracker_attachments_project ON project_tracker_attachments(project_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_project_tracker_notes_project' AND object_id = OBJECT_ID('project_tracker_notes'))
  CREATE INDEX IX_project_tracker_notes_project ON project_tracker_notes(project_id, created_at DESC);
GO
