-- Expand contractor_trucks and contractor_drivers (run once: npm run db:contractor-expand)
-- Trucks: main/sub contractor, year, ownership, fleet no, trailers, tracking
-- Drivers: surname, ID number

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_trucks') AND name = 'main_contractor')
  ALTER TABLE contractor_trucks ADD main_contractor NVARCHAR(255) NULL;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_trucks') AND name = 'sub_contractor')
  ALTER TABLE contractor_trucks ADD sub_contractor NVARCHAR(255) NULL;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_trucks') AND name = 'year_model')
  ALTER TABLE contractor_trucks ADD year_model NVARCHAR(20) NULL;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_trucks') AND name = 'ownership_desc')
  ALTER TABLE contractor_trucks ADD ownership_desc NVARCHAR(255) NULL;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_trucks') AND name = 'fleet_no')
  ALTER TABLE contractor_trucks ADD fleet_no NVARCHAR(50) NULL;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_trucks') AND name = 'trailer_1_reg_no')
  ALTER TABLE contractor_trucks ADD trailer_1_reg_no NVARCHAR(50) NULL;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_trucks') AND name = 'trailer_2_reg_no')
  ALTER TABLE contractor_trucks ADD trailer_2_reg_no NVARCHAR(50) NULL;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_trucks') AND name = 'tracking_provider')
  ALTER TABLE contractor_trucks ADD tracking_provider NVARCHAR(255) NULL;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_trucks') AND name = 'tracking_username')
  ALTER TABLE contractor_trucks ADD tracking_username NVARCHAR(255) NULL;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_trucks') AND name = 'tracking_password')
  ALTER TABLE contractor_trucks ADD tracking_password NVARCHAR(255) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_drivers') AND name = 'surname')
  ALTER TABLE contractor_drivers ADD surname NVARCHAR(255) NULL;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_drivers') AND name = 'id_number')
  ALTER TABLE contractor_drivers ADD id_number NVARCHAR(50) NULL;
