-- Thinkers multi-tenant schema (run with: npm run db:schema)

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'tenants')
CREATE TABLE tenants (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  name NVARCHAR(255) NOT NULL,
  slug NVARCHAR(100) NOT NULL UNIQUE,
  domain NVARCHAR(255) NULL,
  logo_url NVARCHAR(500) NULL,
  [plan] NVARCHAR(50) NOT NULL DEFAULT N'standard',
  [status] NVARCHAR(20) NOT NULL DEFAULT N'active',
  settings NVARCHAR(MAX) NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'users')
CREATE TABLE users (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  tenant_id UNIQUEIDENTIFIER NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email NVARCHAR(255) NOT NULL,
  password_hash NVARCHAR(255) NOT NULL,
  full_name NVARCHAR(255) NOT NULL,
  role NVARCHAR(50) NOT NULL DEFAULT N'user',
  [status] NVARCHAR(20) NOT NULL DEFAULT N'active',
  avatar_url NVARCHAR(500) NULL,
  last_login_at DATETIME2 NULL,
  login_count INT NOT NULL DEFAULT 0,
  login_failed_attempts INT NOT NULL DEFAULT 0,
  login_locked_at DATETIME2 NULL,
  metadata NVARCHAR(MAX) NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT UQ_users_tenant_email UNIQUE (tenant_id, email)
);
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'audit_log')
CREATE TABLE audit_log (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  tenant_id UNIQUEIDENTIFIER NULL REFERENCES tenants(id) ON DELETE SET NULL,
  user_id UNIQUEIDENTIFIER NULL REFERENCES users(id) ON DELETE NO ACTION,
  action NVARCHAR(100) NOT NULL,
  entity_type NVARCHAR(50) NOT NULL,
  entity_id NVARCHAR(100) NULL,
  details NVARCHAR(MAX) NULL,
  ip NVARCHAR(45) NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_users_tenant_id' AND object_id = OBJECT_ID('users')) CREATE INDEX IX_users_tenant_id ON users(tenant_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_users_email' AND object_id = OBJECT_ID('users')) CREATE INDEX IX_users_email ON users(email);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_users_status' AND object_id = OBJECT_ID('users')) CREATE INDEX IX_users_status ON users(status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_users_role' AND object_id = OBJECT_ID('users')) CREATE INDEX IX_users_role ON users(role);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_audit_log_tenant_id' AND object_id = OBJECT_ID('audit_log')) CREATE INDEX IX_audit_log_tenant_id ON audit_log(tenant_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_audit_log_user_id' AND object_id = OBJECT_ID('audit_log')) CREATE INDEX IX_audit_log_user_id ON audit_log(user_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_audit_log_created_at' AND object_id = OBJECT_ID('audit_log')) CREATE INDEX IX_audit_log_created_at ON audit_log(created_at);
