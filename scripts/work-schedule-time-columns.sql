-- Add clock times to work schedule entries (time-based display vs day/night only).
-- Idempotent. Run: npm run db:work-schedule-times
--
-- Batch 1 only adds columns: SQL Server cannot reference new columns later in the same batch.

IF EXISTS (SELECT 1 FROM sys.tables WHERE name = N'work_schedule_entries')
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'work_schedule_entries') AND name = N'work_start_time')
    ALTER TABLE work_schedule_entries ADD work_start_time TIME NULL, work_end_time TIME NULL;
END
GO

IF EXISTS (SELECT 1 FROM sys.tables WHERE name = N'work_schedule_entries')
  AND EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'work_schedule_entries') AND name = N'work_start_time')
BEGIN
  -- Backfill from legacy shift_type before tightening CHECK / NOT NULL
  UPDATE work_schedule_entries
  SET work_start_time = CAST('06:00' AS TIME), work_end_time = CAST('18:00' AS TIME)
  WHERE shift_type = N'day' AND work_start_time IS NULL;

  UPDATE work_schedule_entries
  SET work_start_time = CAST('18:00' AS TIME), work_end_time = CAST('06:00' AS TIME)
  WHERE shift_type = N'night' AND work_start_time IS NULL;

  UPDATE work_schedule_entries
  SET work_start_time = CAST('09:00' AS TIME), work_end_time = CAST('17:00' AS TIME)
  WHERE work_start_time IS NULL;

  UPDATE work_schedule_entries
  SET shift_type = N'custom'
  WHERE NOT (work_start_time = CAST('06:00' AS TIME) AND work_end_time = CAST('18:00' AS TIME))
    AND NOT (work_start_time = CAST('18:00' AS TIME) AND work_end_time = CAST('06:00' AS TIME));

  IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id = OBJECT_ID(N'work_schedule_entries') AND name = N'CK_shift_type')
    ALTER TABLE work_schedule_entries DROP CONSTRAINT CK_shift_type;

  IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id = OBJECT_ID(N'work_schedule_entries') AND name = N'CK_work_schedule_entries_shift_type')
    ALTER TABLE work_schedule_entries DROP CONSTRAINT CK_work_schedule_entries_shift_type;

  IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id = OBJECT_ID(N'work_schedule_entries') AND name = N'CK_work_schedule_entries_shift_type')
    ALTER TABLE work_schedule_entries WITH NOCHECK
    ADD CONSTRAINT CK_work_schedule_entries_shift_type CHECK (shift_type IN (N'day', N'night', N'custom'));

  ALTER TABLE work_schedule_entries CHECK CONSTRAINT CK_work_schedule_entries_shift_type;

  ALTER TABLE work_schedule_entries ALTER COLUMN work_start_time TIME NOT NULL;
  ALTER TABLE work_schedule_entries ALTER COLUMN work_end_time TIME NOT NULL;
END
GO
