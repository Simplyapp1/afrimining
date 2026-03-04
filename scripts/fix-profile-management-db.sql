-- One-time fix: work_schedules.user_id + leave_balance FK cascade paths. Run with: node scripts/run-fix-profile-management-db.js

-- 1a. Add user_id column to work_schedules if missing (must be in its own batch so later batches see the column)
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'work_schedules')
   AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('work_schedules') AND name = 'user_id')
  ALTER TABLE work_schedules ADD user_id UNIQUEIDENTIFIER NULL;
GO

-- 1b. Backfill and enforce user_id on work_schedules
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'work_schedules')
   AND EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('work_schedules') AND name = 'user_id')
BEGIN
  UPDATE work_schedules SET user_id = created_by WHERE user_id IS NULL;
  ALTER TABLE work_schedules ALTER COLUMN user_id UNIQUEIDENTIFIER NOT NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_work_schedules_user')
    ALTER TABLE work_schedules ADD CONSTRAINT FK_work_schedules_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION;
END
GO

-- 1c. Drop user_id from work_schedule_entries (entries belong to schedule; schedule has user_id)
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'work_schedule_entries')
   AND EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('work_schedule_entries') AND name = 'user_id')
BEGIN
  DECLARE @entfk NVARCHAR(128);
  DECLARE @entsql NVARCHAR(500);
  DECLARE entcur CURSOR FOR
    SELECT fk.name FROM sys.foreign_keys fk
    INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
    WHERE fk.parent_object_id = OBJECT_ID('work_schedule_entries')
      AND COL_NAME(fkc.parent_object_id, fkc.parent_column_id) = 'user_id';
  OPEN entcur;
  FETCH NEXT FROM entcur INTO @entfk;
  WHILE @@FETCH_STATUS = 0
  BEGIN
    SET @entsql = 'ALTER TABLE work_schedule_entries DROP CONSTRAINT ' + QUOTENAME(@entfk);
    EXEC sp_executesql @entsql;
    FETCH NEXT FROM entcur INTO @entfk;
  END
  CLOSE entcur;
  DEALLOCATE entcur;
  ALTER TABLE work_schedule_entries DROP COLUMN user_id;
END
GO

-- 2. Create index on work_schedules.user_id if missing
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'work_schedules')
   AND EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('work_schedules') AND name = 'user_id')
   AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_work_schedules_user' AND object_id = OBJECT_ID('work_schedules'))
  CREATE INDEX IX_work_schedules_user ON work_schedules(user_id);
GO

-- 3. Fix leave_balance: drop FKs that cause cascade paths, re-add with NO ACTION (only if table has user_id and tenant_id)
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'leave_balance')
   AND EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leave_balance') AND name = 'user_id')
   AND EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leave_balance') AND name = 'tenant_id')
BEGIN
  DECLARE @fkname NVARCHAR(128);
  DECLARE @sql NVARCHAR(500);
  DECLARE fkcur CURSOR FOR
    SELECT fk.name FROM sys.foreign_keys fk
    WHERE fk.parent_object_id = OBJECT_ID('leave_balance')
      AND fk.referenced_object_id IN (OBJECT_ID('users'), OBJECT_ID('tenants'));
  OPEN fkcur;
  FETCH NEXT FROM fkcur INTO @fkname;
  WHILE @@FETCH_STATUS = 0
  BEGIN
    SET @sql = 'ALTER TABLE leave_balance DROP CONSTRAINT ' + QUOTENAME(@fkname);
    EXEC sp_executesql @sql;
    FETCH NEXT FROM fkcur INTO @fkname;
  END
  CLOSE fkcur;
  DEALLOCATE fkcur;

  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_leave_balance_user' AND parent_object_id = OBJECT_ID('leave_balance'))
    ALTER TABLE leave_balance ADD CONSTRAINT FK_leave_balance_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION;
  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_leave_balance_tenant' AND parent_object_id = OBJECT_ID('leave_balance'))
    ALTER TABLE leave_balance ADD CONSTRAINT FK_leave_balance_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE NO ACTION;
END
GO
