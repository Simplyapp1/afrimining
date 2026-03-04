-- Task activity: progress updates (with timestamp), comments, reminders. Run with: node scripts/run-tasks-activity.js

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'task_progress_updates')
CREATE TABLE task_progress_updates (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  task_id UNIQUEIDENTIFIER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE NO ACTION,
  progress INT NOT NULL,
  note NVARCHAR(MAX) NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT CK_task_progress_updates_pct CHECK (progress >= 0 AND progress <= 100)
);
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'task_comments')
CREATE TABLE task_comments (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  task_id UNIQUEIDENTIFIER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE NO ACTION,
  body NVARCHAR(MAX) NOT NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'task_reminders')
CREATE TABLE task_reminders (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  task_id UNIQUEIDENTIFIER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE NO ACTION,
  remind_at DATETIME2 NOT NULL,
  note NVARCHAR(500) NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  dismissed_at DATETIME2 NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_task_progress_updates_task_id' AND object_id = OBJECT_ID('task_progress_updates'))
  CREATE INDEX IX_task_progress_updates_task_id ON task_progress_updates(task_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_task_comments_task_id' AND object_id = OBJECT_ID('task_comments'))
  CREATE INDEX IX_task_comments_task_id ON task_comments(task_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_task_reminders_task_id' AND object_id = OBJECT_ID('task_reminders'))
  CREATE INDEX IX_task_reminders_task_id ON task_reminders(task_id);
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'task_comment_attachments')
CREATE TABLE task_comment_attachments (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  task_comment_id UNIQUEIDENTIFIER NOT NULL REFERENCES task_comments(id) ON DELETE CASCADE,
  file_name NVARCHAR(500) NOT NULL,
  file_path NVARCHAR(1000) NOT NULL,
  uploaded_by UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE NO ACTION,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_task_reminders_remind_at' AND object_id = OBJECT_ID('task_reminders'))
  CREATE INDEX IX_task_reminders_remind_at ON task_reminders(remind_at);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_task_comment_attachments_comment_id' AND object_id = OBJECT_ID('task_comment_attachments'))
  CREATE INDEX IX_task_comment_attachments_comment_id ON task_comment_attachments(task_comment_id);
GO
