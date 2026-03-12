import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, loadUser, requirePageAccess } from '../middleware/auth.js';

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

/** GET list users for recipient selection (same tenant) */
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

/** GET list monthly performance reports for current tenant (latest first) */
router.get('/', async (req, res, next) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'No tenant context' });
    const result = await query(
      `SELECT id, tenant_id, title, reporting_period_start, reporting_period_end, submitted_date, prepared_by, executive_summary, key_metrics_json, sections_json, breakdowns_json, fleet_performance_json, created_at, updated_at
       FROM monthly_performance_reports
       WHERE tenant_id = @tenantId
       ORDER BY submitted_date DESC, updated_at DESC`,
      { tenantId }
    );
    const list = (result.recordset || []).map((r) => mapRow(r));
    res.json({ reports: list });
  } catch (err) {
    next(err);
  }
});

/** GET one report by id */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenantId = req.user?.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'No tenant context' });
    const result = await query(
      `SELECT id, tenant_id, title, reporting_period_start, reporting_period_end, submitted_date, prepared_by, executive_summary, key_metrics_json, sections_json, breakdowns_json, fleet_performance_json, created_at, updated_at
       FROM monthly_performance_reports
       WHERE id = @id AND tenant_id = @tenantId`,
      { id, tenantId }
    );
    const r = result.recordset?.[0];
    if (!r) return res.status(404).json({ error: 'Report not found' });
    res.json({ report: mapRow(r) });
  } catch (err) {
    next(err);
  }
});

function mapRow(r) {
  return {
    id: getRow(r, 'id'),
    tenant_id: getRow(r, 'tenant_id'),
    title: getRow(r, 'title'),
    reporting_period_start: getRow(r, 'reporting_period_start'),
    reporting_period_end: getRow(r, 'reporting_period_end'),
    submitted_date: getRow(r, 'submitted_date'),
    prepared_by: getRow(r, 'prepared_by'),
    executive_summary: getRow(r, 'executive_summary'),
    key_metrics: parseJson(getRow(r, 'key_metrics_json')),
    sections: parseJson(getRow(r, 'sections_json')),
    breakdowns: parseJson(getRow(r, 'breakdowns_json')),
    fleet_performance: parseJson(getRow(r, 'fleet_performance_json')),
    created_at: getRow(r, 'created_at'),
    updated_at: getRow(r, 'updated_at'),
  };
}

