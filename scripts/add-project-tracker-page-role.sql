-- Add 'project_tracker' to user_page_roles.page_id CHECK. Run after project-tracker-schema.
-- IN list must match scripts/sync-user-page-roles-check-constraint.sql (npm run db:user-page-roles-sync-check).

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_user_page_roles_page_id' AND parent_object_id = OBJECT_ID('user_page_roles'))
  ALTER TABLE user_page_roles DROP CONSTRAINT CK_user_page_roles_page_id;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_user_page_roles_page_id' AND parent_object_id = OBJECT_ID('user_page_roles'))
  ALTER TABLE user_page_roles ADD CONSTRAINT CK_user_page_roles_page_id CHECK (page_id IN (
    N'profile', N'management', N'users', N'tenants', N'contractor', N'command_centre', N'access_management', N'rector', N'tasks', N'transport_operations', N'recruitment', N'accounting_management', N'tracking_integration', N'fuel_supply_management', N'fuel_customer_orders', N'team_leader_admin', N'performance_evaluations', N'auditor', N'contractor_management', N'project_tracker', N'resources_register'
  ));
GO
