-- Grant "Handed over analysis" Command Centre tab to every user who already has "Truck update records".
-- Run manually against your DB after deploying truck_analysis_handovers schema.

IF EXISTS (SELECT * FROM sys.tables WHERE name = 'command_centre_grants')
BEGIN
  INSERT INTO command_centre_grants (user_id, tab_id, granted_by_user_id)
  SELECT DISTINCT g.user_id, N'handed_over_analysis', g.granted_by_user_id
  FROM command_centre_grants g
  WHERE g.tab_id = N'truck_update_records'
    AND NOT EXISTS (
      SELECT 1 FROM command_centre_grants x
      WHERE x.user_id = g.user_id AND x.tab_id = N'handed_over_analysis'
    );
END
GO
