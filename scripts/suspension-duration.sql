-- Suspension duration: permanent or until a date.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_suspensions') AND name = 'is_permanent')
  ALTER TABLE contractor_suspensions ADD is_permanent BIT NOT NULL DEFAULT 1;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_suspensions') AND name = 'suspension_ends_at')
  ALTER TABLE contractor_suspensions ADD suspension_ends_at DATETIME2 NULL;
GO