/** POST create (Access Management only) */
router.post('/', async (req, res, next) => {
  if (!req.user?.page_roles?.includes('access_management') && req.user?.role !== 'super_admin') {
    return res.status(403).json({ error: 'Only Access Management can create monthly performance reports.' });
  }
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'No tenant context' });
    const body = req.body || {};
    const title = (body.title || '').toString().trim() || 'Monthly Performance Report';
    const periodStart = body.reporting_period_start || null;
    const periodEnd = body.reporting_period_end || null;
    const submittedDate = body.submitted_date || new Date().toISOString().slice(0, 10);
    const preparedBy = (body.prepared_by || '').toString().trim() || null;
    const executiveSummary = (body.executive_summary || '').toString().trim() || null;
    const keyMetricsJson = JSON.stringify(Array.isArray(body.key_metrics) ? body.key_metrics : []);
    const sectionsJson = JSON.stringify(Array.isArray(body.sections) ? body.sections : []);
    const breakdownsJson = JSON.stringify(Array.isArray(body.breakdowns) ? body.breakdowns : []);
    const fleetPerformanceJson = JSON.stringify(Array.isArray(body.fleet_performance) ? body.fleet_performance : []);

    const result = await query(
      `INSERT INTO monthly_performance_reports (tenant_id, title, reporting_period_start, reporting_period_end, submitted_date, prepared_by, executive_summary, key_metrics_json, sections_json, breakdowns_json, fleet_performance_json, created_by_user_id)
       OUTPUT INSERTED.id, INSERTED.title, INSERTED.submitted_date, INSERTED.created_at
       VALUES (@tenantId, @title, @periodStart, @periodEnd, @submittedDate, @preparedBy, @executiveSummary, @keyMetricsJson, @sectionsJson, @breakdownsJson, @fleetPerformanceJson, @userId)`,
      {
        tenantId,
        title,
        periodStart,
        periodEnd,
        submittedDate,
        preparedBy,
        executiveSummary,
        keyMetricsJson,
        sectionsJson,
        breakdownsJson,
        fleetPerformanceJson,
        userId: req.user?.id || null,
      }
    );
    const row = result.recordset?.[0];
    res.status(201).json({
      report: {
        id: getRow(row, 'id'),
        title: getRow(row, 'title'),
        submitted_date: getRow(row, 'submitted_date'),
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
    return res.status(403).json({ error: 'Only Access Management can update monthly performance reports.' });
  }
  try {
    const { id } = req.params;
    const tenantId = req.user?.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'No tenant context' });
    const body = req.body || {};
    const updates = [];
    const params = { id, tenantId };
    if (body.title !== undefined) { updates.push('title = @title'); params.title = (body.title || '').toString().trim() || 'Monthly Performance Report'; }
    if (body.reporting_period_start !== undefined) { updates.push('reporting_period_start = @periodStart'); params.periodStart = body.reporting_period_start; }
    if (body.reporting_period_end !== undefined) { updates.push('reporting_period_end = @periodEnd'); params.periodEnd = body.reporting_period_end; }
    if (body.submitted_date !== undefined) { updates.push('submitted_date = @submittedDate'); params.submittedDate = body.submitted_date; }
    if (body.prepared_by !== undefined) { updates.push('prepared_by = @preparedBy'); params.preparedBy = (body.prepared_by || '').toString().trim() || null; }
    if (body.executive_summary !== undefined) { updates.push('executive_summary = @executiveSummary'); params.executiveSummary = (body.executive_summary || '').toString().trim() || null; }
    if (body.key_metrics !== undefined) { updates.push('key_metrics_json = @keyMetricsJson'); params.keyMetricsJson = JSON.stringify(Array.isArray(body.key_metrics) ? body.key_metrics : []); }
    if (body.sections !== undefined) { updates.push('sections_json = @sectionsJson'); params.sectionsJson = JSON.stringify(Array.isArray(body.sections) ? body.sections : []); }
    if (body.breakdowns !== undefined) { updates.push('breakdowns_json = @breakdownsJson'); params.breakdownsJson = JSON.stringify(Array.isArray(body.breakdowns) ? body.breakdowns : []); }
    if (body.fleet_performance !== undefined) { updates.push('fleet_performance_json = @fleetPerformanceJson'); params.fleetPerformanceJson = JSON.stringify(Array.isArray(body.fleet_performance) ? body.fleet_performance : []); }
    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
    updates.push('updated_at = SYSUTCDATETIME()');

    const result = await query(
      `UPDATE monthly_performance_reports SET ${updates.join(', ')} OUTPUT INSERTED.id WHERE id = @id AND tenant_id = @tenantId`,
      params
    );
    if (!result.recordset?.[0]) return res.status(404).json({ error: 'Report not found' });
    const getResult = await query(
      `SELECT id, tenant_id, title, reporting_period_start, reporting_period_end, submitted_date, prepared_by, executive_summary, key_metrics_json, sections_json, breakdowns_json, fleet_performance_json, updated_at
       FROM monthly_performance_reports WHERE id = @id`,
      { id }
    );
    res.json({ report: mapRow(getResult.recordset?.[0]) });
  } catch (err) {
    next(err);
  }
});

/** DELETE (Access Management only) */
router.delete('/:id', async (req, res, next) => {
  if (!req.user?.page_roles?.includes('access_management') && req.user?.role !== 'super_admin') {
    return res.status(403).json({ error: 'Only Access Management can delete monthly performance reports.' });
  }
  try {
    const { id } = req.params;
    const tenantId = req.user?.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'No tenant context' });
    const result = await query(
      `DELETE FROM monthly_performance_reports OUTPUT DELETED.id WHERE id = @id AND tenant_id = @tenantId`,
      { id, tenantId }
    );
    if (!result.recordset?.[0]) return res.status(404).json({ error: 'Report not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
