-- Add starting_point, destination to routes; add alert_types to route rectors (factors).
-- Run: node scripts/run-access-management-rectors.js

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_routes') AND name = 'starting_point')
  ALTER TABLE contractor_routes ADD starting_point NVARCHAR(255) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('contractor_routes') AND name = 'destination')
  ALTER TABLE contractor_routes ADD destination NVARCHAR(255) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('access_route_factors') AND name = 'alert_types')
  ALTER TABLE access_route_factors ADD alert_types NVARCHAR(500) NULL;
GO

-- Optional: extra contact fields for full contact details
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('access_route_factors') AND name = 'address')
  ALTER TABLE access_route_factors ADD address NVARCHAR(500) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('access_route_factors') AND name = 'mobile_alt')
  ALTER TABLE access_route_factors ADD mobile_alt NVARCHAR(100) NULL;
GO
