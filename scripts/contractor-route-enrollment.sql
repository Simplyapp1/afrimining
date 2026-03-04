-- Fleet and driver enrollment: routes and per-route truck/driver enrollment.
-- Only approved (facility_access) trucks/drivers can be enrolled; suspended ones are excluded.
-- Run: node scripts/run-contractor-route-enrollment.js

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'contractor_routes')
CREATE TABLE contractor_routes (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name NVARCHAR(255) NOT NULL,
  [order] INT NOT NULL DEFAULT 0,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_contractor_routes_tenant' AND object_id = OBJECT_ID('contractor_routes'))
  CREATE INDEX IX_contractor_routes_tenant ON contractor_routes(tenant_id);
GO

-- Trucks enrolled on a route (same truck can be on multiple routes). NO ACTION on truck_id to avoid multiple cascade paths.
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'contractor_route_trucks')
CREATE TABLE contractor_route_trucks (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  route_id UNIQUEIDENTIFIER NOT NULL REFERENCES contractor_routes(id) ON DELETE CASCADE,
  truck_id UNIQUEIDENTIFIER NOT NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT UQ_contractor_route_trucks_route_truck UNIQUE (route_id, truck_id),
  CONSTRAINT FK_contractor_route_trucks_truck FOREIGN KEY (truck_id) REFERENCES contractor_trucks(id) ON DELETE NO ACTION
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_contractor_route_trucks_route' AND object_id = OBJECT_ID('contractor_route_trucks'))
  CREATE INDEX IX_contractor_route_trucks_route ON contractor_route_trucks(route_id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_contractor_route_trucks_truck' AND object_id = OBJECT_ID('contractor_route_trucks'))
  CREATE INDEX IX_contractor_route_trucks_truck ON contractor_route_trucks(truck_id);
GO

-- Drivers enrolled on a route (same driver can be on multiple routes). NO ACTION on driver_id to avoid multiple cascade paths.
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'contractor_route_drivers')
CREATE TABLE contractor_route_drivers (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  route_id UNIQUEIDENTIFIER NOT NULL REFERENCES contractor_routes(id) ON DELETE CASCADE,
  driver_id UNIQUEIDENTIFIER NOT NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT UQ_contractor_route_drivers_route_driver UNIQUE (route_id, driver_id),
  CONSTRAINT FK_contractor_route_drivers_driver FOREIGN KEY (driver_id) REFERENCES contractor_drivers(id) ON DELETE NO ACTION
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_contractor_route_drivers_route' AND object_id = OBJECT_ID('contractor_route_drivers'))
  CREATE INDEX IX_contractor_route_drivers_route ON contractor_route_drivers(route_id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_contractor_route_drivers_driver' AND object_id = OBJECT_ID('contractor_route_drivers'))
  CREATE INDEX IX_contractor_route_drivers_driver ON contractor_route_drivers(driver_id);
GO
