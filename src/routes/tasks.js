import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { query, getPool } from '../db.js';
import { requireAuth, loadUser, requirePageAccess } from '../middleware/auth.js';
import { sendEmail, isEmailConfigured } from '../lib/emailService.js';
import {
  taskAssignedHtml,
  taskCompletedHtml,
  taskOverdueHtml,
  taskReminderDueHtml,
  taskNewCommentHtml,
  taskUpdatedNotifyHtml,
} from '../lib/emailTemplates.js';

const router = Router();
const uploadsDir = path.join(process.cwd(), 'uploads', 'tasks');
const taskUploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tenantId = String(req.user?.tenant_id || 'anon');
    const taskId = String(req.params?.id || 'new');
    const dir = path.join(uploadsDir, tenantId, taskId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const safe = (file.originalname || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});
const taskUpload = multer({ storage: taskUploadStorage, limits: { fileSize: 25 * 1024 * 1024 } }).single('file');
const taskUploadMany = multer({ storage: taskUploadStorage, limits: { fileSize: 25 * 1024 * 1024 } }).fields([
  { name: 'file', maxCount: 1 },
  { name: 'files', maxCount: 25 },
]);

const commentUploadsDir = path.join(process.cwd(), 'uploads', 'tasks');
const commentAttachmentsUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const tenantId = String(req.user?.tenant_id || 'anon');
      const taskId = String(req.params?.id || 'new');
      const commentId = String(req.params?.commentId || 'new');
      const dir = path.join(commentUploadsDir, tenantId, taskId, 'comments', commentId);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const safe = (file.originalname || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
}).array('files', 20);

function getRow(row, key) {
  if (!row) return undefined;
  const k = Object.keys(row).find((x) => x && String(x).toLowerCase() === String(key).toLowerCase());
  return k ? row[k] : undefined;
}

function canAccessTaskTenant(req, tenantId) {
  if (req.user?.role === 'super_admin') return true;
  const tid = req.user?.tenant_id;
  if (!tid) return false;
  if (Array.isArray(req.user?.tenant_ids)) return req.user.tenant_ids.includes(tenantId);
  return tid === tenantId;
}

/** Check if current user is assigned to the task (for progress/comments/reminders) */
async function isTaskAssignee(taskId, userId) {
  const r = await query(
    `SELECT 1 FROM task_assignments WHERE task_id = @taskId AND user_id = @userId`,
    { taskId, userId }
  );
  return (r.recordset || []).length > 0;
}

async function canPostTaskComment(req, taskId) {
  if (req.user?.role === 'super_admin' || req.user?.role === 'tenant_admin') return true;
  if (await isTaskAssignee(taskId, req.user.id)) return true;
  const r = await query(`SELECT created_by FROM tasks WHERE id = @id`, { id: taskId });
  const row = r.recordset?.[0];
  return row && getRow(row, 'created_by') === req.user.id;
}

async function canSeeAssigneeOnlyNotes(req, taskId) {
  if (req.user?.role === 'super_admin' || req.user?.role === 'tenant_admin') return true;
  if (await isTaskAssignee(taskId, req.user.id)) return true;
  const r = await query(`SELECT created_by FROM tasks WHERE id = @id`, { id: taskId });
  const row = r.recordset?.[0];
  return row && getRow(row, 'created_by') === req.user.id;
}

async function replaceTaskLabels(taskId, labels) {
  await query(`DELETE FROM task_labels WHERE task_id = @taskId`, { taskId });
  const list = [...new Set((labels || []).map((x) => String(x).trim()).filter(Boolean))].slice(0, 40);
  for (const label of list) {
    await query(`INSERT INTO task_labels (task_id, label) VALUES (@taskId, @label)`, { taskId, label: label.slice(0, 120) });
  }
}

/** Run overdue task notifications: find tasks with due_date < today and status != completed, email assignees. Call daily (cron or setInterval). */
export async function runOverdueTaskNotifications() {
  if (!isEmailConfigured()) return { sent: 0, tasks: 0 };
  const appUrl = process.env.FRONTEND_ORIGIN || process.env.APP_URL || 'http://localhost:5173';
  const result = await query(
    `SELECT t.id, t.tenant_id, t.title, t.due_date
     FROM tasks t
     WHERE t.due_date IS NOT NULL
       AND CAST(t.due_date AS DATE) < CAST(GETDATE() AS DATE)
       AND ISNULL(t.[status], '') <> 'completed'
     ORDER BY t.due_date`
  );
  const overdueTasks = result.recordset || [];
  let sent = 0;
  for (const task of overdueTasks) {
    const taskId = getRow(task, 'id');
    const taskTitle = getRow(task, 'title');
    const dueDate = getRow(task, 'due_date');
    const assigneesResult = await query(
      `SELECT u.email, u.full_name FROM task_assignments a
       INNER JOIN users u ON u.id = a.user_id
       WHERE a.task_id = @taskId AND u.email IS NOT NULL AND LTRIM(RTRIM(ISNULL(u.email,''))) <> ''`,
      { taskId }
    );
    const assignees = assigneesResult.recordset || [];
    const html = taskOverdueHtml({ taskTitle, dueDate, taskId, appUrl });
    const subject = `Overdue task: ${taskTitle}`;
    for (const u of assignees) {
      const email = getRow(u, 'email');
      if (email) {
        try {
          await sendEmail({ to: email, subject, body: html, html: true });
          sent++;
        } catch (e) {
          console.error('[tasks] Overdue email error to', email, e?.message || e);
        }
      }
    }
  }
  if (overdueTasks.length > 0) {
    console.log('[tasks] Overdue notifications: %d task(s), %d email(s) sent', overdueTasks.length, sent);
  }
  return { sent, tasks: overdueTasks.length };
}

/** Fire due task reminders (one-off dismisses; hourly/daily bumps next_fire_at). */
export async function runTaskReminderNotifications() {
  if (!isEmailConfigured()) return { sent: 0, reminders: 0 };
  const appUrl = process.env.FRONTEND_ORIGIN || process.env.APP_URL || 'http://localhost:5173';
  let due;
  try {
    due = await query(
      `SELECT r.id, r.task_id, r.user_id, r.remind_at, r.note, r.recurrence, r.next_fire_at, t.title
       FROM task_reminders r
       INNER JOIN tasks t ON t.id = r.task_id
       WHERE r.dismissed_at IS NULL
         AND COALESCE(r.next_fire_at, r.remind_at) <= SYSUTCDATETIME()`
    );
  } catch (e) {
    if ((e.message || '').includes('Invalid column') || (e.message || '').includes('next_fire_at')) {
      return { sent: 0, reminders: 0, migrationRequired: true };
    }
    throw e;
  }
  const rows = due.recordset || [];
  let sent = 0;
  for (const row of rows) {
    const rid = getRow(row, 'id');
    const taskId = getRow(row, 'task_id');
    const taskTitle = getRow(row, 'title');
    const note = getRow(row, 'note');
    const remindAt = getRow(row, 'remind_at');
    const nextFire = getRow(row, 'next_fire_at');
    const recurrence = String(getRow(row, 'recurrence') || 'none').toLowerCase();

    const emailsResult = await query(
      `SELECT DISTINCT u.email, u.full_name FROM (
         SELECT user_id FROM task_assignments WHERE task_id = @taskId
         UNION SELECT created_by FROM tasks WHERE id = @taskId
       ) x INNER JOIN users u ON u.id = x.user_id
       WHERE u.email IS NOT NULL AND LTRIM(RTRIM(ISNULL(u.email, N''))) <> N''`,
      { taskId }
    );
    const html = taskReminderDueHtml({
      taskTitle,
      note,
      remindAt: nextFire || remindAt,
      taskId,
      appUrl,
    });
    const subject = `Reminder: ${taskTitle}`;
    for (const u of emailsResult.recordset || []) {
      const em = getRow(u, 'email');
      if (em) {
        try {
          await sendEmail({ to: em, subject, body: html, html: true });
          sent++;
        } catch (err) {
          console.error('[tasks] Reminder email error:', em, err?.message || err);
        }
      }
    }

    if (recurrence === 'hourly') {
      await query(
        `UPDATE task_reminders SET next_fire_at = DATEADD(HOUR, 1, COALESCE(next_fire_at, remind_at)) WHERE id = @rid`,
        { rid }
      );
    } else if (recurrence === 'daily') {
      await query(
        `UPDATE task_reminders SET next_fire_at = DATEADD(DAY, 1, COALESCE(next_fire_at, remind_at)) WHERE id = @rid`,
        { rid }
      );
    } else {
      await query(
        `UPDATE task_reminders SET dismissed_at = SYSUTCDATETIME(), next_fire_at = NULL WHERE id = @rid`,
        { rid }
      );
    }
  }
  if (rows.length) {
    console.log('[tasks] Reminder notifications: %d reminder(s), %d email(s)', rows.length, sent);
  }
  return { sent, reminders: rows.length };
}

