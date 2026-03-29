-- Grant Command Centre tab "truck_update_records" to every user who already has "trends"
-- (same analytics audience). Run once in Azure SQL / SSMS if you use per-tab grants.
-- Super admins already see all tabs without grants.

IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'command_centre_grants')
BEGIN
  INSERT INTO command_centre_grants (user_id, tab_id, granted_by_user_id)
  SELECT g.user_id, N'truck_update_records', g.granted_by_user_id
  FROM command_centre_grants g
  WHERE g.tab_id = N'trends'
    AND NOT EXISTS (
      SELECT 1 FROM command_centre_grants x
      WHERE x.user_id = g.user_id AND x.tab_id = N'truck_update_records'
    );
END
