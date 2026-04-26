-- Research questionnaire capture (Chapter 4): participants, values, scan images.
-- Run: npm run db:research-capture

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'research_participants')
CREATE TABLE research_participants (
  id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE NO ACTION,
  participant_code NVARCHAR(40) NOT NULL,
  status NVARCHAR(20) NOT NULL DEFAULT N'draft',
  notes NVARCHAR(MAX) NULL,
  last_scan_at DATETIME2 NULL,
  last_scan_model NVARCHAR(120) NULL,
  last_scan_response NVARCHAR(MAX) NULL,
  completed_at DATETIME2 NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT UQ_research_participant_code UNIQUE (tenant_id, participant_code),
  CONSTRAINT CK_research_participants_status CHECK (status IN (N'draft', N'complete'))
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_research_participants_tenant' AND object_id = OBJECT_ID('research_participants'))
CREATE INDEX IX_research_participants_tenant ON research_participants(tenant_id, created_at DESC);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'research_participant_values')
CREATE TABLE research_participant_values (
  participant_id UNIQUEIDENTIFIER NOT NULL REFERENCES research_participants(id) ON DELETE CASCADE,
  var_name NVARCHAR(5) NOT NULL,
  value_int INT NULL,
  updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_research_participant_values PRIMARY KEY (participant_id, var_name),
  CONSTRAINT CK_research_var_name CHECK (var_name LIKE N'V[0-9]%')
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'research_participant_images')
CREATE TABLE research_participant_images (
  id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  participant_id UNIQUEIDENTIFIER NOT NULL REFERENCES research_participants(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  file_path NVARCHAR(500) NOT NULL,
  mime_type NVARCHAR(80) NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_research_images_participant' AND object_id = OBJECT_ID('research_participant_images'))
CREATE INDEX IX_research_images_participant ON research_participant_images(participant_id, sort_order);
GO
