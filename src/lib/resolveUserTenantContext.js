import { query } from '../db.js';

/** Normalize GUIDs for comparisons (SQL Server may return different casing / braces). */
export function normTenantId(v) {
  if (v == null) return '';
  return String(v).trim().toLowerCase().replace(/[{}]/g, '');
}

function tenantListIncludes(list, id) {
  const n = normTenantId(id);
  if (!n) return false;
  return (list || []).some((t) => normTenantId(t) === n);
}

/**
 * Resolve tenant_ids and effective tenant for API/session.
 * - Ignores session tenant when the user no longer has that tenant (fixes stuck "No tenant").
 * - super_admin with no primary / user_tenants gets the first tenant in the DB so tenant-scoped routes work.
 */
export async function resolveUserTenantContext({ userId, sessionTenantId, primaryTenantId, role }) {
  let tenant_ids = [];
  try {
    const ut = await query(`SELECT tenant_id FROM user_tenants WHERE user_id = @userId`, { userId });
    tenant_ids = (ut.recordset || []).map((r) => r.tenant_id ?? r.tenant_Id).filter(Boolean);
  } catch (_) {}
  if (tenant_ids.length === 0 && primaryTenantId) tenant_ids = [primaryTenantId];

  const roleLc = String(role || '').toLowerCase();
  let effectiveSession = sessionTenantId;
  if (effectiveSession && tenant_ids.length > 0 && !tenantListIncludes(tenant_ids, effectiveSession)) {
    effectiveSession = null;
  }

  let currentTenantId = null;
  if (effectiveSession && tenant_ids.length > 0 && tenantListIncludes(tenant_ids, effectiveSession)) {
    currentTenantId = effectiveSession;
  } else {
    currentTenantId = primaryTenantId || tenant_ids[0] || null;
  }

  if (!currentTenantId && roleLc === 'super_admin') {
    try {
      const r = await query(`SELECT TOP 1 id FROM tenants ORDER BY name`);
      const row = r.recordset?.[0];
      const id = row?.id ?? row?.Id;
      if (id) {
        currentTenantId = id;
        if (!tenantListIncludes(tenant_ids, id)) tenant_ids = [...tenant_ids, id];
      }
    } catch (_) {}
  }

  return { tenant_ids, currentTenantId };
}
