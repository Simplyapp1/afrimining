import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, loadUser, requirePageAccess } from '../middleware/auth.js';
import { sendEmail, isEmailConfigured } from '../lib/emailService.js';
import { progressReportSharedHtml } from '../lib/emailTemplates.js';

const router = Router();

function getRow(row, ...keys) {
  if (!row) return undefined;
  for (const k of keys) if (row[k] !== undefined && row[k] !== null) return row[k];
  const lower = (keys[0] || '').toString().toLowerCase();
  const entry = Object.entries(row).find(([key]) => key && String(key).toLowerCase() === lower);
  return entry ? entry[1] : undefined;
}

function normalizeIds(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((v) => String(v || '').trim()).filter(Boolean))];
}

function csvToIds(csv) {
  if (!csv) return [];
  return normalizeIds(String(csv).split(','));
}

function hasAccessManagement(req) {
  if (req.user?.role === 'super_admin') return true;
  return Array.isArray(req.user?.page_roles) && req.user.page_roles.includes('access_management');
}

async function getRectorRouteIds(req, tenantId) {
  const result = await query(
    `SELECT DISTINCT route_id FROM access_route_factors
     WHERE tenant_id = @tenantId AND user_id = @userId AND route_id IS NOT NULL`,
    { tenantId, userId: req.user?.id || null }
  );
  return normalizeIds((result.recordset || []).map((r) => getRow(r, 'route_id')));
}

async function resolveValidRouteIds(tenantId, routeIds) {
  const ids = normalizeIds(routeIds);
  if (ids.length === 0) return [];
  const placeholders = ids.map((_, i) => `@rid${i}`).join(',');
  const params = { tenantId };
  ids.forEach((id, i) => { params[`rid${i}`] = id; });
  const result = await query(
    `SELECT id FROM contractor_routes WHERE tenant_id = @tenantId AND id IN (${placeholders})`,
    params
  );
  return normalizeIds((result.recordset || []).map((r) => getRow(r, 'id')));
}

async function replaceReportRoutes(reportId, tenantId, routeIds) {
  await query(`DELETE FROM project_progress_report_routes WHERE report_id = @reportId`, { reportId });
  const validRouteIds = await resolveValidRouteIds(tenantId, routeIds);
  for (const routeId of validRouteIds) {
    await query(
      `INSERT INTO project_progress_report_routes (report_id, route_id) VALUES (@reportId, @routeId)`,
      { reportId, routeId }
    );
  }
  return validRouteIds;
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

/** GET list project progress reports for current tenant (latest first) */
router.get('/', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'No tenant context' });
    const scopedRectorRouteIds = !hasAccessManagement(req) ? await getRectorRouteIds(req, tenantId) : [];
    const routePlaceholders = scopedRectorRouteIds.map((_, i) => `@routeId${i}`).join(',');
    const routeParams = { tenantId };
    scopedRectorRouteIds.forEach((id, i) => { routeParams[`routeId${i}`] = id; });
    const rectorScopeSql = scopedRectorRouteIds.length > 0
      ? `AND (
          NOT EXISTS (SELECT 1 FROM project_progress_report_routes rr0 WHERE rr0.report_id = r.id)
          OR EXISTS (
            SELECT 1 FROM project_progress_report_routes rr1
            WHERE rr1.report_id = r.id AND rr1.route_id IN (${routePlaceholders})
          )
        )`
      : '';
    const result = await query(
      `SELECT r.id, r.tenant_id, r.title, r.report_date, r.reporting_status, r.narrative_updates, r.phases_json, r.contractor_status_json, r.sanctions_text, r.conclusion_text, r.created_at, r.updated_at,
              STRING_AGG(CONVERT(NVARCHAR(36), rr.route_id), ',') AS route_ids_csv
       FROM project_progress_reports r
       LEFT JOIN project_progress_report_routes rr ON rr.report_id = r.id
       WHERE r.tenant_id = @tenantId
       ${rectorScopeSql}
       GROUP BY r.id, r.tenant_id, r.title, r.report_date, r.reporting_status, r.narrative_updates, r.phases_json, r.contractor_status_json, r.sanctions_text, r.conclusion_text, r.created_at, r.updated_at
       ORDER BY r.report_date DESC, r.updated_at DESC`,
      routeParams
    );
    const list = (result.recordset || []).map((r) => ({
      id: getRow(r, 'id'),
      tenant_id: getRow(r, 'tenant_id'),
      title: getRow(r, 'title'),
      report_date: getRow(r, 'report_date'),
      reporting_status: getRow(r, 'reporting_status'),
      narrative_updates: getRow(r, 'narrative_updates'),
      phases: parseJson(getRow(r, 'phases_json')),
      contractor_status: parseJson(getRow(r, 'contractor_status_json')),
      sanctions_text: getRow(r, 'sanctions_text'),
      conclusion_text: getRow(r, 'conclusion_text'),
      route_ids: csvToIds(getRow(r, 'route_ids_csv')),
      created_at: getRow(r, 'created_at'),
      updated_at: getRow(r, 'updated_at'),
    }));
    res.json({ reports: list });
  } catch (err) {
    next(err);
  }
});

