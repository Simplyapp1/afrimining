-- Ensure all contractor tables and columns exist (run after contractor-schema).
-- Run: npm run db:contractor-ensure

-- contractor_trucks: extended fields for form
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'contractor_trucks')
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_trucks') AND name = 'main_contractor') ALTER TABLE contractor_trucks ADD main_contractor NVARCHAR(255) NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_trucks') AND name = 'sub_contractor') ALTER TABLE contractor_trucks ADD sub_contractor NVARCHAR(255) NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_trucks') AND name = 'year_model') ALTER TABLE contractor_trucks ADD year_model NVARCHAR(20) NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_trucks') AND name = 'ownership_desc') ALTER TABLE contractor_trucks ADD ownership_desc NVARCHAR(255) NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_trucks') AND name = 'fleet_no') ALTER TABLE contractor_trucks ADD fleet_no NVARCHAR(50) NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_trucks') AND name = 'trailer_1_reg_no') ALTER TABLE contractor_trucks ADD trailer_1_reg_no NVARCHAR(50) NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_trucks') AND name = 'trailer_2_reg_no') ALTER TABLE contractor_trucks ADD trailer_2_reg_no NVARCHAR(50) NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_trucks') AND name = 'tracking_provider') ALTER TABLE contractor_trucks ADD tracking_provider NVARCHAR(255) NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_trucks') AND name = 'tracking_username') ALTER TABLE contractor_trucks ADD tracking_username NVARCHAR(255) NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_trucks') AND name = 'tracking_password') ALTER TABLE contractor_trucks ADD tracking_password NVARCHAR(255) NULL;
END
GO

-- contractor_drivers: extended fields
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'contractor_drivers')
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_drivers') AND name = 'surname') ALTER TABLE contractor_drivers ADD surname NVARCHAR(255) NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_drivers') AND name = 'id_number') ALTER TABLE contractor_drivers ADD id_number NVARCHAR(50) NULL;
END
GO

-- contractor_incidents: columns required for breakdown/incident form and resolve flow
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'contractor_incidents')
BEGIN
  IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('contractor_incidents') AND name = 'actions_taken')
    ALTER TABLE contractor_incidents ADD actions_taken NVARCHAR(MAX) NULL;
  IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('contractor_incidents') AND name = 'loading_slip_path')
    ALTER TABLE contractor_incidents ADD loading_slip_path NVARCHAR(500) NULL;
  IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('contractor_incidents') AND name = 'seal_1_path')
    ALTER TABLE contractor_incidents ADD seal_1_path NVARCHAR(500) NULL;
  IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('contractor_incidents') AND name = 'seal_2_path')
    ALTER TABLE contractor_incidents ADD seal_2_path NVARCHAR(500) NULL;
  IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('contractor_incidents') AND name = 'picture_problem_path')
    ALTER TABLE contractor_incidents ADD picture_problem_path NVARCHAR(500) NULL;
  IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('contractor_incidents') AND name = 'resolution_note')
    ALTER TABLE contractor_incidents ADD resolution_note NVARCHAR(MAX) NULL;
  IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('contractor_incidents') AND name = 'offloading_slip_path')
    ALTER TABLE contractor_incidents ADD offloading_slip_path NVARCHAR(500) NULL;
END
GO

-- contractor_expiries: issued date
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'contractor_expiries')
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_expiries') AND name = 'issued_date')
    ALTER TABLE contractor_expiries ADD issued_date DATE NULL;
END
GO
