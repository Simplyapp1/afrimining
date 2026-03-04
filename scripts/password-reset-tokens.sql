-- Password reset tokens (for forgot-password flow). Run with: node scripts/run-password-reset-tokens.js

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'password_reset_tokens')
CREATE TABLE password_reset_tokens (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  user_id UNIQUEIDENTIFIER NOT NULL,
  token NVARCHAR(64) NOT NULL,
  code NVARCHAR(10) NOT NULL,
  expires_at DATETIME2 NOT NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_password_reset_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_password_reset_tokens_token' AND object_id = OBJECT_ID('password_reset_tokens'))
  CREATE UNIQUE INDEX IX_password_reset_tokens_token ON password_reset_tokens(token);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_password_reset_tokens_expires_at' AND object_id = OBJECT_ID('password_reset_tokens'))
  CREATE INDEX IX_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);
GO
