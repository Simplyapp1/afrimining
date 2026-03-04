-- Expand contractor_incidents: actions_taken, attachment paths
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
END
GO
