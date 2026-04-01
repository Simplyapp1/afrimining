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
  await query(`DELETE FROM monthly_performance_report_routes WHERE report_id = @reportId`, { reportId });
  const validRouteIds = await resolveValidRouteIds(tenantId, routeIds);
  for (const routeId of validRouteIds) {
    await query(
      `INSERT INTO monthly_performance_report_routes (report_id, route_id) VALUES (@reportId, @routeId)`,
      { reportId, routeId }
    );
  }
  return validRouteIds;
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
    const scopedRectorRouteIds = !hasAccessManagement(req) ? await getRectorRouteIds(req, tenantId) : [];
    const routePlaceholders = scopedRectorRouteIds.map((_, i) => `@routeId${i}`).join(',');
    const params = { tenantId };
    scopedRectorRouteIds.forEach((id, i) => { params[`routeId${i}`] = id; });
    const rectorScopeSql = scopedRectorRouteIds.length > 0
      ? `AND (
          NOT EXISTS (SELECT 1 FROM monthly_performance_report_routes rr0 WHERE rr0.report_id = r.id)
          OR EXISTS (
            SELECT 1 FROM monthly_performance_report_routes rr1
            WHERE rr1.report_id = r.id AND rr1.route_id IN (${routePlaceholders})
          )
        )`
      : '';
    const result = await query(
      `SELECT r.id, r.tenant_id, r.title, r.reporting_period_start, r.reporting_period_end, r.submitted_date, r.prepared_by, r.executive_summary, r.key_metrics_json, r.sections_json, r.breakdowns_json, r.fleet_performance_json, r.created_at, r.updated_at,
              STRING_AGG(CONVERT(NVARCHAR(36), rr.route_id), ',') AS route_ids_csv
       FROM monthly_performance_reports r
       LEFT JOIN monthly_performance_report_routes rr ON rr.report_id = r.id
       WHERE r.tenant_id = @tenantId
       ${rectorScopeSql}
       GROUP BY r.id, r.tenant_id, r.title, r.reporting_period_start, r.reporting_period_end, r.submitted_date, r.prepared_by, r.executive_summary, r.key_metrics_json, r.sections_json, r.breakdowns_json, r.fleet_performance_json, r.created_at, r.updated_at
       ORDER BY r.submitted_date DESC, r.updated_at DESC`,
      params
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
    const scopedRectorRouteIds = !hasAccessManagement(req) ? await getRectorRouteIds(req, tenantId) : [];
    const routePlaceholders = scopedRectorRouteIds.map((_, i) => `@routeId${i}`).join(',');
    const params = { id, tenantId };
    scopedRectorRouteIds.forEach((rid, i) => { params[`routeId${i}`] = rid; });
    const rectorScopeSql = scopedRectorRouteIds.length > 0
      ? `AND (
          NOT EXISTS (SELECT 1 FROM monthly_performance_report_routes rr0 WHERE rr0.report_id = r.id)
          OR EXISTS (
            SELECT 1 FROM monthly_performance_report_routes rr1
            WHERE rr1.report_id = r.id AND rr1.route_id IN (${routePlaceholders})
          )
        )`
      : '';
    const result = await query(
      `SELECT r.id, r.tenant_id, r.title, r.reporting_period_start, r.reporting_period_end, r.submitted_date, r.prepared_by, r.executive_summary, r.key_metrics_json, r.sections_json, r.breakdowns_json, r.fleet_performance_json, r.created_at, r.updated_at,
              STRING_AGG(CONVERT(NVARCHAR(36), rr.route_id), ',') AS route_ids_csv
       FROM monthly_performance_reports r
       LEFT JOIN monthly_performance_report_routes rr ON rr.report_id = r.id
       WHERE r.id = @id AND r.tenant_id = @tenantId
       ${rectorScopeSql}
       GROUP BY r.id, r.tenant_id, r.title, r.reporting_period_start, r.reporting_period_end, r.submitted_date, r.prepared_by, r.executive_summary, r.key_metrics_json, r.sections_json, r.breakdowns_json, r.fleet_performance_json, r.created_at, r.updated_at`,
      params
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
    route_ids: csvToIds(getRow(r, 'route_ids_csv')),
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
    const routeIds = normalizeIds(body.route_ids);
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
    const savedRouteIds = await replaceReportRoutes(getRow(row, 'id'), tenantId, routeIds);
    res.status(201).json({
      report: {
        id: getRow(row, 'id'),
        title: getRow(row, 'title'),
        submitted_date: getRow(row, 'submitted_date'),
        route_ids: savedRouteIds,
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
    const routeIdsProvided = body.route_ids !== undefined;
    const routeIds = normalizeIds(body.route_ids);
    if (updates.length === 0 && !routeIdsProvided) return res.status(400).json({ error: 'No fields to update' });
    if (updates.length > 0) {
      updates.push('updated_at = SYSUTCDATETIME()');
      const result = await query(
        `UPDATE monthly_performance_reports SET ${updates.join(', ')} OUTPUT INSERTED.id WHERE id = @id AND tenant_id = @tenantId`,
        params
      );
      if (!result.recordset?.[0]) return res.status(404).json({ error: 'Report not found' });
    } else {
      const exists = await query(`SELECT id FROM monthly_performance_reports WHERE id = @id AND tenant_id = @tenantId`, { id, tenantId });
      if (!exists.recordset?.[0]) return res.status(404).json({ error: 'Report not found' });
    }
    const getResult = await query(
      `SELECT id, tenant_id, title, reporting_period_start, reporting_period_end, submitted_date, prepared_by, executive_summary, key_metrics_json, sections_json, breakdowns_json, fleet_performance_json, updated_at
       FROM monthly_performance_reports WHERE id = @id`,
      { id }
    );
    const report = mapRow(getResult.recordset?.[0]);
    const reportId = report?.id;
    const savedRouteIds = routeIdsProvided
      ? await replaceReportRoutes(reportId, tenantId, routeIds)
      : await (async () => {
        const rr = await query(`SELECT route_id FROM monthly_performance_report_routes WHERE report_id = @reportId`, { reportId });
        return normalizeIds((rr.recordset || []).map((x) => getRow(x, 'route_id')));
      })();
    res.json({ report: { ...report, route_ids: savedRouteIds } });
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
