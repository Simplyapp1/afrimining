-- Sign-up requests (pending approval). Run with: node scripts/run-sign-up-requests-schema.js

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'sign_up_requests')
CREATE TABLE sign_up_requests (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  email NVARCHAR(255) NOT NULL,
  full_name NVARCHAR(255) NOT NULL,
  id_number NVARCHAR(50) NULL,
  cellphone NVARCHAR(50) NULL,
  [status] NVARCHAR(20) NOT NULL DEFAULT N'pending',
  reviewed_by_user_id UNIQUEIDENTIFIER NULL REFERENCES users(id) ON DELETE NO ACTION,
  reviewed_at DATETIME2 NULL,
  rejection_reason NVARCHAR(MAX) NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT CK_sign_up_requests_status CHECK ([status] IN (N'pending', N'approved', N'rejected'))
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_sign_up_requests_status' AND object_id = OBJECT_ID('sign_up_requests'))
  CREATE INDEX IX_sign_up_requests_status ON sign_up_requests([status]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_sign_up_requests_email' AND object_id = OBJECT_ID('sign_up_requests'))
  CREATE INDEX IX_sign_up_requests_email ON sign_up_requests(email);
GO

-- Add cellphone to users if not present (for approved sign-ups)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('users') AND name = 'cellphone')
  ALTER TABLE users ADD cellphone NVARCHAR(50) NULL;
GO
