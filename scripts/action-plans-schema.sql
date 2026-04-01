-- Project action plans / project timelines: created in Access Management, viewed on Rector.
-- Run: node scripts/run-action-plans-schema.js

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'project_action_plans')
CREATE TABLE project_action_plans (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title NVARCHAR(500) NOT NULL,
  project_name NVARCHAR(500) NOT NULL,
  document_date DATE NOT NULL,
  document_id NVARCHAR(100) NULL,
  items_json NVARCHAR(MAX) NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  created_by_user_id UNIQUEIDENTIFIER NULL REFERENCES users(id) ON DELETE NO ACTION ON UPDATE NO ACTION
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_project_action_plans_tenant' AND object_id = OBJECT_ID('project_action_plans'))
  CREATE INDEX IX_project_action_plans_tenant ON project_action_plans(tenant_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_project_action_plans_document_date' AND object_id = OBJECT_ID('project_action_plans'))
  CREATE INDEX IX_project_action_plans_document_date ON project_action_plans(document_date DESC);
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'project_action_plan_routes')
CREATE TABLE project_action_plan_routes (
  plan_id UNIQUEIDENTIFIER NOT NULL REFERENCES project_action_plans(id) ON DELETE CASCADE,
  route_id UNIQUEIDENTIFIER NOT NULL REFERENCES contractor_routes(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_project_action_plan_routes PRIMARY KEY (plan_id, route_id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_project_action_plan_routes_route' AND object_id = OBJECT_ID('project_action_plan_routes'))
  CREATE INDEX IX_project_action_plan_routes_route ON project_action_plan_routes(route_id);
GO
