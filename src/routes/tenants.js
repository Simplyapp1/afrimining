import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { query } from '../db.js';
import { requireAuth, loadUser, requireSuperAdmin, requireTenantAdmin, requirePageAccess } from '../middleware/auth.js';
import { auditLog } from '../lib/audit.js';
import { sendEmail, isEmailConfigured } from '../lib/emailService.js';
import { newTenantCreatedHtml } from '../lib/emailTemplates.js';
import { getSuperAdminEmails } from '../lib/emailRecipients.js';

const router = Router();
const uploadsDir = path.join(process.cwd(), 'uploads', 'tenants');
const logoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
      const tenantId = req.params.id;
      const ext = (path.extname(file.originalname) || '.png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
      cb(null, `${tenantId}.${ext}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(jpeg|png|gif|webp)$/i.test(file.mimetype);
    cb(null, !!ok);
  },
}).single('logo');

const TENANTS_SELECT = `SELECT t.id, t.name, t.slug, t.domain, t.logo_url, t.[plan], t.[status], t.settings, t.created_at, t.updated_at, (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id) AS user_count FROM tenants t`;

/** GET tenant logo image (public so it can be used in img tags and reports) */
router.get('/:id/logo', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT t.id, t.logo_url FROM tenants t WHERE t.id = @id`,
      { id }
    );
    const tenant = result.recordset[0];
    if (!tenant || !tenant.logo_url) return res.status(404).json({ error: 'Logo not found' });
    const filePath = path.join(process.cwd(), 'uploads', tenant.logo_url.replace(/\//g, path.sep));
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Logo file not found' });
    const ext = path.extname(tenant.logo_url).toLowerCase();
    const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
    res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
    res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
});

router.use(requireAuth);
router.use(loadUser);
router.use(requirePageAccess('tenants'));

/** List tenants: super_admin and enterprise see all; tenant_admin sees own */
router.get('/', async (req, res, next) => {
  try {
    const isEnterprise = String(req.user?.tenant_plan).toLowerCase() === 'enterprise';
    let result;
    if (req.user.role === 'super_admin' || isEnterprise) {
      result = await query(`${TENANTS_SELECT} ORDER BY t.name`);
    } else {
      result = await query(`${TENANTS_SELECT} WHERE t.id = @tenantId`, { tenantId: req.user.tenant_id });
    }
    res.json({ tenants: result.recordset });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await query(
      `${TENANTS_SELECT} WHERE t.id = @id`,
      { id }
    );
    const tenant = result.recordset[0];
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    const isEnterprise = String(req.user?.tenant_plan).toLowerCase() === 'enterprise';
    const canView = req.user.role === 'super_admin' || req.user.tenant_id === tenant.id || isEnterprise;
    if (!canView) return res.status(403).json({ error: 'Forbidden' });
    res.json({ tenant });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireSuperAdmin, async (req, res, next) => {
  try {
    const { name, slug, domain, plan, status } = req.body || {};
    if (!name || !slug) return res.status(400).json({ error: 'Name and slug required' });
    const safeSlug = slug.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const result = await query(
      `INSERT INTO tenants (name, slug, domain, [plan], [status])
       OUTPUT INSERTED.id, INSERTED.name, INSERTED.slug, INSERTED.domain, INSERTED.logo_url, INSERTED.[plan], INSERTED.[status], INSERTED.settings, INSERTED.created_at, INSERTED.updated_at
       VALUES (@name, @slug, @domain, @plan, @status)`,
      {
        name: name.trim(),
        slug: safeSlug || name.trim().toLowerCase().replace(/\s+/g, '-'),
        domain: domain?.trim() || null,
        plan: plan || 'standard',
        status: status || 'active',
      }
    );
    const tenant = result.recordset[0];
    await auditLog({
      userId: req.user.id,
      action: 'tenant.create',
      entityType: 'tenant',
      entityId: tenant.id,
      details: { name: tenant.name },
      ip: req.ip,
    });
    if (isEmailConfigured()) {
      const superAdminEmails = await getSuperAdminEmails(query);
      const appUrl = process.env.FRONTEND_ORIGIN || process.env.APP_URL || 'http://localhost:5173';
      const html = newTenantCreatedHtml({
        createdByName: req.user.full_name || req.user.email || null,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        tenantPlan: tenant.plan,
        appUrl,
      });
      const subject = `New tenant created: ${tenant.name}`;
      for (const to of superAdminEmails) {
        sendEmail({ to, subject, body: html, html: true }).catch((e) => console.error('[tenants] New tenant email error:', e?.message));
      }
    }
    res.status(201).json({ tenant });
  } catch (err) {
    if (err.number === 2627) return res.status(409).json({ error: 'Slug already exists' });
    next(err);
  }
});

/** POST upload company logo for tenant (replaces existing) */
router.post('/:id/logo', requireTenantAdmin, (req, res, next) => {
  if (req.user.role !== 'super_admin' && req.user.tenant_id !== req.params.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  logoUpload(req, res, (err) => {
    if (err) return next(err);
    if (!req.file) return res.status(400).json({ error: 'No logo file uploaded. Use field name "logo" and an image (PNG, JPEG, GIF, WebP, max 2MB).' });
    const { id } = req.params;
    const relativePath = 'tenants/' + req.file.filename;
    query(
      `UPDATE tenants SET logo_url = @logo_url, updated_at = SYSUTCDATETIME() OUTPUT INSERTED.id, INSERTED.name, INSERTED.slug, INSERTED.domain, INSERTED.logo_url, INSERTED.[plan], INSERTED.[status], INSERTED.settings, INSERTED.created_at, INSERTED.updated_at WHERE id = @id`,
      { id, logo_url: relativePath }
    )
      .then((result) => {
        const tenant = result.recordset[0];
        if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
        auditLog({
          tenantId: tenant.id,
          userId: req.user.id,
          action: 'tenant.logo_upload',
          entityType: 'tenant',
          entityId: tenant.id,
          details: { logo_url: tenant.logo_url },
          ip: req.ip,
        });
        res.json({ tenant });
      })
      .catch(next);
  });
});

router.patch('/:id', requireTenantAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, domain, plan, status, logo_url, settings } = req.body || {};
    if (req.user.role !== 'super_admin' && req.user.tenant_id !== id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const updates = [];
    const params = { id };
    if (name !== undefined) { updates.push('name = @name'); params.name = name.trim(); }
    if (domain !== undefined) { updates.push('domain = @domain'); params.domain = domain?.trim() || null; }
    if (plan !== undefined) { updates.push('[plan] = @plan'); params.plan = plan; }
    if (status !== undefined) { updates.push('[status] = @status'); params.status = status; }
    if (logo_url !== undefined) { updates.push('logo_url = @logo_url'); params.logo_url = logo_url?.trim() || null; }
    if (settings !== undefined) { updates.push('settings = @settings'); params.settings = typeof settings === 'string' ? settings : JSON.stringify(settings); }
    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
    updates.push('updated_at = SYSUTCDATETIME()');
    const result = await query(
      `UPDATE tenants SET ${updates.join(', ')}
       OUTPUT INSERTED.id, INSERTED.name, INSERTED.slug, INSERTED.domain, INSERTED.logo_url, INSERTED.[plan], INSERTED.[status], INSERTED.settings, INSERTED.created_at, INSERTED.updated_at
       WHERE id = @id`,
      params
    );
    const tenant = result.recordset[0];
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    await auditLog({
      tenantId: tenant.id,
      userId: req.user.id,
      action: 'tenant.update',
      entityType: 'tenant',
      entityId: tenant.id,
      details: req.body,
      ip: req.ip,
    });
    res.json({ tenant });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireSuperAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await query(`DELETE FROM tenants OUTPUT DELETED.id WHERE id = @id`, { id });
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Tenant not found' });
    await auditLog({
      userId: req.user.id,
      action: 'tenant.delete',
      entityType: 'tenant',
      entityId: id,
      ip: req.ip,
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
