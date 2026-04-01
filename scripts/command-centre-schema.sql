-- Command Centre tab permissions: super_admin grants which tabs each user can access.
-- Run: npm run db:command-centre
-- Use ON DELETE NO ACTION to avoid cycles/multiple cascade paths (SQL Server error 1785).

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'command_centre_grants')
CREATE TABLE command_centre_grants (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  user_id UNIQUEIDENTIFIER NOT NULL,
  tab_id NVARCHAR(50) NOT NULL,
  granted_by_user_id UNIQUEIDENTIFIER NULL,
  granted_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT UQ_cc_grants_user_tab UNIQUE (user_id, tab_id),
  CONSTRAINT FK_cc_grants_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT FK_cc_grants_granted_by FOREIGN KEY (granted_by_user_id) REFERENCES users(id) ON DELETE NO ACTION ON UPDATE NO ACTION
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_cc_grants_user_id' AND object_id = OBJECT_ID('command_centre_grants'))
  CREATE INDEX IX_cc_grants_user_id ON command_centre_grants(user_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_cc_grants_tab_id' AND object_id = OBJECT_ID('command_centre_grants'))
  CREATE INDEX IX_cc_grants_tab_id ON command_centre_grants(tab_id);

GO

-- Command Centre notes & reminders (private/public per user, optional reminder email time)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'cc_notes_reminders')
CREATE TABLE cc_notes_reminders (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  tenant_id UNIQUEIDENTIFIER NOT NULL,
  user_id UNIQUEIDENTIFIER NOT NULL,
  note_text NVARCHAR(MAX) NOT NULL,
  is_private BIT NOT NULL DEFAULT 1,
  reminder_at DATETIME2 NULL,
  reminder_sent_at DATETIME2 NULL,
  is_done BIT NOT NULL DEFAULT 0,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_cc_notes_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT FK_cc_notes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION ON UPDATE NO ACTION
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_cc_notes_tenant_user_created' AND object_id = OBJECT_ID('cc_notes_reminders'))
  CREATE INDEX IX_cc_notes_tenant_user_created ON cc_notes_reminders(tenant_id, user_id, created_at DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_cc_notes_reminder_scan' AND object_id = OBJECT_ID('cc_notes_reminders'))
  CREATE INDEX IX_cc_notes_reminder_scan ON cc_notes_reminders(reminder_sent_at, reminder_at, is_done);
