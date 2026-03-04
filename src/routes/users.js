import { Router } from 'express';
import bcrypt from 'bcrypt';
import { query, getPool } from '../db.js';
import { requireAuth, loadUser, requireTenantAdmin, requirePageAccess } from '../middleware/auth.js';
import { auditLog } from '../lib/audit.js';
import { sendEmail, isEmailConfigured } from '../lib/emailService.js';
import { newUserCreatedHtml } from '../lib/emailTemplates.js';
import { getSuperAdminEmails } from '../lib/emailRecipients.js';

const router = Router();
const SALT_ROUNDS = 10;

/** Page IDs that can be assigned as roles (main app pages). Must match client PAGE_ROLES. */
export const PAGE_IDS = ['profile', 'management', 'users', 'tenants', 'contractor', 'command_centre', 'access_management', 'rector', 'tasks'];

async function getPageRolesForUsers(pool, userIds) {
  if (!userIds || userIds.length === 0) return {};
  const request = pool.request();
  const placeholders = userIds.map((_, i) => `@id${i}`).join(',');
  userIds.forEach((id, i) => { request.input(`id${i}`, id); });
  const result = await request.query(
    `SELECT user_id, page_id FROM user_page_roles WHERE user_id IN (${placeholders})`
  );
  const byUser = {};
  for (const row of result.recordset || []) {
    const uid = row.user_id ?? row.user_Id;
    if (!byUser[uid]) byUser[uid] = [];
    byUser[uid].push(row.page_id ?? row.page_Id);
  }
  return byUser;
}

async function getTenantIdsForUsers(pool, userIds) {
  if (!userIds || userIds.length === 0) return {};
  try {
    const request = pool.request();
    const placeholders = userIds.map((_, i) => `@id${i}`).join(',');
    userIds.forEach((id, i) => { request.input(`id${i}`, id); });
    const result = await request.query(
      `SELECT user_id, tenant_id FROM user_tenants WHERE user_id IN (${placeholders})`
    );
    const byUser = {};
    for (const row of result.recordset || []) {
      const uid = row.user_id ?? row.user_Id;
      if (!byUser[uid]) byUser[uid] = [];
      byUser[uid].push(row.tenant_id ?? row.tenant_Id);
    }
    return byUser;
  } catch (_) {
    return {};
  }
}

router.use(requireAuth);
router.use(loadUser);
router.use(requirePageAccess('users'));

function canAccessTenant(req, tenantId) {
  if (req.user.role === 'super_admin') return true;
  const hasTenant = req.user.tenant_id === tenantId || (Array.isArray(req.user.tenant_ids) && req.user.tenant_ids.includes(tenantId));
  if (!hasTenant) return false;
  const isEnterprise = String(req.user?.tenant_plan).toLowerCase() === 'enterprise';
  if (req.user.role === 'tenant_admin' || isEnterprise) return true;
  return false;
}

