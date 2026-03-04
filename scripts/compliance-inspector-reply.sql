-- Inspector/Command Centre reply to contractor feedback on compliance inspections.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('cc_compliance_inspections') AND name = 'inspector_reply_text')
  ALTER TABLE cc_compliance_inspections ADD inspector_reply_text NVARCHAR(MAX) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('cc_compliance_inspections') AND name = 'inspector_replied_at')
  ALTER TABLE cc_compliance_inspections ADD inspector_replied_at DATETIME2 NULL;
GO
