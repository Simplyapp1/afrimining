-- Add location and route_id to contractor_incidents (breakdown/incidents form).
-- Run: node scripts/run-contractor-incidents-location-route.js

IF EXISTS (SELECT * FROM sys.tables WHERE name = 'contractor_incidents')
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_incidents') AND name = 'location')
    ALTER TABLE contractor_incidents ADD location NVARCHAR(500) NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_incidents') AND name = 'route_id')
    ALTER TABLE contractor_incidents ADD route_id UNIQUEIDENTIFIER NULL;
END
GO

IF EXISTS (SELECT * FROM sys.tables WHERE name = 'contractor_incidents')
  IF EXISTS (SELECT * FROM sys.tables WHERE name = 'contractor_routes')
    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_contractor_incidents_route' AND parent_object_id = OBJECT_ID('contractor_incidents'))
      ALTER TABLE contractor_incidents ADD CONSTRAINT FK_contractor_incidents_route
        FOREIGN KEY (route_id) REFERENCES contractor_routes(id) ON DELETE NO ACTION ON UPDATE NO ACTION;
GO