/** GET /api/tasks/overdue-notify?secret=CRON_SECRET – trigger overdue emails (for cron). No auth when secret matches. */
router.get('/overdue-notify', async (req, res, next) => {
  try {
    const secret = (req.query.secret || '').trim();
    const cronSecret = (process.env.CRON_SECRET || '').trim();
    if (cronSecret && secret !== cronSecret) {
      return res.status(403).json({ error: 'Invalid or missing secret' });
    }
    const result = await runOverdueTaskNotifications();
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

/** GET /api/tasks/reminder-notify?secret= – due task reminders (hourly/daily/one-off). */
router.get('/reminder-notify', async (req, res, next) => {
  try {
    const secret = (req.query.secret || '').trim();
    const cronSecret = (process.env.CRON_SECRET || '').trim();
    if (cronSecret && secret !== cronSecret) {
      return res.status(403).json({ error: 'Invalid or missing secret' });
    }
    const result = await runTaskReminderNotifications();
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

router.use(requireAuth);
router.use(loadUser);
router.use(requirePageAccess('tasks'));

/** List tasks: filters, search, priority, label, assignee, sort; tenant-scoped */
router.get('/', async (req, res, next) => {
  try {
    const {
      assigned_to_me,
      created_by_me,
      scope,
      status,
      priority,
      label,
      assignee_user_id,
      search,
      due_from,
      due_to,
      sort = 'created_at',
      sort_dir = 'desc',
      page = 1,
      limit = 50,
    } = req.query;
    const tenantId = req.user.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'No tenant context' });

    const offset = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(100, Math.max(1, parseInt(limit, 10)));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));

    let where = 'WHERE t.tenant_id = @tenantId';
    const params = { tenantId, offset, limitNum };

    const myOnly = scope === 'my' || assigned_to_me === 'true' || assigned_to_me === '1';
    if (myOnly) {
      where += ' AND EXISTS (SELECT 1 FROM task_assignments a WHERE a.task_id = t.id AND a.user_id = @userId)';
      params.userId = req.user.id;
    }
    if (created_by_me === 'true' || created_by_me === '1') {
      where += ' AND t.created_by = @createdBy';
      params.createdBy = req.user.id;
    }
    if (status && status !== 'all') {
      where += ' AND t.[status] = @status';
      params.status = status;
    }
    if (priority && priority !== 'all') {
      where += ' AND ISNULL(t.priority, N\'medium\') = @priority';
      params.priority = String(priority);
    }
    if (label && String(label).trim()) {
      where += ' AND EXISTS (SELECT 1 FROM task_labels tl WHERE tl.task_id = t.id AND tl.label = @label)';
      params.label = String(label).trim().slice(0, 120);
    }
    if (assignee_user_id && String(assignee_user_id).trim()) {
      where += ' AND EXISTS (SELECT 1 FROM task_assignments a2 WHERE a2.task_id = t.id AND a2.user_id = @assigneeUserId)';
      params.assigneeUserId = assignee_user_id;
    }
    if (search && String(search).trim()) {
      where += ' AND (t.title LIKE @searchLike OR t.[description] LIKE @searchLike)';
      const raw = String(search).trim().replace(/%/g, '').replace(/_/g, '').slice(0, 120);
      params.searchLike = `%${raw}%`;
    }
    if (due_from) {
      where += ' AND (t.due_date IS NULL OR CAST(t.due_date AS DATE) >= CAST(@dueFrom AS DATE))';
      params.dueFrom = due_from;
    }
    if (due_to) {
      where += ' AND (t.due_date IS NULL OR CAST(t.due_date AS DATE) <= CAST(@dueTo AS DATE))';
      params.dueTo = due_to;
    }

    const sortMap = {
      created_at: 't.created_at',
      due_date: 't.due_date',
      start_date: 't.start_date',
      title: 't.title',
      priority: 't.priority',
      progress: 't.progress',
      status: 't.[status]',
    };
    const orderCol = sortMap[String(sort)] || 't.created_at';
    const orderDir = String(sort_dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const countResult = await query(`SELECT COUNT(*) AS total FROM tasks t ${where}`, params);
    const total = countResult.recordset[0].total;

    const result = await query(
      `SELECT t.id, t.tenant_id, t.title, t.[description], t.key_actions, t.start_date, t.due_date, t.start_time, t.due_time,
              t.priority, t.progress, t.[status], t.created_by, t.completed_at, t.completed_by, t.created_at, t.updated_at,
              u.full_name AS created_by_name
       FROM tasks t
       LEFT JOIN users u ON u.id = t.created_by
       ${where}
       ORDER BY ${orderCol} ${orderDir}
       OFFSET @offset ROWS FETCH NEXT @limitNum ROWS ONLY`,
      params
    );
    const tasks = result.recordset || [];
    const pool = await getPool();
    const taskIds = tasks.map((t) => t.id);
    if (taskIds.length === 0) {
      return res.json({ tasks: [], pagination: { page: 1, limit: limitNum, total } });
    }
    const placeholders = taskIds.map((_, i) => `@tid${i}`).join(',');
    const reqPool = pool.request();
    taskIds.forEach((id, i) => {
      reqPool.input(`tid${i}`, id);
    });
    const assignResult = await reqPool.query(
      `SELECT a.task_id, a.user_id, u.full_name AS assignee_name, u.email AS assignee_email
       FROM task_assignments a
       JOIN users u ON u.id = a.user_id
       WHERE a.task_id IN (${placeholders})`
    );
    const assigneesByTask = {};
    for (const row of assignResult.recordset || []) {
      const tid = getRow(row, 'task_id');
      if (!assigneesByTask[tid]) assigneesByTask[tid] = [];
      assigneesByTask[tid].push({ user_id: getRow(row, 'user_id'), full_name: getRow(row, 'assignee_name'), email: getRow(row, 'assignee_email') });
    }
    let labelsByTask = {};
    try {
      const lr = await reqPool.query(`SELECT task_id, label FROM task_labels WHERE task_id IN (${placeholders})`);
      for (const row of lr.recordset || []) {
        const tid = getRow(row, 'task_id');
        if (!labelsByTask[tid]) labelsByTask[tid] = [];
        labelsByTask[tid].push(getRow(row, 'label'));
      }
    } catch (_) {
      labelsByTask = {};
    }
    const tasksOut = tasks.map((t) => ({
      ...t,
      assignees: assigneesByTask[t.id] || [],
      labels: labelsByTask[t.id] || [],
    }));

    res.json({
      tasks: tasksOut,
      pagination: { page: Math.floor(offset / limitNum) + 1, limit: limitNum, total },
    });
  } catch (err) {
    if ((err.message || '').includes('Invalid column name') && (err.message || '').includes('priority')) {
      return res.status(503).json({ error: 'Tasks Tracker schema not applied. Run: npm run db:tasks-tracker-expand' });
    }
    next(err);
  }
});

/** Create task: title, description, key_actions, dates/times, priority, labels[], assignee_ids[]; email assignees */
router.post('/', async (req, res, next) => {
  try {
    const {
      title,
      description,
      key_actions,
      start_date,
      due_date,
      start_time,
      due_time,
      priority,
      labels,
      assignee_ids,
    } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'Task title is required' });
    const tenantId = req.user.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'No tenant context' });

    const keyActionsStr = Array.isArray(key_actions)
      ? JSON.stringify(key_actions)
      : (typeof key_actions === 'string' ? key_actions : null);
    const startDate = start_date || null;
    const dueDate = due_date || null;
    const prio = ['low', 'medium', 'high', 'urgent'].includes(priority) ? priority : 'medium';
    const st = start_time != null && String(start_time).trim() ? String(start_time).trim().slice(0, 16) : null;
    const dt = due_time != null && String(due_time).trim() ? String(due_time).trim().slice(0, 16) : null;

    const insertResult = await query(
      `INSERT INTO tasks (tenant_id, title, [description], key_actions, start_date, due_date, start_time, due_time, priority, created_by)
       OUTPUT INSERTED.id, INSERTED.title, INSERTED.created_at
       VALUES (@tenantId, @title, @description, @keyActions, @startDate, @dueDate, @startTime, @dueTime, @priority, @createdBy)`,
      {
        tenantId,
        title: String(title).trim(),
        description: description != null ? String(description).trim() : null,
        keyActions: keyActionsStr,
        startDate,
        dueDate,
        startTime: st,
        dueTime: dt,
        priority: prio,
        createdBy: req.user.id,
      }
    );
    const task = insertResult.recordset[0];
    const taskId = getRow(task, 'id');

    const assigneeIds = Array.isArray(assignee_ids) ? assignee_ids.filter(Boolean) : [];
    const assignerName = req.user.full_name || req.user.email || 'A colleague';
    const appUrl = process.env.FRONTEND_ORIGIN || process.env.APP_URL || 'http://localhost:5173';

    for (const userId of assigneeIds) {
      await query(
        `INSERT INTO task_assignments (task_id, user_id, assigned_by) VALUES (@taskId, @userId, @assignedBy)`,
        { taskId, userId, assignedBy: req.user.id }
      );
    }

    try {
      await replaceTaskLabels(taskId, labels);
    } catch (e) {
      if (!(e.message || '').includes('task_labels')) throw e;
    }

    if (assigneeIds.length > 0) {
      const userResult = await query(
        `SELECT id, email, full_name FROM users WHERE id IN (${assigneeIds.map((_, i) => `@id${i}`).join(',')})`,
        Object.fromEntries(assigneeIds.map((id, i) => [`id${i}`, id]))
      );
      const users = userResult.recordset || [];
      const html = taskAssignedHtml({
        taskTitle: getRow(task, 'title'),
        assignerName,
        dueDate: dueDate || undefined,
        taskId,
        appUrl,
      });
      const subject = `Task assigned: ${getRow(task, 'title')}`;
      for (const u of users) {
        const email = getRow(u, 'email');
        if (email) {
          sendEmail({ to: email, subject, body: html, html: true }).catch((e) => console.error('[tasks] Assign email error:', e?.message));
        }
      }
    }

    const assigneesResult = await query(
      `SELECT u.id, u.full_name, u.email FROM task_assignments a JOIN users u ON u.id = a.user_id WHERE a.task_id = @taskId`,
      { taskId }
    );
    const assignees = (assigneesResult.recordset || []).map((r) => ({
      user_id: getRow(r, 'id'),
      full_name: getRow(r, 'full_name'),
      email: getRow(r, 'email'),
    }));

    res.status(201).json({
      task: {
        id: taskId,
        title: getRow(task, 'title'),
        description: description != null ? String(description).trim() : null,
        key_actions: key_actions || [],
        start_date: startDate,
        due_date: dueDate,
        start_time: st,
        due_time: dt,
        priority: prio,
        labels: Array.isArray(labels) ? labels : [],
        progress: 0,
        status: 'not_started',
        created_by: req.user.id,
        created_at: getRow(task, 'created_at'),
        assignees,
      },
    });
  } catch (err) {
    if ((err.message || '').includes('Invalid column') && (err.message || '').includes('priority')) {
      return res.status(503).json({ error: 'Run npm run db:tasks-tracker-expand for Tasks Tracker fields.' });
    }
    next(err);
  }
});

