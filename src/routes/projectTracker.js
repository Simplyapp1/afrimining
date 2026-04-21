/**
 * Project Tracker — projects, phases (design), implementation logs, finance, attachments, notes.
 */
import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { query } from '../db.js';
import { requireAuth, loadUser, requirePageAccess } from '../middleware/auth.js';

const router = Router();

const uploadsRoot = path.join(process.cwd(), 'uploads', 'project-tracker');
const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tenantId = String(req.user?.tenant_id || 'anon');
    const projectId = String(req.params?.projectId || 'new');
    const dir = path.join(uploadsRoot, tenantId, projectId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const safe = (file.originalname || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});
const uploadMany = multer({ storage: uploadStorage, limits: { fileSize: 25 * 1024 * 1024 } }).fields([
  { name: 'file', maxCount: 1 },
  { name: 'files', maxCount: 25 },
]);

function getRow(row, key) {
  if (!row) return undefined;
  const k = Object.keys(row).find((x) => x && String(x).toLowerCase() === String(key).toLowerCase());
  return k ? row[k] : undefined;
}

function canAccessTenant(req, tenantId) {
  if (req.user?.role === 'super_admin') return true;
  const tid = req.user?.tenant_id;
  if (!tid || !tenantId) return false;
  if (Array.isArray(req.user?.tenant_ids)) return req.user.tenant_ids.includes(tenantId);
  return tid === tenantId;
}

async function loadProject(req, projectId) {
  const r = await query(
    `SELECT p.*, u.full_name AS owner_name
     FROM project_tracker_projects p
     LEFT JOIN users u ON u.id = p.owner_user_id
     WHERE p.id = @id`,
    { id: projectId }
  );
  const row = r.recordset?.[0];
  if (!row || !canAccessTenant(req, getRow(row, 'tenant_id'))) return null;
  return row;
}

function mapProject(row) {
  if (!row) return null;
  return {
    id: getRow(row, 'id'),
    tenant_id: getRow(row, 'tenant_id'),
    title: getRow(row, 'title'),
    code: getRow(row, 'code'),
    description: getRow(row, 'description'),
    sponsor: getRow(row, 'sponsor'),
    site_location: getRow(row, 'site_location'),
    planned_start_date: getRow(row, 'planned_start_date'),
    planned_end_date: getRow(row, 'planned_end_date'),
    actual_start_date: getRow(row, 'actual_start_date'),
    actual_end_date: getRow(row, 'actual_end_date'),
    overall_budget: getRow(row, 'overall_budget'),
    status: getRow(row, 'status'),
    owner_user_id: getRow(row, 'owner_user_id'),
    owner_name: getRow(row, 'owner_name'),
    created_by: getRow(row, 'created_by'),
    created_at: getRow(row, 'created_at'),
    updated_at: getRow(row, 'updated_at'),
  };
}

router.use(requireAuth);
router.use(loadUser);

