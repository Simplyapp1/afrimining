-- Distribution history: log when fleet/driver lists are distributed (download, email, WhatsApp).
-- Run: node scripts/run-access-distribution-history.js

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'access_distribution_history')
CREATE TABLE access_distribution_history (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  created_by_user_id UNIQUEIDENTIFIER NULL,
  list_type NVARCHAR(20) NOT NULL,
  route_ids NVARCHAR(500) NULL,
  format NVARCHAR(20) NOT NULL,
  channel NVARCHAR(20) NOT NULL,
  recipient_email NVARCHAR(255) NULL,
  recipient_phone NVARCHAR(100) NULL,
  created_by_name NVARCHAR(255) NULL,
  CONSTRAINT CK_dist_history_list_type CHECK (list_type IN (N'fleet', N'driver', N'both')),
  CONSTRAINT CK_dist_history_format CHECK (format IN (N'csv', N'excel', N'pdf')),
  CONSTRAINT CK_dist_history_channel CHECK (channel IN (N'download', N'email', N'whatsapp'))
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_access_distribution_history_created_by' AND parent_object_id = OBJECT_ID('access_distribution_history'))
  ALTER TABLE access_distribution_history ADD CONSTRAINT FK_access_distribution_history_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE NO ACTION;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_access_distribution_history_tenant' AND object_id = OBJECT_ID('access_distribution_history'))
  CREATE INDEX IX_access_distribution_history_tenant ON access_distribution_history(tenant_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_access_distribution_history_created' AND object_id = OBJECT_ID('access_distribution_history'))
  CREATE INDEX IX_access_distribution_history_created ON access_distribution_history(tenant_id, created_at DESC);
GO