/** GET one report by id (must belong to user's tenant) */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenantId = req.user?.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'No tenant context' });
    const scopedRectorRouteIds = !hasAccessManagement(req) ? await getRectorRouteIds(req, tenantId) : [];
    const routePlaceholders = scopedRectorRouteIds.map((_, i) => `@routeId${i}`).join(',');
    const params = { id, tenantId };
    scopedRectorRouteIds.forEach((rid, i) => { params[`routeId${i}`] = rid; });
    const rectorScopeSql = scopedRectorRouteIds.length > 0
      ? `AND (
          NOT EXISTS (SELECT 1 FROM project_progress_report_routes rr0 WHERE rr0.report_id = r.id)
          OR EXISTS (
            SELECT 1 FROM project_progress_report_routes rr1
            WHERE rr1.report_id = r.id AND rr1.route_id IN (${routePlaceholders})
          )
        )`
      : '';
    const result = await query(
      `SELECT r.id, r.tenant_id, r.title, r.report_date, r.reporting_status, r.narrative_updates, r.phases_json, r.contractor_status_json, r.sanctions_text, r.conclusion_text, r.created_at, r.updated_at,
              STRING_AGG(CONVERT(NVARCHAR(36), rr.route_id), ',') AS route_ids_csv
       FROM project_progress_reports r
       LEFT JOIN project_progress_report_routes rr ON rr.report_id = r.id
       WHERE r.id = @id AND r.tenant_id = @tenantId
       ${rectorScopeSql}
       GROUP BY r.id, r.tenant_id, r.title, r.report_date, r.reporting_status, r.narrative_updates, r.phases_json, r.contractor_status_json, r.sanctions_text, r.conclusion_text, r.created_at, r.updated_at`,
      params
    );
    const r = result.recordset?.[0];
    if (!r) return res.status(404).json({ error: 'Report not found' });
    res.json({
      report: {
        id: getRow(r, 'id'),
        tenant_id: getRow(r, 'tenant_id'),
        title: getRow(r, 'title'),
        report_date: getRow(r, 'report_date'),
        reporting_status: getRow(r, 'reporting_status'),
        narrative_updates: getRow(r, 'narrative_updates'),
        phases: parseJson(getRow(r, 'phases_json')),
        contractor_status: parseJson(getRow(r, 'contractor_status_json')),
        sanctions_text: getRow(r, 'sanctions_text'),
        conclusion_text: getRow(r, 'conclusion_text'),
        route_ids: csvToIds(getRow(r, 'route_ids_csv')),
        created_at: getRow(r, 'created_at'),
        updated_at: getRow(r, 'updated_at'),
      },
    });
  } catch (err) {
    next(err);
  }
});

