import { query } from '../db.js';
import { sql } from '../db.js';

export async function auditLog({ tenantId, userId, action, entityType, entityId, details, ip }) {
  await query(
    `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, details, ip)
     VALUES (@tenantId, @userId, @action, @entityType, @entityId, @details, @ip)`,
    {
      tenantId: tenantId ?? null,
      userId: userId ?? null,
      action,
      entityType,
      entityId: entityId ?? null,
      details: details ? JSON.stringify(details) : null,
      ip: ip ?? null,
    }
  );
}
