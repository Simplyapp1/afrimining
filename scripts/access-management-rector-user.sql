-- Link route rectors to users: assign existing users to routes (user_id in access_route_factors).
-- Run: node scripts/run-access-management-rector-user.js

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('access_route_factors') AND name = 'user_id')
  ALTER TABLE access_route_factors ADD user_id UNIQUEIDENTIFIER NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_access_route_factors_user' AND parent_object_id = OBJECT_ID('access_route_factors'))
BEGIN
  ALTER TABLE access_route_factors ADD CONSTRAINT FK_access_route_factors_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION ON UPDATE NO ACTION;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_access_route_factors_user' AND object_id = OBJECT_ID('access_route_factors'))
  CREATE INDEX IX_access_route_factors_user ON access_route_factors(user_id);
GO
