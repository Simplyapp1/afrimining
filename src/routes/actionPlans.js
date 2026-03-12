import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, loadUser, requirePageAccess } from '../middleware/auth.js';
import { sendEmail, isEmailConfigured } from '../lib/emailService.js';
import { actionPlanSharedHtml } from '../lib/emailTemplates.js';

const router = Router();

function getRow(row, ...keys) {
  if (!row) return undefined;
  for (const k of keys) if (row[k] !== undefined && row[k] !== null) return row[k];
  const lower = (keys[0] || '').toString().toLowerCase();
  const entry = Object.entries(row).find(([key]) => key && String(key).toLowerCase() === lower);
  return entry ? entry[1] : undefined;
}

function parseJson(val) {
  if (val == null || val === '') return [];
  if (typeof val === 'object') return val;
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

router.use(requireAuth);
router.use(loadUser);
router.use(requirePageAccess(['access_management', 'rector']));

/** GET list users for recipient selection (same tenant, with email) */
router.get('/users', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) return res.json({ users: [] });
    const result = await query(
      `SELECT u.id, u.full_name, u.email FROM users u
       INNER JOIN user_tenants ut ON ut.user_id = u.id AND ut.tenant_id = @tenantId
       WHERE u.status = 'active' AND u.email IS NOT NULL AND LTRIM(RTRIM(ISNULL(u.email,''))) <> ''
       ORDER BY u.full_name`,
      { tenantId }
    );
    res.json({
      users: (result.recordset || []).map((r) => ({
        id: getRow(r, 'id'),
        full_name: getRow(r, 'full_name'),
        email: getRow(r, 'email'),
      })),
    });
  } catch (err) {
    next(err);
  }
});

/** GET list action plans for current tenant (latest first) */
router.get('/', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'No tenant context' });
    const result = await query(
      `SELECT id, tenant_id, title, project_name, document_date, document_id, items_json, created_at, updated_at
       FROM project_action_plans
       WHERE tenant_id = @tenantId
       ORDER BY document_date DESC, updated_at DESC`,
      { tenantId }
    );
    const list = (result.recordset || []).map((r) => ({
      id: getRow(r, 'id'),
      tenant_id: getRow(r, 'tenant_id'),
      title: getRow(r, 'title'),
      project_name: getRow(r, 'project_name'),
      document_date: getRow(r, 'document_date'),
      document_id: getRow(r, 'document_id'),
      items: parseJson(getRow(r, 'items_json')),
      created_at: getRow(r, 'created_at'),
      updated_at: getRow(r, 'updated_at'),
    }));
    res.json({ plans: list });
  } catch (err) {
    next(err);
  }
});

/** GET one plan by id (must belong to user's tenant) */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenantId = req.user?.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'No tenant context' });
    const result = await query(
      `SELECT id, tenant_id, title, project_name, document_date, document_id, items_json, created_at, updated_at
       FROM project_action_plans
       WHERE id = @id AND tenant_id = @tenantId`,
      { id, tenantId }
    );
    const r = result.recordset?.[0];
    if (!r) return res.status(404).json({ error: 'Action plan not found' });
    res.json({
      plan: {
        id: getRow(r, 'id'),
        tenant_id: getRow(r, 'tenant_id'),
        title: getRow(r, 'title'),
        project_name: getRow(r, 'project_name'),
        document_date: getRow(r, 'document_date'),
        document_id: getRow(r, 'document_id'),
        items: parseJson(getRow(r, 'items_json')),
        created_at: getRow(r, 'created_at'),
        updated_at: getRow(r, 'updated_at'),
      },
    });
  } catch (err) {
    next(err);
  }
});

/** POST create (Access Management only) */
router.post('/', async (req, res, next) => {
  if (!req.user?.page_roles?.includes('access_management') && req.user?.role !== 'super_admin') {
    return res.status(403).json({ error: 'Only Access Management can create action plans.' });
  }
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'No tenant context' });
    const body = req.body || {};
    const title = (body.title || '').toString().trim() || 'Action Plan';
    const projectName = (body.project_name || '').toString().trim() || '';
    const documentDate = body.document_date || new Date().toISOString().slice(0, 10);
    const documentId = (body.document_id || '').toString().trim() || null;
    const items = Array.isArray(body.items) ? body.items : [];
    const itemsJson = JSON.stringify(items);

    const result = await query(
      `INSERT INTO project_action_plans (tenant_id, title, project_name, document_date, document_id, items_json, created_by_user_id)
       OUTPUT INSERTED.id, INSERTED.title, INSERTED.document_date, INSERTED.created_at
       VALUES (@tenantId, @title, @projectName, @documentDate, @documentId, @itemsJson, @userId)`,
      {
        tenantId,
        title,
        projectName,
        documentDate,
        documentId,
        itemsJson,
        userId: req.user?.id || null,
      }
    );
    const row = result.recordset?.[0];
    res.status(201).json({
      plan: {
        id: getRow(row, 'id'),
        title: getRow(row, 'title'),
        document_date: getRow(row, 'document_date'),
        created_at: getRow(row, 'created_at'),
      },
    });
  } catch (err) {
    next(err);
  }
});

