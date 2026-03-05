-- Tasks Library: folders and files. Run with: node scripts/run-tasks-library-schema.js

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'task_library_folders')
CREATE TABLE task_library_folders (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  parent_id UNIQUEIDENTIFIER NULL,
  name NVARCHAR(255) NOT NULL,
  created_by UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE NO ACTION,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_task_library_folders_parent FOREIGN KEY (parent_id) REFERENCES task_library_folders(id) ON DELETE NO ACTION
);
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'task_library_files')
CREATE TABLE task_library_files (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  folder_id UNIQUEIDENTIFIER NULL,
  file_name NVARCHAR(500) NOT NULL,
  file_path NVARCHAR(1000) NOT NULL,
  file_size INT NULL,
  created_by UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE NO ACTION,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_task_library_files_folder FOREIGN KEY (folder_id) REFERENCES task_library_folders(id) ON DELETE NO ACTION
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_task_library_folders_tenant' AND object_id = OBJECT_ID('task_library_folders'))
  CREATE INDEX IX_task_library_folders_tenant ON task_library_folders(tenant_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_task_library_folders_parent' AND object_id = OBJECT_ID('task_library_folders'))
  CREATE INDEX IX_task_library_folders_parent ON task_library_folders(parent_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_task_library_files_tenant' AND object_id = OBJECT_ID('task_library_files'))
  CREATE INDEX IX_task_library_files_tenant ON task_library_files(tenant_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_task_library_files_folder' AND object_id = OBJECT_ID('task_library_files'))
  CREATE INDEX IX_task_library_files_folder ON task_library_files(folder_id);
GO
