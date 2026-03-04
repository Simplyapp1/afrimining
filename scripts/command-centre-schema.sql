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