router.get('/dashboard', requirePageAccess('project_tracker'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'No tenant' });
    const counts = await query(
      `SELECT
         COUNT(*) AS project_count,
         SUM(CASE WHEN status IN (N'active', N'registered') THEN 1 ELSE 0 END) AS active_projects
       FROM project_tracker_projects WHERE tenant_id = @tenantId`,
      { tenantId }
    );
    const phaseOpen = await query(
      `SELECT COUNT(*) AS c
       FROM project_tracker_phases ph
       INNER JOIN project_tracker_projects p ON p.id = ph.project_id
       WHERE p.tenant_id = @tenantId AND ph.status IN (N'open', N'in_progress')`,
      { tenantId }
    );
    const budget = await query(
      `SELECT
         (SELECT ISNULL(SUM(overall_budget), 0) FROM project_tracker_projects WHERE tenant_id = @tenantId) AS total_budget,
         (SELECT ISNULL(SUM(budget_allocated), 0) FROM project_tracker_phases ph
            INNER JOIN project_tracker_projects p ON p.id = ph.project_id WHERE p.tenant_id = @tenantId) AS phases_budget`,
      { tenantId }
    );
    const recentLogs = await query(
      `SELECT TOP 8 l.id, l.phase_id, l.progress_percent, l.created_at, l.work_transcript,
              ph.name AS phase_name, p.title AS project_title, p.id AS project_id
       FROM project_tracker_implementation_logs l
       INNER JOIN project_tracker_phases ph ON ph.id = l.phase_id
       INNER JOIN project_tracker_projects p ON p.id = ph.project_id
       WHERE p.tenant_id = @tenantId
       ORDER BY l.created_at DESC`,
      { tenantId }
    );
    const c0 = counts.recordset?.[0] || {};
    const c1 = phaseOpen.recordset?.[0] || {};
    const b0 = budget.recordset?.[0] || {};
    res.json({
      project_count: parseInt(getRow(c0, 'project_count'), 10) || 0,
      active_projects: parseInt(getRow(c0, 'active_projects'), 10) || 0,
      open_phases: parseInt(getRow(c1, 'c'), 10) || 0,
      total_planned_budget: parseFloat(getRow(b0, 'total_budget')) || 0,
      phases_allocated_budget: parseFloat(getRow(b0, 'phases_budget')) || 0,
      recent_logs: (recentLogs.recordset || []).map((r) => ({
        id: getRow(r, 'id'),
        phase_id: getRow(r, 'phase_id'),
        project_id: getRow(r, 'project_id'),
        project_title: getRow(r, 'project_title'),
        phase_name: getRow(r, 'phase_name'),
        progress_percent: getRow(r, 'progress_percent'),
        created_at: getRow(r, 'created_at'),
        work_transcript_preview: String(getRow(r, 'work_transcript') || '').slice(0, 200),
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/projects', requirePageAccess('project_tracker'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'No tenant' });
    const r = await query(
      `SELECT p.*, u.full_name AS owner_name,
        (SELECT COUNT(*) FROM project_tracker_phases ph WHERE ph.project_id = p.id) AS phase_count,
        (SELECT COUNT(*) FROM project_tracker_phases ph WHERE ph.project_id = p.id AND ph.status IN (N'open', N'in_progress')) AS open_phase_count
       FROM project_tracker_projects p
       LEFT JOIN users u ON u.id = p.owner_user_id
       WHERE p.tenant_id = @tenantId
       ORDER BY p.updated_at DESC`,
      { tenantId }
    );
    const projects = (r.recordset || []).map((row) => ({
      ...mapProject(row),
      phase_count: getRow(row, 'phase_count'),
      open_phase_count: getRow(row, 'open_phase_count'),
    }));
    res.json({ projects });
  } catch (err) {
    next(err);
  }
});

router.post('/projects', requirePageAccess('project_tracker'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'No tenant' });
    const b = req.body || {};
    const title = String(b.title || '').trim();
    if (!title) return res.status(400).json({ error: 'title required' });
    const allowedStatus = new Set(['draft', 'registered', 'active', 'on_hold', 'completed', 'cancelled']);
    const st = b.status && String(b.status).toLowerCase();
    const status = st && allowedStatus.has(st) ? st : 'draft';
    const ins = await query(
      `INSERT INTO project_tracker_projects (
         tenant_id, title, code, description, sponsor, site_location,
         planned_start_date, planned_end_date, actual_start_date, actual_end_date,
         overall_budget, status, owner_user_id, created_by
       )
       OUTPUT INSERTED.*
       VALUES (
         @tenantId, @title, @code, @description, @sponsor, @siteLocation,
         @plannedStart, @plannedEnd, @actualStart, @actualEnd,
         @overallBudget, @status, @ownerId, @createdBy
       )`,
      {
        tenantId,
        title,
        code: b.code ? String(b.code).trim().slice(0, 80) : null,
        description: b.description ? String(b.description) : null,
        sponsor: b.sponsor ? String(b.sponsor).slice(0, 500) : null,
        siteLocation: b.site_location ? String(b.site_location).slice(0, 500) : null,
        plannedStart: b.planned_start_date || null,
        plannedEnd: b.planned_end_date || null,
        actualStart: b.actual_start_date || null,
        actualEnd: b.actual_end_date || null,
        overallBudget: b.overall_budget != null ? Number(b.overall_budget) : null,
        status,
        ownerId: b.owner_user_id || null,
        createdBy: req.user.id,
      }
    );
    const row = ins.recordset?.[0];
    res.status(201).json({ project: mapProject(row) });
  } catch (err) {
    next(err);
  }
});

