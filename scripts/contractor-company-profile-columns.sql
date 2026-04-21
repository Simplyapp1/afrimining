-- Extended company profile on contractors (legal entities). Run: npm run db:contractor-company-profile
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'contractors')
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractors') AND name = 'description')
    ALTER TABLE contractors ADD description NVARCHAR(MAX) NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractors') AND name = 'trading_name')
    ALTER TABLE contractors ADD trading_name NVARCHAR(255) NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractors') AND name = 'vat_number')
    ALTER TABLE contractors ADD vat_number NVARCHAR(50) NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractors') AND name = 'company_registration')
    ALTER TABLE contractors ADD company_registration NVARCHAR(120) NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractors') AND name = 'website')
    ALTER TABLE contractors ADD website NVARCHAR(500) NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractors') AND name = 'primary_email')
    ALTER TABLE contractors ADD primary_email NVARCHAR(255) NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractors') AND name = 'primary_phone')
    ALTER TABLE contractors ADD primary_phone NVARCHAR(50) NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractors') AND name = 'physical_address')
    ALTER TABLE contractors ADD physical_address NVARCHAR(MAX) NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractors') AND name = 'sector')
    ALTER TABLE contractors ADD sector NVARCHAR(120) NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractors') AND name = 'cidb_registration')
    ALTER TABLE contractors ADD cidb_registration NVARCHAR(80) NULL;
END
GO
