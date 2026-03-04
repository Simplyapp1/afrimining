-- Attachments for contractor responses to compliance inspections.
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'compliance_response_attachments')
CREATE TABLE compliance_response_attachments (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  compliance_inspection_id UNIQUEIDENTIFIER NOT NULL,
  tenant_id UNIQUEIDENTIFIER NOT NULL,
  file_name NVARCHAR(255) NOT NULL,
  stored_path NVARCHAR(500) NOT NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_compliance_response_att_inspection FOREIGN KEY (compliance_inspection_id) REFERENCES cc_compliance_inspections(id) ON DELETE CASCADE,
  CONSTRAINT FK_compliance_response_att_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE NO ACTION
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_compliance_response_att_inspection' AND object_id = OBJECT_ID('compliance_response_attachments'))
  CREATE INDEX IX_compliance_response_att_inspection ON compliance_response_attachments(compliance_inspection_id);
GO