/** POST create report (Access Management only) */
router.post('/', async (req, res, next) => {
  if (!req.user?.page_roles?.includes('access_management') && req.user?.role !== 'super_admin') {
    return res.status(403).json({ error: 'Only Access Management can create progress reports.' });
  }
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'No tenant context' });
    const body = req.body || {};
    const title = (body.title || '').toString().trim() || 'Project Progress Report';
    const reportDate = body.report_date || new Date().toISOString().slice(0, 10);
    const reportingStatus = (body.reporting_status || '').toString().trim() || null;
    const narrativeUpdates = (body.narrative_updates || '').toString().trim() || null;
    const phases = Array.isArray(body.phases) ? body.phases : [];
    const contractorStatus = Array.isArray(body.contractor_status) ? body.contractor_status : [];
    const routeIds = normalizeIds(body.route_ids);
    const sanctionsText = (body.sanctions_text || '').toString().trim() || null;
    const conclusionText = (body.conclusion_text || '').toString().trim() || null;
    const phasesJson = JSON.stringify(phases);
    const contractorStatusJson = JSON.stringify(contractorStatus);
    const result = await query(
      `INSERT INTO project_progress_reports (tenant_id, title, report_date, reporting_status, narrative_updates, phases_json, contractor_status_json, sanctions_text, conclusion_text, created_by_user_id)
       OUTPUT INSERTED.id, INSERTED.title, INSERTED.report_date, INSERTED.reporting_status, INSERTED.created_at
       VALUES (@tenantId, @title, @reportDate, @reportingStatus, @narrativeUpdates, @phasesJson, @contractorStatusJson, @sanctionsText, @conclusionText, @userId)`,
      {
        tenantId,
        title,
        reportDate,
        reportingStatus,
        narrativeUpdates,
        phasesJson,
        contractorStatusJson,
        sanctionsText,
        conclusionText,
        userId: req.user?.id || null,
      }
    );
    const row = result.recordset?.[0];
    const savedRouteIds = await replaceReportRoutes(getRow(row, 'id'), tenantId, routeIds);
    res.status(201).json({
      report: {
        id: getRow(row, 'id'),
        title: getRow(row, 'title'),
        report_date: getRow(row, 'report_date'),
        reporting_status: getRow(row, 'reporting_status'),
        route_ids: savedRouteIds,
        created_at: getRow(row, 'created_at'),
      },
    });
  } catch (err) {
    next(err);
  }
});

/** PATCH update report (Access Management only) */
router.patch('/:id', async (req, res, next) => {
  if (!req.user?.page_roles?.includes('access_management') && req.user?.role !== 'super_admin') {
    return res.status(403).json({ error: 'Only Access Management can update progress reports.' });
  }
  try {
    const { id } = req.params;
    const tenantId = req.user?.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'No tenant context' });
    const body = req.body || {};
    const updates = [];
    const params = { id, tenantId };
    if (body.title !== undefined) { updates.push('title = @title'); params.title = String(body.title).trim() || 'Project Progress Report'; }
    if (body.report_date !== undefined) { updates.push('report_date = @reportDate'); params.reportDate = body.report_date; }
    if (body.reporting_status !== undefined) { updates.push('reporting_status = @reportingStatus'); params.reportingStatus = (body.reporting_status || '').toString().trim() || null; }
    if (body.narrative_updates !== undefined) { updates.push('narrative_updates = @narrativeUpdates'); params.narrativeUpdates = (body.narrative_updates || '').toString().trim() || null; }
    if (body.phases !== undefined) { updates.push('phases_json = @phasesJson'); params.phasesJson = JSON.stringify(Array.isArray(body.phases) ? body.phases : []); }
    if (body.contractor_status !== undefined) { updates.push('contractor_status_json = @contractorStatusJson'); params.contractorStatusJson = JSON.stringify(Array.isArray(body.contractor_status) ? body.contractor_status : []); }
    if (body.sanctions_text !== undefined) { updates.push('sanctions_text = @sanctionsText'); params.sanctionsText = (body.sanctions_text || '').toString().trim() || null; }
    if (body.conclusion_text !== undefined) { updates.push('conclusion_text = @conclusionText'); params.conclusionText = (body.conclusion_text || '').toString().trim() || null; }
    const routeIdsProvided = body.route_ids !== undefined;
    const routeIds = normalizeIds(body.route_ids);
    if (updates.length === 0 && !routeIdsProvided) return res.status(400).json({ error: 'No fields to update' });
    if (updates.length > 0) {
      updates.push('updated_at = SYSUTCDATETIME()');
      const result = await query(
        `UPDATE project_progress_reports SET ${updates.join(', ')} OUTPUT INSERTED.id WHERE id = @id AND tenant_id = @tenantId`,
        params
      );
      if (!result.recordset?.[0]) return res.status(404).json({ error: 'Report not found' });
    } else {
      const exists = await query(`SELECT id FROM project_progress_reports WHERE id = @id AND tenant_id = @tenantId`, { id, tenantId });
      if (!exists.recordset?.[0]) return res.status(404).json({ error: 'Report not found' });
    }
    const getResult = await query(
      `SELECT id, title, report_date, reporting_status, narrative_updates, phases_json, contractor_status_json, sanctions_text, conclusion_text, updated_at
       FROM project_progress_reports WHERE id = @id`,
      { id }
    );
    const r = getResult.recordset?.[0];
    const reportId = getRow(r, 'id');
    const savedRouteIds = routeIdsProvided
      ? await replaceReportRoutes(reportId, tenantId, routeIds)
      : await (async () => {
        const rr = await query(`SELECT route_id FROM project_progress_report_routes WHERE report_id = @reportId`, { reportId });
        return normalizeIds((rr.recordset || []).map((x) => getRow(x, 'route_id')));
      })();
    res.json({
      report: {
        id: getRow(r, 'id'),
        title: getRow(r, 'title'),
        report_date: getRow(r, 'report_date'),
        reporting_status: getRow(r, 'reporting_status'),
        narrative_updates: getRow(r, 'narrative_updates'),
        phases: parseJson(getRow(r, 'phases_json')),
        contractor_status: parseJson(getRow(r, 'contractor_status_json')),
        sanctions_text: getRow(r, 'sanctions_text'),
        conclusion_text: getRow(r, 'conclusion_text'),
        route_ids: savedRouteIds,
        updated_at: getRow(r, 'updated_at'),
      },
    });
  } catch (err) {
    next(err);
  }
});