router.get('/projects/:projectId', requirePageAccess('project_tracker'), async (req, res, next) => {
  try {
    const row = await loadProject(req, req.params.projectId);
    if (!row) return res.status(404).json({ error: 'Project not found' });
    const pid = getRow(row, 'id');
    const phasesR = await query(
      `SELECT ph.* FROM project_tracker_phases ph WHERE ph.project_id = @pid ORDER BY ph.sort_order, ph.created_at`,
      { pid }
    );
    const phases = [];
    for (const ph of phasesR.recordset || []) {
      const phaseId = getRow(ph, 'id');
      const mem = await query(
        `SELECT m.*, u.full_name, u.email
         FROM project_tracker_phase_members m
         INNER JOIN users u ON u.id = m.user_id
         WHERE m.phase_id = @phaseId`,
        { phaseId }
      );
      phases.push({
        id: phaseId,
        project_id: getRow(ph, 'project_id'),
        sort_order: getRow(ph, 'sort_order'),
        name: getRow(ph, 'name'),
        description: getRow(ph, 'description'),
        actions_required: getRow(ph, 'actions_required'),
        budget_allocated: getRow(ph, 'budget_allocated'),
        requirements_summary: getRow(ph, 'requirements_summary'),
        status: getRow(ph, 'status'),
        planned_start: getRow(ph, 'planned_start'),
        planned_end: getRow(ph, 'planned_end'),
        created_at: getRow(ph, 'created_at'),
        updated_at: getRow(ph, 'updated_at'),
        members: (mem.recordset || []).map((m) => ({
          id: getRow(m, 'id'),
          user_id: getRow(m, 'user_id'),
          full_name: getRow(m, 'full_name'),
          email: getRow(m, 'email'),
          role_title: getRow(m, 'role_title'),
          requirements_notes: getRow(m, 'requirements_notes'),
        })),
      });
    }
    res.json({ project: mapProject(row), phases });
  } catch (err) {
    next(err);
  }
});

