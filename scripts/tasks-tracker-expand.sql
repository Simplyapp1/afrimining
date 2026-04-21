-- Tasks Tracker: priority, times, labels, comment visibility, progress entry types, recurring reminders.
-- Run: node scripts/run-tasks-tracker-expand.js

IF COL_LENGTH('dbo.tasks', 'priority') IS NULL
  ALTER TABLE dbo.tasks ADD priority NVARCHAR(20) NULL;
GO

IF COL_LENGTH('dbo.tasks', 'start_time') IS NULL
  ALTER TABLE dbo.tasks ADD start_time TIME NULL;
GO

IF COL_LENGTH('dbo.tasks', 'due_time') IS NULL
  ALTER TABLE dbo.tasks ADD due_time TIME NULL;
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'task_labels' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.task_labels (
    id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    task_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.tasks(id) ON DELETE CASCADE,
    label NVARCHAR(120) NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_task_labels_task_id ON dbo.task_labels(task_id);
END
GO

-- task_comments.visibility: separate batches so SQL Server sees new column before UPDATE/ALTER.
IF OBJECT_ID('dbo.task_comments', 'U') IS NOT NULL AND COL_LENGTH('dbo.task_comments', 'visibility') IS NULL
  ALTER TABLE dbo.task_comments ADD visibility NVARCHAR(30) NULL;
GO

IF OBJECT_ID('dbo.task_comments', 'U') IS NOT NULL AND COL_LENGTH('dbo.task_comments', 'visibility') IS NOT NULL
  UPDATE dbo.task_comments SET visibility = N'all' WHERE visibility IS NULL;
GO

IF OBJECT_ID('dbo.task_comments', 'U') IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM sys.columns c
    WHERE c.object_id = OBJECT_ID('dbo.task_comments') AND c.name = N'visibility' AND c.is_nullable = 1
  )
  ALTER TABLE dbo.task_comments ALTER COLUMN visibility NVARCHAR(30) NOT NULL;
GO

IF OBJECT_ID('dbo.task_progress_updates', 'U') IS NOT NULL AND COL_LENGTH('dbo.task_progress_updates', 'entry_type') IS NULL
  ALTER TABLE dbo.task_progress_updates ADD entry_type NVARCHAR(40) NULL;
GO

IF OBJECT_ID('dbo.task_progress_updates', 'U') IS NOT NULL AND COL_LENGTH('dbo.task_progress_updates', 'entry_type') IS NOT NULL
  UPDATE dbo.task_progress_updates SET entry_type = N'progress' WHERE entry_type IS NULL;
GO

IF OBJECT_ID('dbo.task_progress_updates', 'U') IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM sys.columns c
    WHERE c.object_id = OBJECT_ID('dbo.task_progress_updates') AND c.name = N'entry_type' AND c.is_nullable = 1
  )
  ALTER TABLE dbo.task_progress_updates ALTER COLUMN entry_type NVARCHAR(40) NOT NULL;
GO

IF OBJECT_ID('dbo.task_reminders', 'U') IS NOT NULL AND COL_LENGTH('dbo.task_reminders', 'recurrence') IS NULL
  ALTER TABLE dbo.task_reminders ADD recurrence NVARCHAR(20) NULL;
GO

IF OBJECT_ID('dbo.task_reminders', 'U') IS NOT NULL AND COL_LENGTH('dbo.task_reminders', 'recurrence') IS NOT NULL
  UPDATE dbo.task_reminders SET recurrence = N'none' WHERE recurrence IS NULL;
GO

IF OBJECT_ID('dbo.task_reminders', 'U') IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM sys.columns c
    WHERE c.object_id = OBJECT_ID('dbo.task_reminders') AND c.name = N'recurrence' AND c.is_nullable = 1
  )
  ALTER TABLE dbo.task_reminders ALTER COLUMN recurrence NVARCHAR(20) NOT NULL;
GO

IF OBJECT_ID('dbo.task_reminders', 'U') IS NOT NULL AND COL_LENGTH('dbo.task_reminders', 'next_fire_at') IS NULL
  ALTER TABLE dbo.task_reminders ADD next_fire_at DATETIME2 NULL;
GO

IF OBJECT_ID('dbo.task_reminders', 'U') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_task_reminders_next_fire' AND object_id = OBJECT_ID('dbo.task_reminders'))
BEGIN
  CREATE INDEX IX_task_reminders_next_fire ON dbo.task_reminders(next_fire_at);
END
GO

IF OBJECT_ID('dbo.task_reminders', 'U') IS NOT NULL
  UPDATE dbo.task_reminders SET next_fire_at = remind_at WHERE next_fire_at IS NULL AND dismissed_at IS NULL;
GO