/** DELETE report (Access Management only) */
router.delete('/:id', async (req, res, next) => {
  if (!req.user?.page_roles?.includes('access_management') && req.user?.role !== 'super_admin') {
    return res.status(403).json({ error: 'Only Access Management can delete progress reports.' });
  }
  try {
    const { id } = req.params;
    const tenantId = req.user?.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'No tenant context' });
    const result = await query(
      `DELETE FROM project_progress_reports OUTPUT DELETED.id WHERE id = @id AND tenant_id = @tenantId`,
      { id, tenantId }
    );
    if (!result.recordset?.[0]) return res.status(404).json({ error: 'Report not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** POST send progress report by email (to selected users + CC). Body: { to_user_ids: [], cc_emails: []|string, message?: string, pdf_base64: string, pdf_filename: string } */
router.post('/:id/send-email', async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenantId = req.user?.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'No tenant context' });
    if (!isEmailConfigured()) return res.status(503).json({ error: 'Email is not configured. Contact your administrator.' });

    const reportResult = await query(
      `SELECT id, title, report_date, reporting_status FROM project_progress_reports WHERE id = @id AND tenant_id = @tenantId`,
      { id, tenantId }
    );
    const reportRow = reportResult.recordset?.[0];
    if (!reportRow) return res.status(404).json({ error: 'Report not found' });

    const body = req.body || {};
    const toUserIds = Array.isArray(body.to_user_ids) ? body.to_user_ids : [];
    let ccEmails = body.cc_emails;
    if (typeof ccEmails === 'string') ccEmails = ccEmails.split(/[\s,;]+/).map((e) => e.trim()).filter((e) => e && e.includes('@'));
    else if (!Array.isArray(ccEmails)) ccEmails = [];
    else ccEmails = ccEmails.map((e) => String(e).trim()).filter((e) => e && e.includes('@'));

    const pdfBase64 = body.pdf_base64 && String(body.pdf_base64).trim();
    const pdfFilename = (body.pdf_filename && String(body.pdf_filename).trim()) || 'progress-report.pdf';
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

    const reportTitle = getRow(reportRow, 'title');
    const reportDate = getRow(reportRow, 'report_date');
    const reportingStatus = getRow(reportRow, 'reporting_status');
    const senderName = req.user?.full_name || req.user?.email || null;
    const message = (body.message && String(body.message).trim()) || '';
    const appUrl = (process.env.APP_URL || process.env.FRONTEND_URL || '').trim() || 'https://thinkersafrika.co.za';

    const html = progressReportSharedHtml({
      reportTitle,
      reportDate,
      reportingStatus,
      senderName,
      message,
      appUrl,
    });

    const attachments = [
      { filename: pdfFilename, content: pdfBase64, encoding: 'base64' },
    ];

    await sendEmail({
      to: toEmails.length > 0 ? toEmails : ccEmails,
      cc: toEmails.length > 0 && ccEmails.length > 0 ? ccEmails : undefined,
      subject: `Progress report: ${reportTitle || 'Project Progress Report'}`,
      body: html,
      html: true,
      attachments,
    });

    res.json({ ok: true, message: 'Email sent successfully.' });
  } catch (err) {
    next(err);
  }
});

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

export default router;