router.patch('/projects/:projectId', requirePageAccess('project_tracker'), async (req, res, next) => {
  try {
    const row = await loadProject(req, req.params.projectId);
    if (!row) return res.status(404).json({ error: 'Project not found' });
    const b = req.body || {};
    const pid = getRow(row, 'id');
    const allowedStatus = new Set(['draft', 'registered', 'active', 'on_hold', 'completed', 'cancelled']);
    let statusSet = 0;
    let statusVal = null;
    if (b.status !== undefined) {
      const st = String(b.status || '').toLowerCase();
      if (!allowedStatus.has(st)) return res.status(400).json({ error: 'Invalid status' });
      statusSet = 1;
      statusVal = st;
    }
    await query(
      `UPDATE project_tracker_projects SET
         title = COALESCE(@title, title),
         code = CASE WHEN @codeSet = 1 THEN @code ELSE code END,
         description = CASE WHEN @descSet = 1 THEN @description ELSE description END,
         sponsor = CASE WHEN @sponsorSet = 1 THEN @sponsor ELSE sponsor END,
         site_location = CASE WHEN @siteSet = 1 THEN @site ELSE site_location END,
         planned_start_date = CASE WHEN @psSet = 1 THEN @plannedStart ELSE planned_start_date END,
         planned_end_date = CASE WHEN @peSet = 1 THEN @plannedEnd ELSE planned_end_date END,
         actual_start_date = CASE WHEN @asSet = 1 THEN @actualStart ELSE actual_start_date END,
         actual_end_date = CASE WHEN @aeSet = 1 THEN @actualEnd ELSE actual_end_date END,
         overall_budget = CASE WHEN @obSet = 1 THEN @overallBudget ELSE overall_budget END,
         status = CASE WHEN @statusSet = 1 THEN @statusVal ELSE status END,
         owner_user_id = CASE WHEN @ownerSet = 1 THEN @ownerId ELSE owner_user_id END,
         updated_at = SYSUTCDATETIME()
       WHERE id = @pid`,
      {
        pid,
        title: b.title != null ? String(b.title).trim().slice(0, 500) : null,
        codeSet: b.code !== undefined ? 1 : 0,
        code: b.code != null ? String(b.code).trim().slice(0, 80) : null,
        descSet: b.description !== undefined ? 1 : 0,
        description: b.description != null ? String(b.description) : null,
        sponsorSet: b.sponsor !== undefined ? 1 : 0,
        sponsor: b.sponsor != null ? String(b.sponsor).slice(0, 500) : null,
        siteSet: b.site_location !== undefined ? 1 : 0,
        site: b.site_location != null ? String(b.site_location).slice(0, 500) : null,
        psSet: b.planned_start_date !== undefined ? 1 : 0,
        plannedStart: b.planned_start_date || null,
        peSet: b.planned_end_date !== undefined ? 1 : 0,
        plannedEnd: b.planned_end_date || null,
        asSet: b.actual_start_date !== undefined ? 1 : 0,
        actualStart: b.actual_start_date || null,
        aeSet: b.actual_end_date !== undefined ? 1 : 0,
        actualEnd: b.actual_end_date || null,
        obSet: b.overall_budget !== undefined ? 1 : 0,
        overallBudget: b.overall_budget != null ? Number(b.overall_budget) : null,
        statusSet,
        statusVal,
        ownerSet: b.owner_user_id !== undefined ? 1 : 0,
        ownerId: b.owner_user_id || null,
      }
    );
    const fresh = await loadProject(req, pid);
    res.json({ project: mapProject(fresh) });
  } catch (err) {
    next(err);
  }
});

