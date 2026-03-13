-- User page roles: which main pages a user can access (multi-select).
-- Run with: node scripts/run-user-page-roles.js

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'user_page_roles')
CREATE TABLE user_page_roles (
  user_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page_id NVARCHAR(50) NOT NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_user_page_roles PRIMARY KEY (user_id, page_id),
  CONSTRAINT CK_user_page_roles_page_id CHECK (page_id IN (
    N'profile', N'management', N'users', N'tenants', N'contractor', N'command_centre', N'access_management', N'rector', N'tasks', N'transport_operations', N'recruitment'
  ))
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_user_page_roles_user_id' AND object_id = OBJECT_ID('user_page_roles'))
  CREATE INDEX IX_user_page_roles_user_id ON user_page_roles(user_id);
GO
