-- Recreate CK_user_page_roles_page_id with the full allowed set.
-- Keep in sync with src/routes/users.js PAGE_IDS plus legacy portal page_ids:
--   contractor, command_centre, access_management, rector, transport_operations,
--   tracking_integration, fuel_supply_management, fuel_customer_orders.
-- Run: npm run db:user-page-roles-sync-check

DELETE FROM user_page_roles WHERE page_id = N'letters';
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_user_page_roles_page_id' AND parent_object_id = OBJECT_ID('user_page_roles'))
  ALTER TABLE user_page_roles DROP CONSTRAINT CK_user_page_roles_page_id;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_user_page_roles_page_id' AND parent_object_id = OBJECT_ID('user_page_roles'))
  ALTER TABLE user_page_roles ADD CONSTRAINT CK_user_page_roles_page_id CHECK (page_id IN (
    N'profile', N'management', N'users', N'tenants', N'contractor', N'command_centre', N'access_management', N'rector', N'tasks', N'transport_operations', N'recruitment', N'accounting_management', N'tracking_integration', N'fuel_supply_management', N'fuel_customer_orders', N'team_leader_admin', N'performance_evaluations', N'auditor', N'contractor_management', N'project_tracker', N'resources_register'
  ));
GO