router.delete('/projects/:projectId', requirePageAccess('project_tracker'), async (req, res, next) => {
  try {
    if (req.user.role !== 'super_admin' && req.user.role !== 'tenant_admin') {
      return res.status(403).json({ error: 'Only administrators can delete projects' });
    }
    const row = await loadProject(req, req.params.projectId);
    if (!row) return res.status(404).json({ error: 'Project not found' });
    await query(`DELETE FROM project_tracker_projects WHERE id = @id`, { id: getRow(row, 'id') });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/projects/:projectId/phases', requirePageAccess('project_tracker'), async (req, res, next) => {
  try {
    const row = await loadProject(req, req.params.projectId);
    if (!row) return res.status(404).json({ error: 'Project not found' });
    const b = req.body || {};
    const name = String(b.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name required' });
    const phAllowed = new Set(['planned', 'open', 'in_progress', 'completed', 'blocked']);
    const pst = b.status ? String(b.status).toLowerCase() : 'planned';
    const phStatus = phAllowed.has(pst) ? pst : 'planned';
    const ins = await query(
      `INSERT INTO project_tracker_phases (
         project_id, sort_order, name, description, actions_required, budget_allocated,
         requirements_summary, status, planned_start, planned_end
       ) OUTPUT INSERTED.*
       VALUES (@pid, @sort, @name, @description, @actions, @budget, @reqSummary, @status, @pstart, @pend)`,
      {
        pid: getRow(row, 'id'),
        sort: b.sort_order != null ? parseInt(b.sort_order, 10) : 0,
        name: name.slice(0, 300),
        description: b.description ? String(b.description) : null,
        actions: b.actions_required ? String(b.actions_required) : null,
        budget: b.budget_allocated != null ? Number(b.budget_allocated) : null,
        reqSummary: b.requirements_summary ? String(b.requirements_summary) : null,
        status: phStatus,
        pstart: b.planned_start || null,
        pend: b.planned_end || null,
      }
    );
    const ph = ins.recordset?.[0];
    res.status(201).json({
      phase: {
        id: getRow(ph, 'id'),
        project_id: getRow(ph, 'project_id'),
        sort_order: getRow(ph, 'sort_order'),
        name: getRow(ph, 'name'),
        description: getRow(ph, 'description'),
        actions_required: getRow(ph, 'actions_required'),
        budget_allocated: getRow(ph, 'budget_allocated'),
        requirements_summary: getRow(ph, 'requirements_summary'),
        status: getRow(ph, 'status'),
        planned_start: getRow(ph, 'planned_start'),
        planned_end: getRow(ph, 'planned_end'),
        members: [],
      },
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/phases/:phaseId', requirePageAccess('project_tracker'), async (req, res, next) => {
  try {
    const r = await query(
      `SELECT ph.*, p.tenant_id
       FROM project_tracker_phases ph
       INNER JOIN project_tracker_projects p ON p.id = ph.project_id
       WHERE ph.id = @id`,
      { id: req.params.phaseId }
    );
    const ph = r.recordset?.[0];
    if (!ph || !canAccessTenant(req, getRow(ph, 'tenant_id'))) return res.status(404).json({ error: 'Phase not found' });
    const b = req.body || {};
    const phAllowed = new Set(['planned', 'open', 'in_progress', 'completed', 'blocked']);
    let phStatusSet = 0;
    let phStatusVal = null;
    if (b.status !== undefined) {
      const pst = String(b.status || '').toLowerCase();
      if (!phAllowed.has(pst)) return res.status(400).json({ error: 'Invalid phase status' });
      phStatusSet = 1;
      phStatusVal = pst;
    }
    await query(
      `UPDATE project_tracker_phases SET
         sort_order = COALESCE(@sort, sort_order),
         name = COALESCE(@name, name),
         description = CASE WHEN @dset = 1 THEN @description ELSE description END,
         actions_required = CASE WHEN @aset = 1 THEN @actions ELSE actions_required END,
         budget_allocated = CASE WHEN @bset = 1 THEN @budget ELSE budget_allocated END,
         requirements_summary = CASE WHEN @rset = 1 THEN @reqSummary ELSE requirements_summary END,
         status = CASE WHEN @phStatusSet = 1 THEN @phStatusVal ELSE status END,
         planned_start = CASE WHEN @pset = 1 THEN @pstart ELSE planned_start END,
         planned_end = CASE WHEN @peset = 1 THEN @pend ELSE planned_end END,
         updated_at = SYSUTCDATETIME()
       WHERE id = @id`,
      {
        id: req.params.phaseId,
        sort: b.sort_order != null ? parseInt(b.sort_order, 10) : null,
        name: b.name != null ? String(b.name).trim().slice(0, 300) : null,
        dset: b.description !== undefined ? 1 : 0,
        description: b.description != null ? String(b.description) : null,
        aset: b.actions_required !== undefined ? 1 : 0,
        actions: b.actions_required != null ? String(b.actions_required) : null,
        bset: b.budget_allocated !== undefined ? 1 : 0,
        budget: b.budget_allocated != null ? Number(b.budget_allocated) : null,
        rset: b.requirements_summary !== undefined ? 1 : 0,
        reqSummary: b.requirements_summary != null ? String(b.requirements_summary) : null,
        phStatusSet,
        phStatusVal,
        pset: b.planned_start !== undefined ? 1 : 0,
        pstart: b.planned_start || null,
        peset: b.planned_end !== undefined ? 1 : 0,
        pend: b.planned_end || null,
      }
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/phases/:phaseId', requirePageAccess('project_tracker'), async (req, res, next) => {
  try {
    const r = await query(
      `SELECT ph.id, p.tenant_id FROM project_tracker_phases ph
       INNER JOIN project_tracker_projects p ON p.id = ph.project_id WHERE ph.id = @id`,
      { id: req.params.phaseId }
    );
    const ph = r.recordset?.[0];
    if (!ph || !canAccessTenant(req, getRow(ph, 'tenant_id'))) return res.status(404).json({ error: 'Phase not found' });
    await query(`DELETE FROM project_tracker_phases WHERE id = @id`, { id: req.params.phaseId });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/phases/:phaseId/members', requirePageAccess('project_tracker'), async (req, res, next) => {
  try {
    const r = await query(
      `SELECT ph.id, p.tenant_id FROM project_tracker_phases ph
       INNER JOIN project_tracker_projects p ON p.id = ph.project_id WHERE ph.id = @id`,
      { id: req.params.phaseId }
    );
    const ph = r.recordset?.[0];
    if (!ph || !canAccessTenant(req, getRow(ph, 'tenant_id'))) return res.status(404).json({ error: 'Phase not found' });
    const b = req.body || {};
    const userId = b.user_id;
    const roleTitle = String(b.role_title || '').trim().slice(0, 200);
    if (!userId || !roleTitle) return res.status(400).json({ error: 'user_id and role_title required' });
    await query(
      `INSERT INTO project_tracker_phase_members (phase_id, user_id, role_title, requirements_notes)
       VALUES (@phaseId, @userId, @roleTitle, @notes)`,
      {
        phaseId: req.params.phaseId,
        userId,
        roleTitle,
        notes: b.requirements_notes ? String(b.requirements_notes) : null,
      }
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    if (String(err?.message || '').includes('UQ_project_tracker_phase_member')) {
      return res.status(409).json({ error: 'That user and role already exist on this phase' });
    }
    next(err);
  }
});

router.delete('/phase-members/:memberId', requirePageAccess('project_tracker'), async (req, res, next) => {
  try {
    const r = await query(
      `SELECT m.id, p.tenant_id FROM project_tracker_phase_members m
       INNER JOIN project_tracker_phases ph ON ph.id = m.phase_id
       INNER JOIN project_tracker_projects p ON p.id = ph.project_id
       WHERE m.id = @id`,
      { id: req.params.memberId }
    );
    const row = r.recordset?.[0];
    if (!row || !canAccessTenant(req, getRow(row, 'tenant_id'))) return res.status(404).json({ error: 'Not found' });
    await query(`DELETE FROM project_tracker_phase_members WHERE id = @id`, { id: req.params.memberId });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/phases/:phaseId/logs', requirePageAccess('project_tracker'), async (req, res, next) => {
  try {
    const r = await query(
      `SELECT l.*, u.full_name AS author_name
       FROM project_tracker_implementation_logs l
       INNER JOIN project_tracker_phases ph ON ph.id = l.phase_id
       INNER JOIN project_tracker_projects p ON p.id = ph.project_id
       LEFT JOIN users u ON u.id = l.created_by
       WHERE l.phase_id = @id AND p.tenant_id = @tenantId
       ORDER BY l.created_at DESC`,
      { id: req.params.phaseId, tenantId: req.user.tenant_id }
    );
    if (!req.user.tenant_id) return res.status(400).json({ error: 'No tenant' });
    const logs = (r.recordset || []).map((l) => ({
      id: getRow(l, 'id'),
      phase_id: getRow(l, 'phase_id'),
      work_transcript: getRow(l, 'work_transcript'),
      progress_percent: getRow(l, 'progress_percent'),
      finances_note: getRow(l, 'finances_note'),
      created_by: getRow(l, 'created_by'),
      author_name: getRow(l, 'author_name'),
      created_at: getRow(l, 'created_at'),
    }));
    res.json({ logs });
  } catch (err) {
    next(err);
  }
});

router.post('/phases/:phaseId/logs', requirePageAccess('project_tracker'), async (req, res, next) => {
  try {
    const r = await query(
      `SELECT ph.id, p.tenant_id FROM project_tracker_phases ph
       INNER JOIN project_tracker_projects p ON p.id = ph.project_id WHERE ph.id = @id`,
      { id: req.params.phaseId }
    );
    const ph = r.recordset?.[0];
    if (!ph || !canAccessTenant(req, getRow(ph, 'tenant_id'))) return res.status(404).json({ error: 'Phase not found' });
    const b = req.body || {};
    const pct = Math.min(100, Math.max(0, parseInt(String(b.progress_percent ?? 0), 10) || 0));
    const ins = await query(
      `INSERT INTO project_tracker_implementation_logs (phase_id, work_transcript, progress_percent, finances_note, created_by)
       OUTPUT INSERTED.*
       VALUES (@phaseId, @transcript, @pct, @finNote, @uid)`,
      {
        phaseId: req.params.phaseId,
        transcript: b.work_transcript ? String(b.work_transcript) : null,
        pct,
        finNote: b.finances_note ? String(b.finances_note) : null,
        uid: req.user.id,
      }
    );
    const row = ins.recordset?.[0];
    res.status(201).json({ log: { id: getRow(row, 'id'), created_at: getRow(row, 'created_at') } });
  } catch (err) {
    next(err);
  }
});

router.get('/projects/:projectId/finance-lines', requirePageAccess('project_tracker'), async (req, res, next) => {
  try {
    const row = await loadProject(req, req.params.projectId);
    if (!row) return res.status(404).json({ error: 'Project not found' });
    const r = await query(
      `SELECT f.*, u.full_name AS author_name, ph.name AS phase_name
       FROM project_tracker_finance_lines f
       LEFT JOIN users u ON u.id = f.created_by
       LEFT JOIN project_tracker_phases ph ON ph.id = f.phase_id
       WHERE f.project_id = @pid
       ORDER BY f.entry_date DESC, f.created_at DESC`,
      { pid: getRow(row, 'id') }
    );
    const lines = (r.recordset || []).map((x) => ({
      id: getRow(x, 'id'),
      project_id: getRow(x, 'project_id'),
      phase_id: getRow(x, 'phase_id'),
      phase_name: getRow(x, 'phase_name'),
      entry_type: getRow(x, 'entry_type'),
      label: getRow(x, 'label'),
      amount: getRow(x, 'amount'),
      entry_date: getRow(x, 'entry_date'),
      notes: getRow(x, 'notes'),
      author_name: getRow(x, 'author_name'),
      created_at: getRow(x, 'created_at'),
    }));
    res.json({ lines });
  } catch (err) {
    next(err);
  }
});

router.post('/projects/:projectId/finance-lines', requirePageAccess('project_tracker'), async (req, res, next) => {
  try {
    const row = await loadProject(req, req.params.projectId);
    if (!row) return res.status(404).json({ error: 'Project not found' });
    const b = req.body || {};
    const entryType = String(b.entry_type || 'expense').toLowerCase();
    if (!['income', 'expense', 'forecast'].includes(entryType)) return res.status(400).json({ error: 'Invalid entry_type' });
    const label = String(b.label || '').trim().slice(0, 300);
    if (!label) return res.status(400).json({ error: 'label required' });
    await query(
      `INSERT INTO project_tracker_finance_lines (project_id, phase_id, entry_type, label, amount, entry_date, notes, created_by)
       VALUES (@pid, @phaseId, @etype, @label, @amount, @entryDate, @notes, @uid)`,
      {
        pid: getRow(row, 'id'),
        phaseId: b.phase_id || null,
        etype: entryType,
        label,
        amount: Number(b.amount) || 0,
        entryDate: b.entry_date || null,
        notes: b.notes ? String(b.notes) : null,
        uid: req.user.id,
      }
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/projects/:projectId/notes', requirePageAccess('project_tracker'), async (req, res, next) => {
  try {
    const row = await loadProject(req, req.params.projectId);
    if (!row) return res.status(404).json({ error: 'Project not found' });
    const r = await query(
      `SELECT n.*, u.full_name AS author_name, ph.name AS phase_name
       FROM project_tracker_notes n
       LEFT JOIN users u ON u.id = n.created_by
       LEFT JOIN project_tracker_phases ph ON ph.id = n.phase_id
       WHERE n.project_id = @pid
       ORDER BY n.created_at DESC`,
      { pid: getRow(row, 'id') }
    );
    const notes = (r.recordset || []).map((n) => ({
      id: getRow(n, 'id'),
      phase_id: getRow(n, 'phase_id'),
      phase_name: getRow(n, 'phase_name'),
      body: getRow(n, 'body'),
      author_name: getRow(n, 'author_name'),
      created_at: getRow(n, 'created_at'),
    }));
    res.json({ notes });
  } catch (err) {
    next(err);
  }
});

router.post('/projects/:projectId/notes', requirePageAccess('project_tracker'), async (req, res, next) => {
  try {
    const row = await loadProject(req, req.params.projectId);
    if (!row) return res.status(404).json({ error: 'Project not found' });
    const b = req.body || {};
    const body = String(b.body || '').trim();
    if (!body) return res.status(400).json({ error: 'body required' });
    await query(
      `INSERT INTO project_tracker_notes (project_id, phase_id, body, created_by)
       VALUES (@pid, @phaseId, @body, @uid)`,
      {
        pid: getRow(row, 'id'),
        phaseId: b.phase_id || null,
        body,
        uid: req.user.id,
      }
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/projects/:projectId/attachments', requirePageAccess('project_tracker'), async (req, res, next) => {
  try {
    const row = await loadProject(req, req.params.projectId);
    if (!row) return res.status(404).json({ error: 'Project not found' });
    const r = await query(
      `SELECT a.*, u.full_name AS author_name, ph.name AS phase_name
       FROM project_tracker_attachments a
       LEFT JOIN users u ON u.id = a.uploaded_by
       LEFT JOIN project_tracker_phases ph ON ph.id = a.phase_id
       WHERE a.project_id = @pid
       ORDER BY a.created_at DESC`,
      { pid: getRow(row, 'id') }
    );
    const attachments = (r.recordset || []).map((a) => ({
      id: getRow(a, 'id'),
      phase_id: getRow(a, 'phase_id'),
      phase_name: getRow(a, 'phase_name'),
      file_name: getRow(a, 'file_name'),
      author_name: getRow(a, 'author_name'),
      created_at: getRow(a, 'created_at'),
    }));
    res.json({ attachments });
  } catch (err) {
    next(err);
  }
});

router.post('/projects/:projectId/attachments', requirePageAccess('project_tracker'), uploadMany, async (req, res, next) => {
  try {
    const row = await loadProject(req, req.params.projectId);
    if (!row) return res.status(404).json({ error: 'Project not found' });
    const pid = getRow(row, 'id');
    const phaseId = req.body?.phase_id || null;
    const files = [];
    if (req.files?.file) files.push(...req.files.file);
    if (req.files?.files) files.push(...req.files.files);
    if (!files.length) return res.status(400).json({ error: 'No file uploaded' });
    const uploaded = [];
    for (const file of files) {
      const relativePath = path.relative(path.join(process.cwd(), 'uploads'), file.path).replace(/\\/g, '/');
      const att = await query(
        `INSERT INTO project_tracker_attachments (project_id, phase_id, file_name, file_path, uploaded_by)
         OUTPUT INSERTED.id, INSERTED.file_name, INSERTED.created_at
         VALUES (@pid, @phaseId, @fileName, @filePath, @uid)`,
        {
          pid,
          phaseId,
          fileName: file.originalname || 'file',
          filePath: relativePath,
          uid: req.user.id,
        }
      );
      const ar = att.recordset?.[0];
      uploaded.push({ id: getRow(ar, 'id'), file_name: getRow(ar, 'file_name'), created_at: getRow(ar, 'created_at') });
    }
    res.status(201).json({ attachments: uploaded });
  } catch (err) {
    next(err);
  }
});

router.get('/projects/:projectId/attachments/:attachmentId/download', requirePageAccess('project_tracker'), async (req, res, next) => {
  try {
    const row = await loadProject(req, req.params.projectId);
    if (!row) return res.status(404).json({ error: 'Project not found' });
    const r = await query(
      `SELECT a.file_path, a.file_name FROM project_tracker_attachments a
       WHERE a.id = @aid AND a.project_id = @pid`,
      { aid: req.params.attachmentId, pid: getRow(row, 'id') }
    );
    const a = r.recordset?.[0];
    if (!a) return res.status(404).json({ error: 'Attachment not found' });
    const fullPath = path.join(process.cwd(), 'uploads', getRow(a, 'file_path'));
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File missing' });
    res.download(fullPath, getRow(a, 'file_name') || 'download');
  } catch (err) {
    next(err);
  }
});

export default router;