/** PATCH update (Access Management only) */
router.patch('/:id', async (req, res, next) => {
  if (!req.user?.page_roles?.includes('access_management') && req.user?.role !== 'super_admin') {
    return res.status(403).json({ error: 'Only Access Management can update action plans.' });
  }
  try {
    const { id } = req.params;
    const tenantId = req.user?.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'No tenant context' });
    const body = req.body || {};
    const updates = [];
    const params = { id, tenantId };
    if (body.title !== undefined) { updates.push('title = @title'); params.title = (body.title || '').toString().trim() || 'Action Plan'; }
    if (body.project_name !== undefined) { updates.push('project_name = @projectName'); params.projectName = (body.project_name || '').toString().trim() || ''; }
    if (body.document_date !== undefined) { updates.push('document_date = @documentDate'); params.documentDate = body.document_date; }
    if (body.document_id !== undefined) { updates.push('document_id = @documentId'); params.documentId = (body.document_id || '').toString().trim() || null; }
    if (body.items !== undefined) { updates.push('items_json = @itemsJson'); params.itemsJson = JSON.stringify(Array.isArray(body.items) ? body.items : []); }
    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
    updates.push('updated_at = SYSUTCDATETIME()');

    const result = await query(
      `UPDATE project_action_plans SET ${updates.join(', ')} OUTPUT INSERTED.id WHERE id = @id AND tenant_id = @tenantId`,
      params
    );
    if (!result.recordset?.[0]) return res.status(404).json({ error: 'Action plan not found' });
    const getResult = await query(
      `SELECT id, title, project_name, document_date, document_id, items_json, updated_at
       FROM project_action_plans WHERE id = @id`,
      { id }
    );
    const r = getResult.recordset?.[0];
    res.json({
      plan: {
        id: getRow(r, 'id'),
        title: getRow(r, 'title'),
        project_name: getRow(r, 'project_name'),
        document_date: getRow(r, 'document_date'),
        document_id: getRow(r, 'document_id'),
        items: parseJson(getRow(r, 'items_json')),
        updated_at: getRow(r, 'updated_at'),
      },
    });
  } catch (err) {
    next(err);
  }
});

/** DELETE (Access Management only) */
router.delete('/:id', async (req, res, next) => {
  if (!req.user?.page_roles?.includes('access_management') && req.user?.role !== 'super_admin') {
    return res.status(403).json({ error: 'Only Access Management can delete action plans.' });
  }
  try {
    const { id } = req.params;
    const tenantId = req.user?.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'No tenant context' });
    const result = await query(
      `DELETE FROM project_action_plans OUTPUT DELETED.id WHERE id = @id AND tenant_id = @tenantId`,
      { id, tenantId }
    );
    if (!result.recordset?.[0]) return res.status(404).json({ error: 'Action plan not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** POST send action plan by email. Body: { to_user_ids: [], cc_emails: []|string, message?: string, pdf_base64: string, pdf_filename: string } */
router.post('/:id/send-email', async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenantId = req.user?.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'No tenant context' });
    if (!isEmailConfigured()) return res.status(503).json({ error: 'Email is not configured. Contact your administrator.' });

    const planResult = await query(
      `SELECT id, title, project_name, document_date, document_id FROM project_action_plans WHERE id = @id AND tenant_id = @tenantId`,
      { id, tenantId }
    );
    const planRow = planResult.recordset?.[0];
    if (!planRow) return res.status(404).json({ error: 'Action plan not found' });

    const body = req.body || {};
    const toUserIds = Array.isArray(body.to_user_ids) ? body.to_user_ids : [];
    let ccEmails = body.cc_emails;
    if (typeof ccEmails === 'string') ccEmails = ccEmails.split(/[\s,;]+/).map((e) => e.trim()).filter((e) => e && e.includes('@'));
    else if (!Array.isArray(ccEmails)) ccEmails = [];
    else ccEmails = ccEmails.map((e) => String(e).trim()).filter((e) => e && e.includes('@'));

    const pdfBase64 = body.pdf_base64 && String(body.pdf_base64).trim();
    const pdfFilename = (body.pdf_filename && String(body.pdf_filename).trim()) || 'action-plan.pdf';
    if (!pdfBase64) return res.status(400).json({ error: 'PDF attachment (pdf_base64) is required.' });

    let toEmails = [];
    if (toUserIds.length > 0) {
      const placeholders = toUserIds.map((_, i) => `@uid${i}`).join(',');
      const params = { tenantId };
      toUserIds.forEach((uid, i) => { params[`uid${i}`] = uid; });
      const userResult = await query(
        `SELECT u.id, u.email FROM users u
         INNER JOIN user_tenants ut ON ut.user_id = u.id AND ut.tenant_id = @tenantId
         WHERE u.id IN (${placeholders}) AND u.email IS NOT NULL AND LTRIM(RTRIM(ISNULL(u.email,''))) <> ''`,
        params
      );
      toEmails = (userResult.recordset || []).map((r) => (r.email || r.Email || '').trim()).filter((e) => e && e.includes('@'));
    }

    if (toEmails.length === 0) return res.status(400).json({ error: 'Select at least one recipient in To. You can add more in CC.' });

    const planTitle = getRow(planRow, 'title');
    const projectName = getRow(planRow, 'project_name');
    const documentDate = getRow(planRow, 'document_date');
    const documentId = getRow(planRow, 'document_id');
    const senderName = req.user?.full_name || req.user?.email || null;
    const message = (body.message && String(body.message).trim()) || '';

    const html = actionPlanSharedHtml({
      planTitle,
      projectName,
      documentDate,
      documentId,
      senderName,
      message,
    });

    const attachments = [
      { filename: pdfFilename, content: pdfBase64, encoding: 'base64' },
    ];

    await sendEmail({
      to: toEmails.length > 0 ? toEmails : ccEmails,
      cc: toEmails.length > 0 && ccEmails.length > 0 ? ccEmails : undefined,
      subject: `Action plan: ${planTitle || 'Action Plan'} – ${projectName || ''}`.trim(),
      body: html,
      html: true,
      attachments,
    });

    res.json({ ok: true, message: 'Email sent successfully.' });
  } catch (err) {
    next(err);
  }
});

export default router;
