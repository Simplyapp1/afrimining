-- User-tenants: allow a user to belong to multiple tenants.
-- Run with: node scripts/run-user-tenants.js

-- Use ON DELETE NO ACTION to avoid multiple cascade paths (SQL Server restriction)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'user_tenants')
CREATE TABLE user_tenants (
  user_id UNIQUEIDENTIFIER NOT NULL,
  tenant_id UNIQUEIDENTIFIER NOT NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_user_tenants PRIMARY KEY (user_id, tenant_id),
  CONSTRAINT FK_user_tenants_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION,
  CONSTRAINT FK_user_tenants_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE NO ACTION
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_user_tenants_tenant_id' AND object_id = OBJECT_ID('user_tenants'))
  CREATE INDEX IX_user_tenants_tenant_id ON user_tenants(tenant_id);
GO

-- Backfill: add one row per user from existing users.tenant_id (so existing users keep their tenant)
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'user_tenants')
BEGIN
  INSERT INTO user_tenants (user_id, tenant_id)
  SELECT id, tenant_id FROM users WHERE tenant_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM user_tenants ut WHERE ut.user_id = users.id AND ut.tenant_id = users.tenant_id);
END
GO
