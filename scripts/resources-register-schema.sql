-- Resources register: fixed assets + inventory + rich attachments & stock ledger.
-- Run: npm run db:resources-register

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'resources_assets')
CREATE TABLE resources_assets (
  id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  asset_type NVARCHAR(40) NOT NULL,
  name NVARCHAR(500) NOT NULL,
  asset_code NVARCHAR(120) NULL,
  description NVARCHAR(MAX) NULL,
  status NVARCHAR(40) NOT NULL DEFAULT N'active',
  location_label NVARCHAR(500) NULL,
  site_code NVARCHAR(120) NULL,
  acquired_date DATE NULL,
  cost_value DECIMAL(18,2) NULL,
  currency_code NVARCHAR(10) NULL DEFAULT N'ZAR',
  supplier_name NVARCHAR(500) NULL,
  serial_number NVARCHAR(200) NULL,
  manufacturer NVARCHAR(300) NULL,
  model NVARCHAR(300) NULL,
  registration_number NVARCHAR(80) NULL,
  vin NVARCHAR(80) NULL,
  year_of_manufacture INT NULL,
  odometer_km INT NULL,
  fuel_type NVARCHAR(80) NULL,
  insurance_policy_ref NVARCHAR(200) NULL,
  insurance_expiry_date DATE NULL,
  license_disc_expiry_date DATE NULL,
  warranty_expiry_date DATE NULL,
  certification_name NVARCHAR(300) NULL,
  certification_expiry_date DATE NULL,
  building_or_structure NVARCHAR(500) NULL,
  trade_category NVARCHAR(200) NULL,
  lifting_capacity_t DECIMAL(10,2) NULL,
  height_restriction_m DECIMAL(10,2) NULL,
  compliance_notes NVARCHAR(MAX) NULL,
  maintenance_interval_days INT NULL,
  maintenance_interval_hours INT NULL,
  last_maintenance_date DATE NULL,
  next_maintenance_due_date DATE NULL,
  renewal_reminder_date DATE NULL,
  custom_fields_json NVARCHAR(MAX) NULL,
  created_by UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE NO ACTION,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT CK_resources_assets_type CHECK (asset_type IN (N'equipment', N'vehicle', N'building_construction')),
  CONSTRAINT CK_resources_assets_status CHECK (status IN (N'active', N'in_service', N'standby', N'under_repair', N'retired', N'disposed'))
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_resources_assets_tenant' AND object_id = OBJECT_ID('resources_assets'))
  CREATE INDEX IX_resources_assets_tenant ON resources_assets(tenant_id, asset_type, created_at DESC);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'resources_inventory_items')
CREATE TABLE resources_inventory_items (
  id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sku NVARCHAR(120) NULL,
  name NVARCHAR(500) NOT NULL,
  description NVARCHAR(MAX) NULL,
  category NVARCHAR(80) NOT NULL DEFAULT N'other',
  unit NVARCHAR(40) NOT NULL DEFAULT N'ea',
  quantity_on_hand DECIMAL(18,4) NOT NULL DEFAULT 0,
  reorder_level DECIMAL(18,4) NULL,
  economic_order_qty DECIMAL(18,4) NULL,
  storage_zone NVARCHAR(200) NULL,
  storage_bin NVARCHAR(120) NULL,
  default_supplier NVARCHAR(500) NULL,
  manufacturer NVARCHAR(300) NULL,
  part_number NVARCHAR(200) NULL,
  hazard_class NVARCHAR(120) NULL,
  shelf_life_days INT NULL,
  received_date DATE NULL,
  last_count_date DATE NULL,
  batch_tracking BIT NOT NULL DEFAULT 0,
  standard_unit_cost DECIMAL(18,4) NULL,
  currency_code NVARCHAR(10) NULL DEFAULT N'ZAR',
  expiry_date DATE NULL,
  renewal_reminder_date DATE NULL,
  maintenance_interval_days INT NULL,
  next_review_date DATE NULL,
  notes NVARCHAR(MAX) NULL,
  created_by UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE NO ACTION,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT CK_resources_inv_category CHECK (category IN (
    N'raw_materials', N'consumables', N'spare_parts', N'tools', N'ppe', N'electrical', N'plumbing', N'structural', N'finishes', N'other'
  ))
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_resources_inventory_tenant' AND object_id = OBJECT_ID('resources_inventory_items'))
  CREATE INDEX IX_resources_inventory_tenant ON resources_inventory_items(tenant_id, category, name);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'resources_inventory_movements')
