-- Failed sign-in lockout (3 wrong passwords → locked until super admin unlocks).
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'users') AND name = N'login_failed_attempts')
  ALTER TABLE users ADD login_failed_attempts INT NOT NULL DEFAULT 0;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'users') AND name = N'login_locked_at')
  ALTER TABLE users ADD login_locked_at DATETIME2 NULL;
GO
