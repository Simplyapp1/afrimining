-- Add SA ID (id_number) to users for forgot-password. Run with: node scripts/run-users-id-number.js

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('users') AND name = 'id_number')
  ALTER TABLE users ADD id_number NVARCHAR(50) NULL;
GO