CREATE TABLE resources_inventory_movements (
  id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE NO ACTION,
  inventory_item_id UNIQUEIDENTIFIER NOT NULL REFERENCES resources_inventory_items(id) ON DELETE CASCADE,
  movement_type NVARCHAR(40) NOT NULL,
  quantity_delta DECIMAL(18,4) NOT NULL,
  unit_cost DECIMAL(18,4) NULL,
  reference_no NVARCHAR(200) NULL,
  supplier NVARCHAR(500) NULL,
  batch_code NVARCHAR(120) NULL,
  expiry_date DATE NULL,
  notes NVARCHAR(MAX) NULL,
  movement_date DATE NOT NULL DEFAULT CAST(SYSUTCDATETIME() AS DATE),
  created_by UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE NO ACTION,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT CK_resources_inv_mov_type CHECK (movement_type IN (N'receive', N'issue', N'adjust_in', N'adjust_out', N'transfer', N'count'))
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_resources_inv_mov_item' AND object_id = OBJECT_ID('resources_inventory_movements'))
  CREATE INDEX IX_resources_inv_mov_item ON resources_inventory_movements(inventory_item_id, movement_date DESC);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'resources_attachments')
CREATE TABLE resources_attachments (
  id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type NVARCHAR(40) NOT NULL,
  entity_id UNIQUEIDENTIFIER NOT NULL,
  file_name NVARCHAR(500) NOT NULL,
  display_name NVARCHAR(500) NOT NULL,
  file_path NVARCHAR(1000) NOT NULL,
  mime_type NVARCHAR(200) NULL,
  file_size_bytes BIGINT NULL,
  document_category NVARCHAR(120) NULL,
  expiry_date DATE NULL,
  renewal_date DATE NULL,
  maintenance_interval_days INT NULL,
  notes NVARCHAR(MAX) NULL,
  uploaded_by UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE NO ACTION,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT CK_resources_att_entity CHECK (entity_type IN (N'asset', N'inventory_item'))
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_resources_att_entity' AND object_id = OBJECT_ID('resources_attachments'))
  CREATE INDEX IX_resources_att_entity ON resources_attachments(tenant_id, entity_type, entity_id, created_at DESC);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'resources_asset_service_events')
CREATE TABLE resources_asset_service_events (
  id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE NO ACTION,
  asset_id UNIQUEIDENTIFIER NOT NULL REFERENCES resources_assets(id) ON DELETE CASCADE,
  event_type NVARCHAR(40) NOT NULL,
  performed_at DATE NOT NULL,
  meter_reading_km INT NULL,
  meter_reading_hours INT NULL,
  vendor_name NVARCHAR(500) NULL,
  cost_value DECIMAL(18,2) NULL,
  next_due_date DATE NULL,
  description NVARCHAR(MAX) NULL,
  created_by UNIQUEIDENTIFIER NOT NULL REFERENCES users(id) ON DELETE NO ACTION,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT CK_resources_asset_evt_type CHECK (event_type IN (N'maintenance', N'inspection', N'repair', N'calibration', N'certification', N'other'))
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_resources_asset_evt_asset' AND object_id = OBJECT_ID('resources_asset_service_events'))
  CREATE INDEX IX_resources_asset_evt_asset ON resources_asset_service_events(asset_id, performed_at DESC);
GO
