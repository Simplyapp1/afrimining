-- Library uploaded documents (shared by tenant). Run: npm run db:command-centre-library-documents

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'command_centre_library_documents')
BEGIN
  CREATE TABLE command_centre_library_documents (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    user_id UNIQUEIDENTIFIER NOT NULL,
    file_name NVARCHAR(500) NOT NULL,
    stored_path NVARCHAR(1000) NOT NULL,
    mime_type NVARCHAR(200) NULL,
    file_size BIGINT NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_cc_lib_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION ON UPDATE NO ACTION
  );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_cc_lib_user' AND object_id = OBJECT_ID('command_centre_library_documents'))
  CREATE INDEX IX_cc_lib_user ON command_centre_library_documents(user_id);
GO