/** List users with filters; super_admin sees all, tenant_admin sees own tenant */
router.get('/', async (req, res, next) => {
  try {
    const { tenant_id, role, status, search, sort = 'created_at', order = 'desc', page = 1, limit = 50 } = req.query;
    const tenantId = tenant_id || req.user.tenant_id;
    if (!canAccessTenant(req, tenantId) && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(100, Math.max(1, parseInt(limit, 10)));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const validSort = ['created_at', 'full_name', 'email', 'last_login_at', 'role', 'status'].includes(sort) ? sort : 'created_at';
    const validOrder = order === 'asc' ? 'ASC' : 'DESC';

    let where = 'WHERE 1=1';
    const params = { offset, limitNum };
    let fromJoin = 'FROM users u LEFT JOIN tenants t ON t.id = u.tenant_id';

    if (req.user.role !== 'super_admin') {
      fromJoin += ' INNER JOIN user_tenants ut ON ut.user_id = u.id AND ut.tenant_id = @tenantId';
      where += ' AND ut.tenant_id = @tenantId';
      params.tenantId = req.user.tenant_id;
    } else if (tenantId) {
      fromJoin += ' INNER JOIN user_tenants ut ON ut.user_id = u.id AND ut.tenant_id = @tenantId';
      where += ' AND ut.tenant_id = @tenantId';
      params.tenantId = tenantId;
    }
    if (req.user.role === 'super_admin' && !tenantId) {
      fromJoin = 'FROM users u LEFT JOIN tenants t ON t.id = u.tenant_id';
    }

    if (role) { where += ' AND u.role = @role'; params.role = role; }
    if (status) { where += ' AND u.status = @status'; params.status = status; }
    if (search && search.trim()) {
      where += ' AND (u.email LIKE @search OR u.full_name LIKE @search)';
      params.search = '%' + search.trim() + '%';
    }

    const countResult = await query(
      `SELECT COUNT(DISTINCT u.id) AS total ${fromJoin} ${where}`,
      params
    );
    const total = countResult.recordset[0].total;

    const result = await query(
      `SELECT DISTINCT u.id, u.tenant_id, u.email, u.full_name, u.role, u.status, u.avatar_url, u.last_login_at, u.login_count, u.created_at, t.name AS tenant_name
       ${fromJoin}
       ${where}
       ORDER BY u.${validSort} ${validOrder}
       OFFSET @offset ROWS FETCH NEXT @limitNum ROWS ONLY`,
      { ...params, offset, limitNum }
    );
    const list = result.recordset || [];
    const pool = await getPool();
    const pageRolesByUser = await getPageRolesForUsers(pool, list.map((u) => u.id));
    const tenantIdsByUser = await getTenantIdsForUsers(pool, list.map((u) => u.id));
    const usersWithRoles = list.map((u) => ({
      ...u,
      page_roles: pageRolesByUser[u.id] || [],
      tenant_ids: tenantIdsByUser[u.id] || (u.tenant_id ? [u.tenant_id] : []),
    }));

    res.json({
      users: usersWithRoles,
      pagination: { page: Math.floor(offset / limitNum) + 1, limit: limitNum, total },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT u.id, u.tenant_id, u.email, u.full_name, u.role, u.status, u.avatar_url, u.last_login_at, u.login_count, u.metadata, u.created_at, u.updated_at, t.name AS tenant_name
       FROM users u
       LEFT JOIN tenants t ON t.id = u.tenant_id
       WHERE u.id = @id`,
      { id: req.params.id }
    );
    const user = result.recordset[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    const pool = await getPool();
    const tenantIdsByUser = await getTenantIdsForUsers(pool, [user.id]);
    const tenant_ids = tenantIdsByUser[user.id] || (user.tenant_id ? [user.tenant_id] : []);
    const canAccess = canAccessTenant(req, user.tenant_id) || tenant_ids.includes(req.user.tenant_id);
    if (!canAccess) return res.status(403).json({ error: 'Forbidden' });
    const pageRolesByUser = await getPageRolesForUsers(pool, [user.id]);
    res.json({ user: { ...user, page_roles: pageRolesByUser[user.id] || [], tenant_ids } });
  } catch (err) {
    next(err);
  }
});

/** Activity for a user (audit log entries) */
router.get('/:id/activity', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT u.id, u.tenant_id FROM users u WHERE u.id = @id`,
      { id: req.params.id }
    );
    const user = result.recordset[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    const pool = await getPool();
    const tidMap = await getTenantIdsForUsers(pool, [user.id]);
    const targetTenantIds = tidMap[user.id] || (user.tenant_id ? [user.tenant_id] : []);
    const canAccess = canAccessTenant(req, user.tenant_id) || targetTenantIds.includes(req.user.tenant_id);
    if (!canAccess) return res.status(403).json({ error: 'Forbidden' });

    const logResult = await query(
      `SELECT TOP 50 action, entity_type, entity_id, details, created_at FROM audit_log WHERE user_id = @userId ORDER BY created_at DESC`,
      { userId: req.params.id }
    );
    res.json({ activity: logResult.recordset });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireTenantAdmin, async (req, res, next) => {
  try {
    const { email, password, full_name, role, page_roles, tenant_ids: bodyTenantIds } = req.body || {};
    if (!email || !password || !full_name) {
      return res.status(400).json({ error: 'Email, password, and full_name required' });
    }
    let tenantIds = Array.isArray(bodyTenantIds) ? bodyTenantIds.filter(Boolean) : [];
    if (req.user.role !== 'super_admin') {
      tenantIds = tenantIds.length ? tenantIds.filter((tid) => canAccessTenant(req, tid)) : [req.user.tenant_id];
      if (tenantIds.length === 0) tenantIds = [req.user.tenant_id];
    }
    if (tenantIds.length === 0) return res.status(400).json({ error: 'At least one tenant is required' });
    const primaryTenantId = tenantIds[0];
    if (!canAccessTenant(req, primaryTenantId)) return res.status(403).json({ error: 'Forbidden' });

    const safeRole = role === 'tenant_admin' || role === 'user' ? role : 'user';
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const result = await query(
      `INSERT INTO users (tenant_id, email, password_hash, full_name, role, status)
       OUTPUT INSERTED.id, INSERTED.tenant_id, INSERTED.email, INSERTED.full_name, INSERTED.role, INSERTED.status, INSERTED.created_at
       VALUES (@tenantId, @email, @passwordHash, @fullName, @role, 'active')`,
      {
        tenantId: primaryTenantId,
        email: email.trim().toLowerCase(),
        passwordHash,
        fullName: full_name.trim(),
        role: req.user.role === 'super_admin' ? (role || 'user') : safeRole,
      }
    );
    const user = result.recordset[0];
    for (const tid of tenantIds) {
      await query(`INSERT INTO user_tenants (user_id, tenant_id) VALUES (@userId, @tenantId)`, { userId: user.id, tenantId: tid });
    }
    const pageIds = Array.isArray(page_roles) ? page_roles.filter((p) => PAGE_IDS.includes(p)) : [];
    for (const pageId of pageIds) {
      await query(`INSERT INTO user_page_roles (user_id, page_id) VALUES (@userId, @pageId)`, { userId: user.id, pageId });
    }
    await auditLog({
      tenantId: user.tenant_id,
      userId: req.user.id,
      action: 'user.create',
      entityType: 'user',
      entityId: user.id,
      details: { email: user.email },
      ip: req.ip,
    });
    if (isEmailConfigured()) {
      const superAdminEmails = await getSuperAdminEmails(query);
      let tenantName = null;
      if (primaryTenantId) {
        const tn = await query(`SELECT name FROM tenants WHERE id = @id`, { id: primaryTenantId });
        tenantName = tn.recordset?.[0]?.name ?? null;
      }
      const appUrl = process.env.FRONTEND_ORIGIN || process.env.APP_URL || 'http://localhost:5173';
      const html = newUserCreatedHtml({
        createdByName: req.user.full_name || req.user.email || null,
        userEmail: user.email,
        userFullName: user.full_name,
        userRole: user.role,
        tenantName,
        appUrl,
      });
      const subject = `New user created: ${user.email}`;
      for (const to of superAdminEmails) {
        sendEmail({ to, subject, body: html, html: true }).catch((e) => console.error('[users] New user email error:', e?.message));
      }
    }
    res.status(201).json({ user: { ...user, page_roles: pageIds, tenant_ids: tenantIds } });
  } catch (err) {
    if (err.number === 2627) return res.status(409).json({ error: 'Email already exists in this tenant' });
    next(err);
  }
});

router.patch('/:id', requireTenantAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await query(`SELECT id, tenant_id, role FROM users WHERE id = @id`, { id });
    const existing = result.recordset[0];
    if (!existing) return res.status(404).json({ error: 'User not found' });
    const pool = await getPool();
    const existingTenantIds = await getTenantIdsForUsers(pool, [existing.id]);
    const existingList = existingTenantIds[existing.id] || (existing.tenant_id ? [existing.tenant_id] : []);
    const canAccess = canAccessTenant(req, existing.tenant_id) || existingList.includes(req.user.tenant_id);
    if (!canAccess) return res.status(403).json({ error: 'Forbidden' });

    const { full_name, role, status, password, page_roles, tenant_ids: bodyTenantIds } = req.body || {};
    const updates = [];
    const params = { id };

    if (full_name !== undefined) { updates.push('full_name = @full_name'); params.full_name = full_name.trim(); }
    if (status !== undefined) { updates.push('status = @status'); params.status = status; }
    if (role !== undefined) {
      if (req.user.role !== 'super_admin' && (role === 'super_admin' || (existing.role === 'tenant_admin' && role !== 'tenant_admin'))) {
        return res.status(403).json({ error: 'Cannot change this role' });
      }
      updates.push('role = @role'); params.role = role;
    }
    if (password !== undefined && password.length >= 8) {
      updates.push('password_hash = @passwordHash'); params.passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    }
    if (page_roles !== undefined) {
      await query(`DELETE FROM user_page_roles WHERE user_id = @id`, { id });
      const pageIds = Array.isArray(page_roles) ? page_roles.filter((p) => PAGE_IDS.includes(p)) : [];
      for (const pageId of pageIds) {
        await query(`INSERT INTO user_page_roles (user_id, page_id) VALUES (@userId, @pageId)`, { userId: id, pageId });
      }
    }
    if (bodyTenantIds !== undefined) {
      let newTenantIds = Array.isArray(bodyTenantIds) ? bodyTenantIds.filter(Boolean) : [];
      if (req.user.role !== 'super_admin') {
        newTenantIds = newTenantIds.filter((tid) => canAccessTenant(req, tid));
        if (newTenantIds.length === 0) newTenantIds = existingList.slice();
      }
      await query(`DELETE FROM user_tenants WHERE user_id = @id`, { id });
      for (const tid of newTenantIds) {
        await query(`INSERT INTO user_tenants (user_id, tenant_id) VALUES (@userId, @tenantId)`, { userId: id, tenantId: tid });
      }
      if (newTenantIds.length > 0) {
        updates.push('tenant_id = @primaryTenantId');
        params.primaryTenantId = newTenantIds[0];
      }
    }
    if (updates.length === 0 && page_roles === undefined && bodyTenantIds === undefined) return res.status(400).json({ error: 'No fields to update' });
    if (updates.length > 0) {
      updates.push('updated_at = SYSUTCDATETIME()');
      await query(`UPDATE users SET ${updates.join(', ')} WHERE id = @id`, params);
    }
    const getResult = await query(
      `SELECT id, tenant_id, email, full_name, role, status, last_login_at, created_at FROM users WHERE id = @id`,
      { id }
    );
    const updatedUser = getResult.recordset[0];
    const pageRolesByUser = await getPageRolesForUsers(pool, [id]);
    await auditLog({
      tenantId: existing.tenant_id,
      userId: req.user.id,
      action: 'user.update',
      entityType: 'user',
      entityId: id,
      details: { full_name, role, status: status !== undefined, page_roles: page_roles !== undefined },
      ip: req.ip,
    });
    const tenantIdsByUser = await getTenantIdsForUsers(pool, [id]);
    const tenant_ids = tenantIdsByUser[id] || (updatedUser.tenant_id ? [updatedUser.tenant_id] : []);
    res.json({ user: { ...updatedUser, page_roles: pageRolesByUser[id] || [], tenant_ids } });
  } catch (err) {
    next(err);
  }
});

/** Bulk update status or role */
router.post('/bulk', requireTenantAdmin, async (req, res, next) => {
  try {
    const { ids, status, role } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array required' });
    if (status === undefined && role === undefined) return res.status(400).json({ error: 'status or role required' });

    const updates = [];
    const params = {};
    if (status !== undefined) { updates.push('status = @status'); params.status = status; }
    if (role !== undefined) { updates.push('role = @role'); params.role = role; }
    const placeholders = ids.map((_, i) => `@id${i}`).join(',');
    ids.forEach((id, i) => { params[`id${i}`] = id; });
    const setClause = updates.join(', ') + ', updated_at = SYSUTCDATETIME()';

    if (req.user.role !== 'super_admin') {
      params.tenantId = req.user.tenant_id;
      const r = await query(
        `UPDATE users SET ${setClause} WHERE id IN (${placeholders}) AND tenant_id = @tenantId; SELECT @@ROWCOUNT AS affected`,
        params
      );
      const affected = r.recordset[0]?.affected ?? 0;
      await auditLog({
        tenantId: req.user.tenant_id,
        userId: req.user.id,
        action: 'user.bulk',
        entityType: 'user',
        details: { ids, status, role, affected },
        ip: req.ip,
      });
      return res.json({ updated: affected });
    }
    const r = await query(
      `UPDATE users SET ${setClause} WHERE id IN (${placeholders}); SELECT @@ROWCOUNT AS affected`,
      params
    );
    const affected = r.recordset[0]?.affected ?? 0;
    await auditLog({
      userId: req.user.id,
      action: 'user.bulk',
      entityType: 'user',
      details: { ids, status, role, affected },
      ip: req.ip,
    });
    res.json({ updated: affected });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireTenantAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await query(`SELECT id, tenant_id FROM users WHERE id = @id`, { id });
    const user = result.recordset[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!canAccessTenant(req, user.tenant_id)) return res.status(403).json({ error: 'Forbidden' });
    if (user.id === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });

    await query(`DELETE FROM users WHERE id = @id`, { id });
    await auditLog({
      tenantId: user.tenant_id,
      userId: req.user.id,
      action: 'user.delete',
      entityType: 'user',
      entityId: id,
      ip: req.ip,
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
