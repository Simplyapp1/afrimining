-- Resolution note and offloading slip for incidents
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'contractor_incidents')
BEGIN
  IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('contractor_incidents') AND name = 'resolution_note')
    ALTER TABLE contractor_incidents ADD resolution_note NVARCHAR(MAX) NULL;
  IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('contractor_incidents') AND name = 'offloading_slip_path')
    ALTER TABLE contractor_incidents ADD offloading_slip_path NVARCHAR(500) NULL;
END
GO
