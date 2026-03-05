-- Backfill contractor_id for existing rows that have NULL (trucks/drivers added before multi-contractor).
-- For each tenant, we set contractor_id to the first contractor for that tenant (by name).
-- Run: node scripts/run-backfill-contractor-id.js
-- After this, previously added trucks/drivers will appear for the contractor-scoped users of that contractor.

-- Trucks: set contractor_id to first contractor per tenant where contractor_id IS NULL
UPDATE t
SET t.contractor_id = c.id
FROM contractor_trucks t
INNER JOIN (
  SELECT tenant_id, id,
    ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY name) AS rn
  FROM contractors
) c ON c.tenant_id = t.tenant_id AND c.rn = 1
WHERE t.contractor_id IS NULL;
GO

-- Drivers: same
UPDATE d
SET d.contractor_id = c.id
FROM contractor_drivers d
INNER JOIN (
  SELECT tenant_id, id,
    ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY name) AS rn
  FROM contractors
) c ON c.tenant_id = d.tenant_id AND c.rn = 1
WHERE d.contractor_id IS NULL;
GO

-- Incidents
UPDATE i
SET i.contractor_id = c.id
FROM contractor_incidents i
INNER JOIN (
  SELECT tenant_id, id,
    ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY name) AS rn
  FROM contractors
) c ON c.tenant_id = i.tenant_id AND c.rn = 1
WHERE i.contractor_id IS NULL;
GO

-- Expiries (if table exists)
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'contractor_expiries')
BEGIN
  UPDATE e SET e.contractor_id = c.id
  FROM contractor_expiries e
  INNER JOIN (SELECT tenant_id, id, ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY name) AS rn FROM contractors) c ON c.tenant_id = e.tenant_id AND c.rn = 1
  WHERE e.contractor_id IS NULL;
END
GO

-- Suspensions (if table exists)
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'contractor_suspensions')
BEGIN
  UPDATE s SET s.contractor_id = c.id
  FROM contractor_suspensions s
  INNER JOIN (SELECT tenant_id, id, ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY name) AS rn FROM contractors) c ON c.tenant_id = s.tenant_id AND c.rn = 1
  WHERE s.contractor_id IS NULL;
END
GO

-- Messages (if table exists)
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'contractor_messages')
BEGIN
  UPDATE m SET m.contractor_id = c.id
  FROM contractor_messages m
  INNER JOIN (SELECT tenant_id, id, ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY name) AS rn FROM contractors) c ON c.tenant_id = m.tenant_id AND c.rn = 1
  WHERE m.contractor_id IS NULL;
END
GO
