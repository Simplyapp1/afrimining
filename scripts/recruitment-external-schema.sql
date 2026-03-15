-- External job application: invite links and external applications.
-- Run: node scripts/run-recruitment-external-schema.js

-- Invite links: internal users create a link per vacancy to share with applicants
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'recruitment_applicant_invites')
CREATE TABLE recruitment_applicant_invites (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  vacancy_id UNIQUEIDENTIFIER NOT NULL,
  token NVARCHAR(64) NOT NULL,
  label NVARCHAR(500) NULL,
  created_by_user_id UNIQUEIDENTIFIER NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  expires_at DATETIME2 NULL,
  CONSTRAINT UQ_recruitment_applicant_invites_token UNIQUE (token),
  CONSTRAINT FK_recruitment_applicant_invites_vacancy FOREIGN KEY (vacancy_id) REFERENCES recruitment_vacancies(id)
);
GO

-- External applications: submissions from the public apply page (one per applicant per invite/vacancy)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'recruitment_external_applications')
CREATE TABLE recruitment_external_applications (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  invite_id UNIQUEIDENTIFIER NOT NULL,
  vacancy_id UNIQUEIDENTIFIER NOT NULL,
  name NVARCHAR(500) NOT NULL,
  email NVARCHAR(500) NOT NULL,
  phone NVARCHAR(100) NULL,
  id_number NVARCHAR(100) NULL,
  address NVARCHAR(MAX) NULL,
  cv_file_path NVARCHAR(2000) NULL,
  cover_letter_path NVARCHAR(2000) NULL,
  qualifications_path NVARCHAR(2000) NULL,
  id_document_path NVARCHAR(2000) NULL,
  academic_record_path NVARCHAR(2000) NULL,
  status NVARCHAR(50) NOT NULL DEFAULT N'submitted',
  reviewer_score DECIMAL(5,2) NULL,
  reviewer_notes NVARCHAR(MAX) NULL,
  ai_score DECIMAL(5,2) NULL,
  ai_notes NVARCHAR(MAX) NULL,
  applicant_id UNIQUEIDENTIFIER NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_recruitment_external_applications_invite FOREIGN KEY (invite_id) REFERENCES recruitment_applicant_invites(id),
  CONSTRAINT FK_recruitment_external_applications_vacancy FOREIGN KEY (vacancy_id) REFERENCES recruitment_vacancies(id),
  CONSTRAINT FK_recruitment_external_applications_applicant FOREIGN KEY (applicant_id) REFERENCES recruitment_applicants(id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_recruitment_applicant_invites_vacancy' AND object_id = OBJECT_ID('recruitment_applicant_invites'))
  CREATE INDEX IX_recruitment_applicant_invites_vacancy ON recruitment_applicant_invites(vacancy_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_recruitment_external_applications_vacancy' AND object_id = OBJECT_ID('recruitment_external_applications'))
  CREATE INDEX IX_recruitment_external_applications_vacancy ON recruitment_external_applications(vacancy_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_recruitment_external_applications_invite' AND object_id = OBJECT_ID('recruitment_external_applications'))
  CREATE INDEX IX_recruitment_external_applications_invite ON recruitment_external_applications(invite_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_recruitment_external_applications_status' AND object_id = OBJECT_ID('recruitment_external_applications'))
  CREATE INDEX IX_recruitment_external_applications_status ON recruitment_external_applications(status);
GO