/** Get one task with assignments and attachments */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT t.id, t.tenant_id, t.title, t.[description], t.key_actions, t.start_date, t.due_date, t.start_time, t.due_time,
              t.priority, t.progress, t.[status], t.created_by, t.completed_at, t.completed_by, t.created_at, t.updated_at,
              u.full_name AS created_by_name, u.email AS created_by_email
       FROM tasks t
       LEFT JOIN users u ON u.id = t.created_by
       WHERE t.id = @id`,
      { id }
    );
    const task = result.recordset[0];
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (!canAccessTaskTenant(req, getRow(task, 'tenant_id'))) return res.status(403).json({ error: 'Forbidden' });

    const assigneesResult = await query(
      `SELECT a.user_id, a.assigned_by, a.assigned_at, u.full_name, u.email FROM task_assignments a JOIN users u ON u.id = a.user_id WHERE a.task_id = @id`,
      { id }
    );
    const attachmentsResult = await query(
      `SELECT id, file_name, file_path, uploaded_by, created_at FROM task_attachments WHERE task_id = @id ORDER BY created_at`,
      { id }
    );

    let taskLabels = [];
    try {
      const lr = await query(`SELECT label FROM task_labels WHERE task_id = @id ORDER BY label`, { id });
      taskLabels = (lr.recordset || []).map((r) => getRow(r, 'label')).filter(Boolean);
    } catch (_) {
      taskLabels = [];
    }

    const canSeePrivateNotes = await canSeeAssigneeOnlyNotes(req, id);

    let progressUpdates = [];
    let comments = [];
    let reminders = [];
    try {
      let progressResult;
      try {
        progressResult = await query(
          `SELECT p.id, p.task_id, p.user_id, p.progress, p.note, p.entry_type, p.created_at, u.full_name AS user_name
           FROM task_progress_updates p
           LEFT JOIN users u ON u.id = p.user_id
           WHERE p.task_id = @id ORDER BY p.created_at DESC`,
          { id }
        );
      } catch (e) {
        if ((e.message || '').includes('entry_type')) {
          progressResult = await query(
            `SELECT p.id, p.task_id, p.user_id, p.progress, p.note, p.created_at, u.full_name AS user_name
             FROM task_progress_updates p
             LEFT JOIN users u ON u.id = p.user_id
             WHERE p.task_id = @id ORDER BY p.created_at DESC`,
            { id }
          );
        } else throw e;
      }
      progressUpdates = (progressResult.recordset || []).map((r) => ({
        id: getRow(r, 'id'),
        user_id: getRow(r, 'user_id'),
        user_name: getRow(r, 'user_name'),
        progress: getRow(r, 'progress'),
        note: getRow(r, 'note'),
        entry_type: getRow(r, 'entry_type') || 'progress',
        created_at: getRow(r, 'created_at'),
      }));
      let commentsResult;
      try {
        commentsResult = await query(
          `SELECT c.id, c.task_id, c.user_id, c.body, c.visibility, c.created_at, u.full_name AS user_name
           FROM task_comments c
           LEFT JOIN users u ON u.id = c.user_id
           WHERE c.task_id = @id ORDER BY c.created_at ASC`,
          { id }
        );
      } catch (e) {
        if ((e.message || '').includes('visibility')) {
          commentsResult = await query(
            `SELECT c.id, c.task_id, c.user_id, c.body, c.created_at, u.full_name AS user_name
             FROM task_comments c
             LEFT JOIN users u ON u.id = c.user_id
             WHERE c.task_id = @id ORDER BY c.created_at ASC`,
            { id }
          );
        } else throw e;
      }
      comments = (commentsResult.recordset || [])
        .filter((r) => {
          const vis = (getRow(r, 'visibility') || 'all').toLowerCase();
          if (vis === 'assignees' || vis === 'assignees_only') return canSeePrivateNotes;
          return true;
        })
        .map((r) => ({
          id: getRow(r, 'id'),
          user_id: getRow(r, 'user_id'),
          user_name: getRow(r, 'user_name'),
          body: getRow(r, 'body'),
          visibility: getRow(r, 'visibility') != null ? getRow(r, 'visibility') : 'all',
          created_at: getRow(r, 'created_at'),
          attachments: [],
        }));
      const commentIds = comments.map((c) => c.id).filter(Boolean);
      if (commentIds.length > 0) {
        const placeholders = commentIds.map((_, i) => `@cid${i}`).join(',');
        const pool = await getPool();
        const reqPool = pool.request();
        commentIds.forEach((cid, i) => { reqPool.input(`cid${i}`, cid); });
        const attResult = await reqPool.query(
          `SELECT a.id, a.task_comment_id, a.file_name, a.created_at
           FROM task_comment_attachments a
           WHERE a.task_comment_id IN (${placeholders})
           ORDER BY a.created_at`
        );
        const attByComment = {};
        for (const row of attResult.recordset || []) {
          const cid = getRow(row, 'task_comment_id');
          if (!attByComment[cid]) attByComment[cid] = [];
          attByComment[cid].push({
            id: getRow(row, 'id'),
            file_name: getRow(row, 'file_name'),
            created_at: getRow(row, 'created_at'),
          });
        }
        comments.forEach((c) => { c.attachments = attByComment[c.id] || []; });
      }
      let remindersResult;
      try {
        remindersResult = await query(
          `SELECT r.id, r.task_id, r.user_id, r.remind_at, r.note, r.recurrence, r.next_fire_at, r.created_at, r.dismissed_at, u.full_name AS user_name
           FROM task_reminders r
           LEFT JOIN users u ON u.id = r.user_id
           WHERE r.task_id = @id ORDER BY r.remind_at ASC`,
          { id }
        );
      } catch (e) {
        if ((e.message || '').includes('recurrence') || (e.message || '').includes('next_fire_at')) {
          remindersResult = await query(
            `SELECT r.id, r.task_id, r.user_id, r.remind_at, r.note, r.created_at, r.dismissed_at, u.full_name AS user_name
             FROM task_reminders r
             LEFT JOIN users u ON u.id = r.user_id
             WHERE r.task_id = @id ORDER BY r.remind_at ASC`,
            { id }
          );
        } else throw e;
      }
      reminders = (remindersResult.recordset || []).map((r) => ({
        id: getRow(r, 'id'),
        user_id: getRow(r, 'user_id'),
        user_name: getRow(r, 'user_name'),
        remind_at: getRow(r, 'remind_at'),
        note: getRow(r, 'note'),
        recurrence: getRow(r, 'recurrence') || 'none',
        next_fire_at: getRow(r, 'next_fire_at'),
        created_at: getRow(r, 'created_at'),
        dismissed_at: getRow(r, 'dismissed_at'),
      }));
    } catch (_) {}

    const assignees = (assigneesResult.recordset || []).map((r) => ({
      user_id: getRow(r, 'user_id'),
      full_name: getRow(r, 'full_name'),
      email: getRow(r, 'email'),
      assigned_at: getRow(r, 'assigned_at'),
    }));
    const attachments = (attachmentsResult.recordset || []).map((r) => ({
      id: getRow(r, 'id'),
      file_name: getRow(r, 'file_name'),
      created_at: getRow(r, 'created_at'),
    }));

    let key_actions = [];
    try {
      const ka = getRow(task, 'key_actions');
      if (ka) key_actions = JSON.parse(ka);
    } catch (_) {}

    res.json({
      task: {
        ...task,
        key_actions,
        labels: taskLabels,
        assignees,
        attachments,
        progress_updates: progressUpdates,
        comments,
        reminders,
      },
    });
  } catch (err) {
    next(err);
  }
});

/** Update task: progress, status, title, description, key_actions, start_date, due_date; if status=completed send email to creator.
 *  When progress is updated by an assignee, a timestamped progress update is recorded (optional progress_note). */
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      progress,
      progress_note,
      status,
      title,
      description,
      key_actions,
      start_date,
      due_date,
      start_time,
      due_time,
      priority,
      labels,
    } = req.body || {};

    const existing = await query(`SELECT id, tenant_id, created_by, [status], title FROM tasks WHERE id = @id`, { id });
    const row = existing.recordset[0];
    if (!row) return res.status(404).json({ error: 'Task not found' });
    if (!canAccessTaskTenant(req, getRow(row, 'tenant_id'))) return res.status(403).json({ error: 'Forbidden' });

    const updates = [];
    const params = { id };
    let newProgress = undefined;

    if (progress !== undefined) {
      const p = Math.max(0, Math.min(100, parseInt(progress, 10) || 0));
      newProgress = p;
      updates.push('progress = @progress');
      params.progress = p;
    }
    if (status !== undefined) {
      const s = ['not_started', 'in_progress', 'completed', 'cancelled'].includes(status) ? status : getRow(row, 'status');
      updates.push('[status] = @status');
      params.status = s;
      if (s === 'completed') {
        updates.push('completed_at = SYSUTCDATETIME()');
        updates.push('completed_by = @completedBy');
        params.completedBy = req.user.id;
      }
    }
    if (title !== undefined) { updates.push('title = @title'); params.title = String(title).trim(); }
    if (description !== undefined) { updates.push('[description] = @description'); params.description = description; }
    if (key_actions !== undefined) {
      updates.push('key_actions = @keyActions');
      params.keyActions = Array.isArray(key_actions) ? JSON.stringify(key_actions) : (typeof key_actions === 'string' ? key_actions : null);
    }
    if (start_date !== undefined) { updates.push('start_date = @startDate'); params.startDate = start_date || null; }
    if (due_date !== undefined) { updates.push('due_date = @dueDate'); params.dueDate = due_date || null; }
    if (start_time !== undefined) {
      updates.push('start_time = @startTime');
      params.startTime = start_time != null && String(start_time).trim() ? String(start_time).trim().slice(0, 16) : null;
    }
    if (due_time !== undefined) {
      updates.push('due_time = @dueTime');
      params.dueTime = due_time != null && String(due_time).trim() ? String(due_time).trim().slice(0, 16) : null;
    }
    if (priority !== undefined) {
      const pr = ['low', 'medium', 'high', 'urgent'].includes(priority) ? priority : 'medium';
      updates.push('priority = @priority');
      params.priority = pr;
    }

    if (Array.isArray(labels)) {
      try {
        await replaceTaskLabels(id, labels);
      } catch (e) {
        if (!(e.message || '').includes('task_labels')) throw e;
      }
    }

    if (updates.length === 0 && !Array.isArray(labels)) return res.status(400).json({ error: 'No fields to update' });
    if (updates.length > 0) {
      updates.push('updated_at = SYSUTCDATETIME()');
      await query(`UPDATE tasks SET ${updates.join(', ')} WHERE id = @id`, params);
    }

    if (newProgress !== undefined) {
      try {
        const assignee = await isTaskAssignee(id, req.user.id);
        const creatorId = getRow(row, 'created_by');
        const isPrivileged = req.user.role === 'super_admin' || req.user.role === 'tenant_admin';
        const canLogProgress = assignee || creatorId === req.user.id || isPrivileged;
        if (canLogProgress) {
          const note = progress_note != null ? String(progress_note).trim() : null;
          try {
            await query(
              `INSERT INTO task_progress_updates (task_id, user_id, progress, note, entry_type) VALUES (@taskId, @userId, @progress, @note, N'progress')`,
              { taskId: id, userId: req.user.id, progress: newProgress, note: note || null }
            );
          } catch (e) {
            if ((e.message || '').includes('entry_type')) {
              await query(
                `INSERT INTO task_progress_updates (task_id, user_id, progress, note) VALUES (@taskId, @userId, @progress, @note)`,
                { taskId: id, userId: req.user.id, progress: newProgress, note: note || null }
              );
            } else throw e;
          }
        }
      } catch (_) { /* activity tables may not exist yet */ }
    }

    const newStatus = status !== undefined ? (['not_started', 'in_progress', 'completed', 'cancelled'].includes(status) ? status : getRow(row, 'status')) : getRow(row, 'status');
    if (newStatus === 'completed') {
      const creatorResult = await query(`SELECT email, full_name FROM users WHERE id = @createdBy`, { createdBy: getRow(row, 'created_by') });
      const creator = creatorResult.recordset?.[0];
      const completedByName = req.user.full_name || req.user.email || 'Someone';
      const appUrl = process.env.FRONTEND_ORIGIN || process.env.APP_URL || 'http://localhost:5173';
      const html = taskCompletedHtml({
        taskTitle: getRow(row, 'title'),
        completedByName,
        completedAt: new Date().toLocaleString(),
        taskId: id,
        appUrl,
      });
      if (creator && getRow(creator, 'email')) {
        sendEmail({ to: getRow(creator, 'email'), subject: `Task completed: ${getRow(row, 'title')}`, body: html, html: true }).catch((e) => console.error('[tasks] Completed email error:', e?.message));
      }
    }

    const patchBody = req.body || {};
    const patchKeys = Object.keys(patchBody).filter((k) => patchBody[k] !== undefined);
    const onlyProgressTweak = patchKeys.length > 0 && patchKeys.every((k) => ['progress', 'progress_note'].includes(k));
    const substantiveUpdate = patchKeys.some((k) =>
      ['title', 'description', 'start_date', 'due_date', 'start_time', 'due_time', 'priority', 'status', 'labels', 'key_actions'].includes(k)
    );
    if (isEmailConfigured() && substantiveUpdate && !onlyProgressTweak && newStatus !== 'completed') {
      try {
        const summaryLines = [];
        if (title !== undefined) summaryLines.push(['Title', String(title).trim()]);
        if (description !== undefined) {
          const d = description != null ? String(description) : '';
          summaryLines.push(['Description', d.length > 220 ? `${d.slice(0, 220)}…` : d || '—']);
        }
        if (start_date !== undefined) summaryLines.push(['Start date', params.startDate != null ? String(params.startDate) : '—']);
        if (due_date !== undefined) summaryLines.push(['Due date', params.dueDate != null ? String(params.dueDate) : '—']);
        if (start_time !== undefined) summaryLines.push(['Start time', params.startTime != null ? String(params.startTime) : '—']);
        if (due_time !== undefined) summaryLines.push(['Due time', params.dueTime != null ? String(params.dueTime) : '—']);
        if (priority !== undefined) summaryLines.push(['Priority', params.priority || '—']);
        if (status !== undefined) summaryLines.push(['Status', newStatus || '—']);
        if (Array.isArray(labels)) summaryLines.push(['Labels', labels.length ? labels.join(', ') : '(cleared)']);
        if (key_actions !== undefined) summaryLines.push(['Key actions', 'Updated']);

        if (summaryLines.length > 0) {
          const appUrl = process.env.FRONTEND_ORIGIN || process.env.APP_URL || 'http://localhost:5173';
          const taskTitleForMail = title !== undefined ? String(title).trim() : getRow(row, 'title');
          const emailsResult = await query(
            `SELECT DISTINCT u.email FROM (
               SELECT user_id FROM task_assignments WHERE task_id = @taskId
               UNION SELECT created_by FROM tasks WHERE id = @taskId
             ) x INNER JOIN users u ON u.id = x.user_id
             WHERE u.id <> @excludeId AND u.email IS NOT NULL AND LTRIM(RTRIM(ISNULL(u.email, N''))) <> N''`,
            { taskId: id, excludeId: req.user.id }
          );
          const html = taskUpdatedNotifyHtml({
            taskTitle: taskTitleForMail,
            summaryLines,
            taskId: id,
            appUrl,
          });
          const subject = `Task updated: ${taskTitleForMail}`;
          for (const u of emailsResult.recordset || []) {
            const em = getRow(u, 'email');
            if (em) sendEmail({ to: em, subject, body: html, html: true }).catch((e) => console.error('[tasks] update notify', e?.message));
          }
        }
      } catch (e) {
        console.error('[tasks] substantive update email:', e?.message || e);
      }
    }

    const updatedResult = await query(
      `SELECT id, title, [description], key_actions, start_date, due_date, progress, [status], completed_at, completed_by, updated_at FROM tasks WHERE id = @id`,
      { id }
    );
    const updated = updatedResult.recordset[0];
    let parsedKeyActions = [];
    try {
      if (getRow(updated, 'key_actions')) parsedKeyActions = JSON.parse(getRow(updated, 'key_actions'));
    } catch (_) {}
    res.json({ task: { ...updated, key_actions: parsedKeyActions } });
  } catch (err) {
    next(err);
  }
});

/** Assign or transfer: body { user_ids: [] } to assign, or { transfer_from_user_id, transfer_to_user_id } to transfer */
router.post('/:id/assign', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { user_ids, transfer_from_user_id, transfer_to_user_id } = req.body || {};

    const taskResult = await query(`SELECT id, tenant_id, title, due_date, created_by FROM tasks WHERE id = @id`, { id });
    const task = taskResult.recordset[0];
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (!canAccessTaskTenant(req, getRow(task, 'tenant_id'))) return res.status(403).json({ error: 'Forbidden' });

    if (transfer_from_user_id && transfer_to_user_id) {
      await query(
        `UPDATE task_assignments SET user_id = @toId, assigned_by = @assignedBy, assigned_at = SYSUTCDATETIME(), transferred_from_user_id = @fromId
         WHERE task_id = @taskId AND user_id = @fromId`,
        { taskId: id, fromId: transfer_from_user_id, toId: transfer_to_user_id, assignedBy: req.user.id }
      );
      const assigneesResult = await query(
        `SELECT u.id, u.full_name, u.email FROM task_assignments a JOIN users u ON u.id = a.user_id WHERE a.task_id = @id`,
        { id }
      );
      const newAssignee = (assigneesResult.recordset || []).find((r) => getRow(r, 'id') === transfer_to_user_id);
      if (newAssignee && getRow(newAssignee, 'email')) {
        const appUrl = process.env.FRONTEND_ORIGIN || process.env.APP_URL || 'http://localhost:5173';
        const html = taskAssignedHtml({
          taskTitle: getRow(task, 'title'),
          assignerName: req.user.full_name || req.user.email,
          dueDate: getRow(task, 'due_date'),
          taskId: id,
          appUrl,
        });
        sendEmail({ to: getRow(newAssignee, 'email'), subject: `Task transferred to you: ${getRow(task, 'title')}`, body: html, html: true }).catch((e) => console.error('[tasks] Transfer email error:', e?.message));
      }
    } else if (Array.isArray(user_ids)) {
      for (const userId of user_ids) {
        if (!userId) continue;
        await query(
          `INSERT INTO task_assignments (task_id, user_id, assigned_by)
           SELECT @taskId, @userId, @assignedBy
           WHERE NOT EXISTS (SELECT 1 FROM task_assignments WHERE task_id = @taskId AND user_id = @userId)`,
          { taskId: id, userId, assignedBy: req.user.id }
        );
      }
      const assigneesResult = await query(
        `SELECT u.id, u.full_name, u.email FROM task_assignments a JOIN users u ON u.id = a.user_id WHERE a.task_id = @id`,
        { id }
      );
      const appUrl = process.env.FRONTEND_ORIGIN || process.env.APP_URL || 'http://localhost:5173';
      const html = taskAssignedHtml({
        taskTitle: getRow(task, 'title'),
        assignerName: req.user.full_name || req.user.email,
        dueDate: getRow(task, 'due_date'),
        taskId: id,
        appUrl,
      });
      for (const r of assigneesResult.recordset || []) {
        if (getRow(r, 'email')) {
          sendEmail({ to: getRow(r, 'email'), subject: `Task assigned: ${getRow(task, 'title')}`, body: html, html: true }).catch((e) => console.error('[tasks] Assign email error:', e?.message));
        }
      }
    } else {
      return res.status(400).json({ error: 'Provide user_ids array or transfer_from_user_id and transfer_to_user_id' });
    }

    const assigneesResult = await query(
      `SELECT a.user_id, u.full_name, u.email FROM task_assignments a JOIN users u ON u.id = a.user_id WHERE a.task_id = @id`,
      { id }
    );
    const assignees = (assigneesResult.recordset || []).map((r) => ({
      user_id: getRow(r, 'user_id'),
      full_name: getRow(r, 'full_name'),
      email: getRow(r, 'email'),
    }));
    res.json({ assignees });
  } catch (err) {
    next(err);
  }
});

/** Upload one or many attachments (multipart field `file` or `files[]`) */
router.post('/:id/attachments', taskUploadMany, async (req, res, next) => {
  try {
    const { id } = req.params;
    const fromFields = req.files || {};
    const list = [...(fromFields.file || []), ...(fromFields.files || [])];
    if (!list.length) return res.status(400).json({ error: 'No file uploaded' });

    const taskResult = await query(`SELECT id, tenant_id, title FROM tasks WHERE id = @id`, { id });
    const task = taskResult.recordset[0];
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (!canAccessTaskTenant(req, getRow(task, 'tenant_id'))) return res.status(403).json({ error: 'Forbidden' });

    const uploaded = [];
    for (const file of list) {
      const relativePath = path.relative(path.join(process.cwd(), 'uploads'), file.path);
      const insertResult = await query(
        `INSERT INTO task_attachments (task_id, file_name, file_path, uploaded_by)
         OUTPUT INSERTED.id, INSERTED.file_name, INSERTED.created_at
         VALUES (@taskId, @fileName, @filePath, @uploadedBy)`,
        {
          taskId: id,
          fileName: file.originalname || file.filename,
          filePath: relativePath.replace(/\\/g, '/'),
          uploadedBy: req.user.id,
        }
      );
      const att = insertResult.recordset[0];
      uploaded.push({ id: getRow(att, 'id'), file_name: getRow(att, 'file_name'), created_at: getRow(att, 'created_at') });
    }

    if (isEmailConfigured() && uploaded.length) {
      const appUrl = process.env.FRONTEND_ORIGIN || process.env.APP_URL || 'http://localhost:5173';
      const emailsResult = await query(
        `SELECT DISTINCT u.email FROM (
           SELECT user_id FROM task_assignments WHERE task_id = @taskId
           UNION SELECT created_by FROM tasks WHERE id = @taskId
         ) x INNER JOIN users u ON u.id = x.user_id
         WHERE u.id <> @excludeId AND u.email IS NOT NULL AND LTRIM(RTRIM(ISNULL(u.email, N''))) <> N''`,
        { taskId: id, excludeId: req.user.id }
      );
      const html = taskUpdatedNotifyHtml({
        taskTitle: getRow(task, 'title'),
        summaryLines: [[`Attachments added (${uploaded.length})`, uploaded.map((a) => a.file_name).join(', ')]],
        taskId: id,
        appUrl,
      });
      const subject = `Task updated — files: ${getRow(task, 'title')}`;
      for (const u of emailsResult.recordset || []) {
        const em = getRow(u, 'email');
        if (em) sendEmail({ to: em, subject, body: html, html: true }).catch((e) => console.error('[tasks] attach email', e?.message));
      }
    }

    res.status(201).json({ attachments: uploaded, attachment: uploaded[0] });
  } catch (err) {
    next(err);
  }
});

/** Download attachment */
router.get('/:id/attachments/:attachmentId/download', async (req, res, next) => {
  try {
    const { id, attachmentId } = req.params;
    const result = await query(
      `SELECT a.file_path, a.file_name, t.tenant_id FROM task_attachments a JOIN tasks t ON t.id = a.task_id WHERE a.id = @attachmentId AND a.task_id = @taskId`,
      { taskId: id, attachmentId }
    );
    const row = result.recordset[0];
    if (!row) return res.status(404).json({ error: 'Attachment not found' });
    if (!canAccessTaskTenant(req, getRow(row, 'tenant_id'))) return res.status(403).json({ error: 'Forbidden' });
    const fullPath = path.join(process.cwd(), 'uploads', getRow(row, 'file_path'));
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not found' });
    res.download(fullPath, getRow(row, 'file_name') || 'attachment');
  } catch (err) {
    next(err);
  }
});

/** Add a timestamped progress update (assignees). Body: { progress?, note?, entry_type?: 'progress' | 'daily_transcription' } */
router.post('/:id/progress-updates', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { progress, note, entry_type } = req.body || {};
    const taskResult = await query(`SELECT id, tenant_id, progress, created_by FROM tasks WHERE id = @id`, { id });
    const task = taskResult.recordset[0];
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (!canAccessTaskTenant(req, getRow(task, 'tenant_id'))) return res.status(403).json({ error: 'Forbidden' });
    const assignee = await isTaskAssignee(id, req.user.id);
    const isCreator = getRow(task, 'created_by') === req.user.id;
    const isPrivileged = req.user.role === 'super_admin' || req.user.role === 'tenant_admin';
    if (!assignee && !isCreator && !isPrivileged) {
      return res.status(403).json({ error: 'Only assignees or the task creator can document progress' });
    }

    const et = entry_type === 'daily_transcription' ? 'daily_transcription' : 'progress';
    let p = Math.max(0, Math.min(100, parseInt(progress, 10) ?? NaN));
    if (Number.isNaN(p)) {
      p = Math.max(0, Math.min(100, parseInt(getRow(task, 'progress'), 10) || 0));
    }
    const noteStr = note != null ? String(note).trim() : null;

    await query(`UPDATE tasks SET progress = @progress, updated_at = SYSUTCDATETIME() WHERE id = @taskId`, { taskId: id, progress: p });
    let insertResult;
    try {
      insertResult = await query(
        `INSERT INTO task_progress_updates (task_id, user_id, progress, note, entry_type)
         OUTPUT INSERTED.id, INSERTED.progress, INSERTED.note, INSERTED.entry_type, INSERTED.created_at
         VALUES (@taskId, @userId, @progress, @note, @entryType)`,
        { taskId: id, userId: req.user.id, progress: p, note: noteStr, entryType: et }
      );
    } catch (e) {
      if ((e.message || '').includes('entry_type')) {
        insertResult = await query(
          `INSERT INTO task_progress_updates (task_id, user_id, progress, note)
           OUTPUT INSERTED.id, INSERTED.progress, INSERTED.note, INSERTED.created_at
           VALUES (@taskId, @userId, @progress, @note)`,
          { taskId: id, userId: req.user.id, progress: p, note: noteStr }
        );
      } else throw e;
    }
    const row = insertResult.recordset[0];
    res.status(201).json({
      progress_update: {
        id: getRow(row, 'id'),
        progress: getRow(row, 'progress'),
        note: getRow(row, 'note'),
        entry_type: getRow(row, 'entry_type') || et,
        created_at: getRow(row, 'created_at'),
      },
      task: { progress: p },
    });
  } catch (err) {
    next(err);
  }
});

/** Add a note (assignees, creator, or tenant admin). Body: { body, visibility?: 'all' | 'assignees' } */
router.post('/:id/comments', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { body: commentBody, visibility } = req.body || {};
    const taskResult = await query(`SELECT id, tenant_id, title, created_by FROM tasks WHERE id = @id`, { id });
    const task = taskResult.recordset[0];
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (!canAccessTaskTenant(req, getRow(task, 'tenant_id'))) return res.status(403).json({ error: 'Forbidden' });
    const canPost = await canPostTaskComment(req, id);
    if (!canPost) return res.status(403).json({ error: 'You cannot add notes on this task' });
    if (!commentBody || !String(commentBody).trim()) return res.status(400).json({ error: 'Comment body is required' });

    const visRaw = (visibility || 'all').toLowerCase();
    const vis = visRaw === 'assignees' || visRaw === 'assignees_only' ? 'assignees' : 'all';

    let insertResult;
    try {
      insertResult = await query(
        `INSERT INTO task_comments (task_id, user_id, body, visibility)
         OUTPUT INSERTED.id, INSERTED.body, INSERTED.visibility, INSERTED.created_at
         VALUES (@taskId, @userId, @body, @visibility)`,
        { taskId: id, userId: req.user.id, body: String(commentBody).trim(), visibility: vis }
      );
    } catch (e) {
      if ((e.message || '').includes('visibility')) {
        insertResult = await query(
          `INSERT INTO task_comments (task_id, user_id, body)
           OUTPUT INSERTED.id, INSERTED.body, INSERTED.created_at
           VALUES (@taskId, @userId, @body)`,
          { taskId: id, userId: req.user.id, body: String(commentBody).trim() }
        );
      } else throw e;
    }
    const row = insertResult.recordset[0];

    if (isEmailConfigured()) {
      const appUrl = process.env.FRONTEND_ORIGIN || process.env.APP_URL || 'http://localhost:5173';
      const excerpt = String(commentBody).trim().slice(0, 220);
      const visLabel = vis === 'assignees' ? 'Assignees only' : 'Everyone on the task';
      const emailsResult = await query(
        `SELECT DISTINCT u.email, u.full_name, u.id FROM (
           SELECT user_id FROM task_assignments WHERE task_id = @taskId
           UNION SELECT created_by FROM tasks WHERE id = @taskId
         ) x INNER JOIN users u ON u.id = x.user_id
         WHERE u.id <> @excludeId AND u.email IS NOT NULL AND LTRIM(RTRIM(ISNULL(u.email, N''))) <> N''`,
        { taskId: id, excludeId: req.user.id }
      );
      const html = taskNewCommentHtml({
        taskTitle: getRow(task, 'title'),
        authorName: req.user.full_name || req.user.email,
        excerpt,
        visibilityLabel: visLabel,
        taskId: id,
        appUrl,
      });
      const subject = `New note on task: ${getRow(task, 'title')}`;
      for (const u of emailsResult.recordset || []) {
        const em = getRow(u, 'email');
        if (em) sendEmail({ to: em, subject, body: html, html: true }).catch((err) => console.error('[tasks] comment email', err?.message));
      }
    }

    res.status(201).json({
      comment: {
        id: getRow(row, 'id'),
        body: getRow(row, 'body'),
        visibility: getRow(row, 'visibility') || vis,
        created_at: getRow(row, 'created_at'),
        user_name: req.user.full_name || req.user.email,
      },
    });
  } catch (err) {
    next(err);
  }
});

/** Upload multiple attachments to a comment (assignees only). Multipart: files[] */
router.post('/:id/comments/:commentId/attachments', commentAttachmentsUpload, async (req, res, next) => {
  try {
    const { id, commentId } = req.params;
    const files = req.files || [];
    const taskResult = await query(`SELECT id, tenant_id FROM tasks WHERE id = @id`, { id });
    const task = taskResult.recordset[0];
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (!canAccessTaskTenant(req, getRow(task, 'tenant_id'))) return res.status(403).json({ error: 'Forbidden' });
    const canPost = await canPostTaskComment(req, id);
    if (!canPost) return res.status(403).json({ error: 'Forbidden' });
    const commentResult = await query(
      `SELECT id FROM task_comments WHERE id = @commentId AND task_id = @taskId`,
      { taskId: id, commentId }
    );
    if (!commentResult.recordset?.[0]) return res.status(404).json({ error: 'Comment not found' });

    const uploaded = [];
    for (const file of files) {
      const relativePath = path.relative(path.join(process.cwd(), 'uploads'), file.path).replace(/\\/g, '/');
      const insertResult = await query(
        `INSERT INTO task_comment_attachments (task_comment_id, file_name, file_path, uploaded_by)
         OUTPUT INSERTED.id, INSERTED.file_name, INSERTED.created_at
         VALUES (@commentId, @fileName, @filePath, @uploadedBy)`,
        {
          commentId,
          fileName: file.originalname || file.filename,
          filePath: relativePath,
          uploadedBy: req.user.id,
        }
      );
      const row = insertResult.recordset[0];
      uploaded.push({
        id: getRow(row, 'id'),
        file_name: getRow(row, 'file_name'),
        created_at: getRow(row, 'created_at'),
      });
    }
    res.status(201).json({ attachments: uploaded });
  } catch (err) {
    next(err);
  }
});

/** Download a comment attachment */
router.get('/:id/comments/:commentId/attachments/:attachmentId/download', async (req, res, next) => {
  try {
    const { id, commentId, attachmentId } = req.params;
    const result = await query(
      `SELECT a.file_path, a.file_name, t.tenant_id
       FROM task_comment_attachments a
       INNER JOIN task_comments c ON c.id = a.task_comment_id AND c.task_id = @taskId
       INNER JOIN tasks t ON t.id = c.task_id
       WHERE a.id = @attachmentId AND a.task_comment_id = @commentId`,
      { taskId: id, commentId, attachmentId }
    );
    const row = result.recordset[0];
    if (!row) return res.status(404).json({ error: 'Attachment not found' });
    if (!canAccessTaskTenant(req, getRow(row, 'tenant_id'))) return res.status(403).json({ error: 'Forbidden' });
    const fullPath = path.join(process.cwd(), 'uploads', getRow(row, 'file_path'));
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not found' });
    res.download(fullPath, getRow(row, 'file_name') || 'attachment');
  } catch (err) {
    next(err);
  }
});

/** Add a reminder. Body: { remind_at, note?, recurrence?: 'none'|'hourly'|'daily' } */
router.post('/:id/reminders', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { remind_at, note, recurrence } = req.body || {};
    const taskResult = await query(`SELECT id, tenant_id FROM tasks WHERE id = @id`, { id });
    const task = taskResult.recordset[0];
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (!canAccessTaskTenant(req, getRow(task, 'tenant_id'))) return res.status(403).json({ error: 'Forbidden' });
    const canPost = await canPostTaskComment(req, id);
    if (!canPost) return res.status(403).json({ error: 'Forbidden' });
    const remindAt = remind_at ? new Date(remind_at) : null;
    if (!remindAt || isNaN(remindAt.getTime())) return res.status(400).json({ error: 'Valid remind_at is required' });

    const noteStr = note != null ? String(note).trim().slice(0, 500) : null;
    const rec = ['hourly', 'daily', 'none'].includes(String(recurrence || '').toLowerCase())
      ? String(recurrence).toLowerCase()
      : 'none';
    const nextFire = remindAt.toISOString();

    let insertResult;
    try {
      insertResult = await query(
        `INSERT INTO task_reminders (task_id, user_id, remind_at, note, recurrence, next_fire_at)
         OUTPUT INSERTED.id, INSERTED.remind_at, INSERTED.note, INSERTED.recurrence, INSERTED.next_fire_at, INSERTED.created_at
         VALUES (@taskId, @userId, @remindAt, @note, @recurrence, @nextFire)`,
        {
          taskId: id,
          userId: req.user.id,
          remindAt: remindAt.toISOString(),
          note: noteStr,
          recurrence: rec,
          nextFire,
        }
      );
    } catch (e) {
      if ((e.message || '').includes('recurrence') || (e.message || '').includes('next_fire_at')) {
        insertResult = await query(
          `INSERT INTO task_reminders (task_id, user_id, remind_at, note)
           OUTPUT INSERTED.id, INSERTED.remind_at, INSERTED.note, INSERTED.created_at
           VALUES (@taskId, @userId, @remindAt, @note)`,
          { taskId: id, userId: req.user.id, remindAt: remindAt.toISOString(), note: noteStr }
        );
      } else throw e;
    }
    const row = insertResult.recordset[0];
    res.status(201).json({
      reminder: {
        id: getRow(row, 'id'),
        remind_at: getRow(row, 'remind_at'),
        note: getRow(row, 'note'),
        recurrence: getRow(row, 'recurrence') || rec,
        next_fire_at: getRow(row, 'next_fire_at') || nextFire,
        created_at: getRow(row, 'created_at'),
        user_name: req.user.full_name || req.user.email,
      },
    });
  } catch (err) {
    next(err);
  }
});

/** Dismiss a reminder (assignees or reminder owner). */
router.patch('/:id/reminders/:reminderId/dismiss', async (req, res, next) => {
  try {
    const { id, reminderId } = req.params;
    const taskResult = await query(`SELECT id, tenant_id FROM tasks WHERE id = @id`, { id });
    const task = taskResult.recordset[0];
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (!canAccessTaskTenant(req, getRow(task, 'tenant_id'))) return res.status(403).json({ error: 'Forbidden' });

    const remResult = await query(
      `SELECT id, user_id FROM task_reminders WHERE id = @reminderId AND task_id = @taskId`,
      { taskId: id, reminderId }
    );
    const rem = remResult.recordset[0];
    if (!rem) return res.status(404).json({ error: 'Reminder not found' });
    const assignee = await isTaskAssignee(id, req.user.id);
    const isOwner = getRow(rem, 'user_id') === req.user.id;
    if (!assignee && !isOwner) return res.status(403).json({ error: 'Forbidden' });

    await query(
      `UPDATE task_reminders SET dismissed_at = SYSUTCDATETIME() WHERE id = @reminderId AND task_id = @taskId`,
      { taskId: id, reminderId }
    );
    res.json({ dismissed: true });
  } catch (err) {
    next(err);
  }
});

/** List users in same tenant (for assignee picker) */
router.get('/users/tenant', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    if (!tenantId) return res.json({ users: [] });
    const result = await query(
      `SELECT u.id, u.full_name, u.email FROM users u
       INNER JOIN user_tenants ut ON ut.user_id = u.id AND ut.tenant_id = @tenantId
       WHERE u.status = 'active'
       ORDER BY u.full_name`,
      { tenantId }
    );
    const users = (result.recordset || []).map((r) => ({ id: getRow(r, 'id'), full_name: getRow(r, 'full_name'), email: getRow(r, 'email') }));
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

// --- Tasks Library (folders + files) ---
const libraryUploadsDir = path.join(process.cwd(), 'uploads', 'tasks-library');
const libraryUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const tenantId = String(req.user?.tenant_id || 'anon');
      const dir = path.join(libraryUploadsDir, tenantId);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const safe = (file.originalname || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${randomUUID()}-${safe}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
}).single('file');

function canAccessLibraryTenant(req, tenantId) {
  if (req.user?.role === 'super_admin') return true;
  const tid = req.user?.tenant_id;
  if (!tid) return false;
  if (Array.isArray(req.user?.tenant_ids)) return req.user.tenant_ids.includes(tenantId);
  return tid === tenantId;
}

/** GET /api/tasks/library/folders – list folders (flat with parent_id; root when parent_id null) */
router.get('/library/folders', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    if (!tenantId) return res.json({ folders: [] });
    const result = await query(
      `SELECT id, parent_id, name, created_at FROM task_library_folders WHERE tenant_id = @tenantId ORDER BY name`,
      { tenantId }
    );
    const folders = (result.recordset || []).map((r) => ({
      id: getRow(r, 'id'),
      parent_id: getRow(r, 'parent_id'),
      name: getRow(r, 'name'),
      created_at: getRow(r, 'created_at'),
    }));
    res.json({ folders });
  } catch (err) {
    if (err.message?.includes('task_library_folders')) return res.json({ folders: [], migrationRequired: true });
    next(err);
  }
});

/** POST /api/tasks/library/folders – create folder */
router.post('/library/folders', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    if (!tenantId) return res.status(403).json({ error: 'No tenant' });
    const { name, parent_id } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Folder name required' });
    const parentId = parent_id && String(parent_id).trim() ? parent_id : null;
    if (parentId) {
      const parent = await query(`SELECT id, tenant_id FROM task_library_folders WHERE id = @parentId`, { parentId });
      const row = parent.recordset?.[0];
      if (!row || !canAccessLibraryTenant(req, getRow(row, 'tenant_id'))) return res.status(404).json({ error: 'Parent folder not found' });
    }
    const result = await query(
      `INSERT INTO task_library_folders (tenant_id, parent_id, name, created_by)
       OUTPUT INSERTED.id, INSERTED.parent_id, INSERTED.name, INSERTED.created_at
       VALUES (@tenantId, @parentId, @name, @userId)`,
      { tenantId, parentId, name: String(name).trim().slice(0, 255), userId: req.user.id }
    );
    const row = result.recordset?.[0];
    res.status(201).json({ folder: row ? { id: getRow(row, 'id'), parent_id: getRow(row, 'parent_id'), name: getRow(row, 'name'), created_at: getRow(row, 'created_at') } : null });
  } catch (err) {
    if (err.message?.includes('task_library_folders')) return res.status(503).json({ error: 'Library not set up. Run: node scripts/run-tasks-library-schema.js' });
    next(err);
  }
});

/** GET /api/tasks/library/files?folder_id= – list files (optional folder_id; null = root) */
router.get('/library/files', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    if (!tenantId) return res.json({ files: [] });
    const folderId = req.query.folder_id && String(req.query.folder_id).trim() ? req.query.folder_id : null;
    let sql = `SELECT f.id, f.folder_id, f.file_name, f.file_path, f.file_size, f.created_at
               FROM task_library_files f WHERE f.tenant_id = @tenantId`;
    const params = { tenantId };
    if (folderId === '') {
      sql += ` AND f.folder_id IS NULL`;
    } else if (folderId) {
      sql += ` AND f.folder_id = @folderId`;
      params.folderId = folderId;
    }
    sql += ` ORDER BY f.file_name`;
    const result = await query(sql, params);
    const files = (result.recordset || []).map((r) => ({
      id: getRow(r, 'id'),
      folder_id: getRow(r, 'folder_id'),
      file_name: getRow(r, 'file_name'),
      file_path: getRow(r, 'file_path'),
      file_size: getRow(r, 'file_size'),
      created_at: getRow(r, 'created_at'),
    }));
    res.json({ files });
  } catch (err) {
    if (err.message?.includes('task_library_files')) return res.json({ files: [], migrationRequired: true });
    next(err);
  }
});

/** POST /api/tasks/library/files – upload file (body: folder_id optional) */
router.post('/library/files', libraryUpload, async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    if (!tenantId) return res.status(403).json({ error: 'No tenant' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const folderId = req.body?.folder_id && String(req.body.folder_id).trim() ? req.body.folder_id : null;
    if (folderId) {
      const folder = await query(`SELECT id, tenant_id FROM task_library_folders WHERE id = @folderId`, { folderId });
      const row = folder.recordset?.[0];
      if (!row || !canAccessLibraryTenant(req, getRow(row, 'tenant_id'))) return res.status(404).json({ error: 'Folder not found' });
    }
    const relativePath = path.relative(path.join(libraryUploadsDir, tenantId), req.file.path);
    const filePath = path.join(tenantId, relativePath).replace(/\\/g, '/');
    const result = await query(
      `INSERT INTO task_library_files (tenant_id, folder_id, file_name, file_path, file_size, created_by)
       OUTPUT INSERTED.id, INSERTED.folder_id, INSERTED.file_name, INSERTED.file_path, INSERTED.file_size, INSERTED.created_at
       VALUES (@tenantId, @folderId, @fileName, @filePath, @fileSize, @userId)`,
      { tenantId, folderId, fileName: req.file.originalname || req.file.filename || 'file', filePath, fileSize: req.file.size || null, userId: req.user.id }
    );
    const row = result.recordset?.[0];
    res.status(201).json({ file: row ? { id: getRow(row, 'id'), folder_id: getRow(row, 'folder_id'), file_name: getRow(row, 'file_name'), file_path: getRow(row, 'file_path'), file_size: getRow(row, 'file_size'), created_at: getRow(row, 'created_at') } : null });
  } catch (err) {
    if (err.message?.includes('task_library_files')) return res.status(503).json({ error: 'Library not set up. Run: node scripts/run-tasks-library-schema.js' });
    next(err);
  }
});

/** GET /api/tasks/library/files/:id/download – download file */
router.get('/library/files/:id/download', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT f.id, f.file_name, f.file_path, f.tenant_id FROM task_library_files f WHERE f.id = @id`,
      { id }
    );
    const row = result.recordset?.[0];
    if (!row || !canAccessLibraryTenant(req, getRow(row, 'tenant_id'))) return res.status(404).json({ error: 'File not found' });
    const fullPath = path.join(libraryUploadsDir, getRow(row, 'file_path'));
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not found on disk' });
    res.download(fullPath, getRow(row, 'file_name') || 'download');
  } catch (err) {
    next(err);
  }
});

export default router;
