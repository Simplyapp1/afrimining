-- Migrate work_schedules to per-employee (private). Run if work_schedules exists but has no user_id column.
-- Run with: node scripts/run-work-schedules-per-user-migrate.js

-- 1. Add user_id to work_schedules if missing
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'work_schedules')
   AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('work_schedules') AND name = 'user_id')
BEGIN
  ALTER TABLE work_schedules ADD user_id UNIQUEIDENTIFIER NULL;

  -- Backfill: from entries.user_id if that column exists, else from created_by
  IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('work_schedule_entries') AND name = 'user_id')
    UPDATE s SET s.user_id = (SELECT TOP 1 e.user_id FROM work_schedule_entries e WHERE e.work_schedule_id = s.id)
    FROM work_schedules s WHERE s.user_id IS NULL;

  UPDATE work_schedules SET user_id = created_by WHERE user_id IS NULL;

  ALTER TABLE work_schedules ALTER COLUMN user_id UNIQUEIDENTIFIER NOT NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_work_schedules_user')
    ALTER TABLE work_schedules ADD CONSTRAINT FK_work_schedules_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
END
GO

-- 3. Ensure index on user_id exists (for my-schedule and list by user)
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'work_schedules')
   AND EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('work_schedules') AND name = 'user_id')
   AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_work_schedules_user' AND object_id = OBJECT_ID('work_schedules'))
  CREATE INDEX IX_work_schedules_user ON work_schedules(user_id);
GO

-- 2. If entries had user_id, remove entries for other users then drop the column
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('work_schedule_entries') AND name = 'user_id')
BEGIN
  DELETE e FROM work_schedule_entries e
  INNER JOIN work_schedules s ON s.id = e.work_schedule_id
  WHERE e.user_id <> s.user_id;
  ALTER TABLE work_schedule_entries DROP COLUMN user_id;
END
GO
