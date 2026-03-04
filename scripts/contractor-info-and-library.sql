-- Contractor information, subcontractors, and document library.
-- Run with: node scripts/run-contractor-info-and-library.js

-- Contractor details (one row per tenant): company, CIPC, admin, control room, mechanic, emergency contacts
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'contractor_info')
CREATE TABLE contractor_info (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  tenant_id UNIQUEIDENTIFIER NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  company_name NVARCHAR(255) NULL,
  cipc_registration_number NVARCHAR(100) NULL,
  cipc_registration_date DATE NULL,
  admin_name NVARCHAR(255) NULL,
  admin_email NVARCHAR(255) NULL,
  admin_phone NVARCHAR(50) NULL,
  control_room_contact NVARCHAR(255) NULL,
  control_room_phone NVARCHAR(50) NULL,
  control_room_email NVARCHAR(255) NULL,
  mechanic_name NVARCHAR(255) NULL,
  mechanic_phone NVARCHAR(50) NULL,
  mechanic_email NVARCHAR(255) NULL,
  emergency_contact_1_name NVARCHAR(255) NULL,
  emergency_contact_1_phone NVARCHAR(50) NULL,
  emergency_contact_2_name NVARCHAR(255) NULL,
  emergency_contact_2_phone NVARCHAR(50) NULL,
  emergency_contact_3_name NVARCHAR(255) NULL,
  emergency_contact_3_phone NVARCHAR(50) NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

-- Subcontractors (multiple per tenant)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'contractor_subcontractors')
CREATE TABLE contractor_subcontractors (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_name NVARCHAR(255) NOT NULL,
  contact_person NVARCHAR(255) NULL,
  contact_phone NVARCHAR(50) NULL,
  contact_email NVARCHAR(255) NULL,
  control_room_contact NVARCHAR(255) NULL,
  control_room_phone NVARCHAR(50) NULL,
  mechanic_name NVARCHAR(255) NULL,
  mechanic_phone NVARCHAR(50) NULL,
  emergency_contact_name NVARCHAR(255) NULL,
  emergency_contact_phone NVARCHAR(50) NULL,
  [order_index] INT NOT NULL DEFAULT 0,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_contractor_subcontractors_tenant' AND object_id = OBJECT_ID('contractor_subcontractors'))
  CREATE INDEX IX_contractor_subcontractors_tenant ON contractor_subcontractors(tenant_id);
GO

-- Contractor library documents (uploaded files by document type)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'contractor_library_documents')
CREATE TABLE contractor_library_documents (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_type NVARCHAR(100) NOT NULL,
  file_name NVARCHAR(255) NOT NULL,
  stored_path NVARCHAR(500) NOT NULL,
  file_size INT NULL,
  mime_type NVARCHAR(100) NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_contractor_library_tenant' AND object_id = OBJECT_ID('contractor_library_documents'))
  CREATE INDEX IX_contractor_library_tenant ON contractor_library_documents(tenant_id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_contractor_library_type' AND object_id = OBJECT_ID('contractor_library_documents'))
  CREATE INDEX IX_contractor_library_type ON contractor_library_documents(tenant_id, document_type);
GO
