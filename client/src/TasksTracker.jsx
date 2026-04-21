import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { tasks as tasksApi, openAttachmentWithAuth, downloadAttachmentWithAuth } from './api';
import { useSecondaryNavHidden } from './lib/useSecondaryNavHidden.js';
import InfoHint from './components/InfoHint.jsx';
import TasksDashboardBoard from './TasksDashboardBoard.jsx';

const STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const REMINDER_RECURRENCE = [
  { value: 'none', label: 'Once (no repeat)' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
];

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, { dateStyle: 'short' });
}

function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

function formatTimeShort(t) {
  if (t == null || t === '') return '';
  const s = String(t);
  if (s.length <= 8 && !s.includes('T')) return s.slice(0, 5);
  try {
    return new Date(s).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return s.slice(0, 5);
  }
}

function StatusBadge({ status }) {
  const styles = {
    not_started: 'bg-slate-100 text-slate-800',
    in_progress: 'bg-amber-100 text-amber-900',
    completed: 'bg-emerald-100 text-emerald-900',
    cancelled: 'bg-red-100 text-red-900',
  };
  const label = STATUS_OPTIONS.find((o) => o.value === status)?.label || status;
  return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${styles[status] || styles.not_started}`}>{label}</span>;
}

function PriorityBadge({ priority }) {
  const p = priority || 'medium';
  const styles = {
    low: 'bg-slate-100 text-slate-700',
    medium: 'bg-sky-100 text-sky-900',
    high: 'bg-orange-100 text-orange-900',
    urgent: 'bg-rose-100 text-rose-900',
  };
  const label = PRIORITY_OPTIONS.find((o) => o.value === p)?.label || p;
  return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${styles[p] || styles.medium}`}>{label}</span>;
}

function inputClass() {
  return 'w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 outline-none';
}

function btnPrimary() {
  return 'inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50';
}

function btnSecondary() {
  return 'inline-flex items-center justify-center rounded-lg border border-surface-300 bg-white px-4 py-2 text-sm font-medium text-surface-800 hover:bg-surface-50';
}

function CreateTaskModal({ open, tenantUsers, defaultAssigneeIds, onClose, onCreated, onError }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [labelsStr, setLabelsStr] = useState('');
  const [assigneeIds, setAssigneeIds] = useState([]);
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setTitle('');
      setDescription('');
      setPriority('medium');
      setStartDate('');
      setStartTime('');
      setDueDate('');
      setDueTime('');
      setLabelsStr('');
      setAssigneeIds([]);
      setFiles([]);
    }
  }, [open]);

  useEffect(() => {
    if (open && defaultAssigneeIds?.length) {
      setAssigneeIds([...new Set(defaultAssigneeIds)]);
    }
  }, [open, defaultAssigneeIds]);

  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      onError('Title is required');
      return;
    }
    setSaving(true);
    onError('');
    try {
      const labels = labelsStr
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        start_date: startDate || undefined,
        start_time: startTime || undefined,
        due_date: dueDate || undefined,
        due_time: dueTime || undefined,
        labels,
        assignee_ids: assigneeIds,
      };
      const data = await tasksApi.create(payload);
      const taskId = data.task?.id;
      if (taskId && files.length) {
        await tasksApi.uploadAttachments(taskId, files);
      }
      onCreated(taskId);
    } catch (err) {
      onError(err?.message || 'Failed to create task');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-slate-900/50" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-surface-200 bg-white shadow-2xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-surface-900">Create task</h2>
          <button type="button" onClick={onClose} className="text-surface-500 hover:text-surface-800 text-xl leading-none">
            ×
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-surface-600 mb-1">Title *</label>
            <input className={inputClass()} value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Short title" />
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-600 mb-1">Description</label>
            <textarea className={inputClass()} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Details, acceptance criteria…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">Priority</label>
              <select className={inputClass()} value={priority} onChange={(e) => setPriority(e.target.value)}>
                {PRIORITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">Labels (comma-separated)</label>
              <input className={inputClass()} value={labelsStr} onChange={(e) => setLabelsStr(e.target.value)} placeholder="urgent, q1, legal" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">Start date</label>
              <input type="date" className={inputClass()} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">Start time</label>
              <input type="time" className={inputClass()} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">Due date</label>
              <input type="date" className={inputClass()} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">Due time</label>
              <input type="time" className={inputClass()} value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-600 mb-1">Assign to</label>
            <div className="max-h-36 overflow-y-auto rounded-lg border border-surface-200 p-2 space-y-1">
              {tenantUsers.map((u) => (
                <label key={u.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={assigneeIds.includes(u.id)}
                    onChange={(e) =>
                      setAssigneeIds((ids) => (e.target.checked ? [...ids, u.id] : ids.filter((id) => id !== u.id)))
                    }
                    className="rounded border-surface-300 text-brand-600"
                  />
                  <span>{u.full_name || u.email}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-600 mb-1">Attachments</label>
            <input
              type="file"
              multiple
              className="text-sm text-surface-600 file:mr-2 file:rounded file:border file:border-surface-300 file:px-3 file:py-1.5"
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
            />
            {files.length > 0 && <p className="text-xs text-surface-500 mt-1">{files.length} file(s) queued</p>}
          </div>
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={saving} className={btnPrimary()}>
              {saving ? 'Creating…' : 'Create task'}
            </button>
            <button type="button" onClick={onClose} className={btnSecondary()}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TaskDetailDrawer({ taskId, onClose, currentUserId, tenantUsers, onUpdated, onError }) {
  const [task, setTask] = useState(null);
  const [tab, setTab] = useState('details');
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(null);
  const [commentBody, setCommentBody] = useState('');
  const [commentVis, setCommentVis] = useState('all');
  const [commentFiles, setCommentFiles] = useState([]);
  const [progressNote, setProgressNote] = useState('');
  const [dailyText, setDailyText] = useState('');
  const [remindAt, setRemindAt] = useState('');
  const [remindNote, setRemindNote] = useState('');
  const [remindRecurrence, setRemindRecurrence] = useState('none');

  const load = useCallback(() => {
    if (!taskId) return;
    tasksApi
      .get(taskId)
      .then((d) => {
        const t = d.task;
        setTask(t);
        setDraft({
          title: t.title || '',
          description: t.description || '',
          status: t.status || 'not_started',
          priority: t.priority || 'medium',
          progress: t.progress ?? 0,
          start_date: t.start_date ? String(t.start_date).slice(0, 10) : '',
          start_time: t.start_time ? String(t.start_time).slice(0, 5) : '',
          due_date: t.due_date ? String(t.due_date).slice(0, 10) : '',
          due_time: t.due_time ? String(t.due_time).slice(0, 5) : '',
          labelsStr: (t.labels || []).join(', '),
        });
      })
      .catch((e) => onError(e?.message || 'Failed to load task'));
  }, [taskId, onError]);

  useEffect(() => {
    load();
  }, [load]);

  if (!taskId) return null;

  const saveDetails = async () => {
    if (!draft || !task) return;
    setSaving(true);
    onError('');
    try {
      const labels = draft.labelsStr
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      await tasksApi.update(task.id, {
        title: draft.title.trim(),
        description: draft.description,
        status: draft.status,
        priority: draft.priority,
        progress: Number(draft.progress),
        start_date: draft.start_date || null,
        start_time: draft.start_time || null,
        due_date: draft.due_date || null,
        due_time: draft.due_time || null,
        labels,
      });
      await load();
      onUpdated();
    } catch (e) {
      onError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const saveProgressWithNote = async () => {
    if (!task) return;
    setSaving(true);
    onError('');
    try {
      await tasksApi.update(task.id, { progress: Number(draft.progress), progress_note: progressNote.trim() || undefined });
      setProgressNote('');
      await load();
      onUpdated();
    } catch (e) {
      onError(e?.message || 'Could not save progress');
    } finally {
      setSaving(false);
    }
  };

  const addDailyTranscription = async () => {
    if (!task || !dailyText.trim()) return;
    setSaving(true);
    onError('');
    try {
      await tasksApi.addProgressUpdate(task.id, {
        entry_type: 'daily_transcription',
        note: dailyText.trim(),
        progress: Number(draft?.progress ?? task.progress ?? 0),
      });
      setDailyText('');
      await load();
      onUpdated();
    } catch (e) {
      onError(e?.message || 'Could not add transcription');
    } finally {
      setSaving(false);
    }
  };

  const postComment = async () => {
    if (!task || !commentBody.trim()) return;
    setSaving(true);
    onError('');
    try {
      const res = await tasksApi.addComment(task.id, { body: commentBody.trim(), visibility: commentVis });
      const cid = res.comment?.id;
      if (cid && commentFiles.length) {
        await tasksApi.addCommentAttachments(task.id, cid, commentFiles);
      }
      setCommentBody('');
      setCommentFiles([]);
      await load();
      onUpdated();
    } catch (e) {
      onError(e?.message || 'Could not post note');
    } finally {
      setSaving(false);
    }
  };

  const addReminder = async () => {
    if (!task || !remindAt) return;
    setSaving(true);
    onError('');
    try {
      const iso = new Date(remindAt).toISOString();
      await tasksApi.addReminder(task.id, {
        remind_at: iso,
        note: remindNote.trim() || undefined,
        recurrence: remindRecurrence,
      });
      setRemindNote('');
      await load();
      onUpdated();
    } catch (e) {
      onError(e?.message || 'Could not add reminder');
    } finally {
      setSaving(false);
    }
  };

  const dismissReminder = async (rid) => {
    if (!task) return;
    try {
      await tasksApi.dismissReminder(task.id, rid);
      await load();
      onUpdated();
    } catch (e) {
      onError(e?.message || 'Could not dismiss');
    }
  };

  const uploadTaskFiles = async (list) => {
    if (!task || !list?.length) return;
    setSaving(true);
    onError('');
    try {
      await tasksApi.uploadAttachments(task.id, list);
      await load();
      onUpdated();
    } catch (e) {
      onError(e?.message || 'Upload failed');
    } finally {
      setSaving(false);
    }
  };

  const assignMore = async (userIds) => {
    if (!task || !userIds?.length) return;
    setSaving(true);
    onError('');
    try {
      await tasksApi.assign(task.id, { user_ids: userIds });
      await load();
      onUpdated();
    } catch (e) {
      onError(e?.message || 'Assign failed');
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: 'details', label: 'Details' },
    { id: 'team', label: 'People' },
    { id: 'progress', label: 'Progress' },
    { id: 'notes', label: 'Notes' },
    { id: 'reminders', label: 'Reminders' },
    { id: 'files', label: 'Files' },
    { id: 'email', label: 'Email' },
  ];

  if (!task || !draft) {
    return (
      <div className="fixed inset-0 z-[190] flex justify-end">
        <button type="button" className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-label="Close" />
        <div className="relative h-full w-full max-w-xl bg-white shadow-2xl flex items-center justify-center text-surface-500">Loading…</div>
      </div>
    );
  }

  const isAssignee = (task.assignees || []).some((a) => a.user_id === currentUserId);
  const canProgress = isAssignee || task.created_by === currentUserId;

  return (
    <div className="fixed inset-0 z-[190] flex justify-end">
      <button type="button" className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]" onClick={onClose} aria-label="Close drawer" />
      <aside className="relative flex h-full w-full max-w-3xl flex-col border-l border-surface-200 bg-gradient-to-b from-white to-surface-50 shadow-2xl">
        <header className="shrink-0 border-b border-surface-200 px-5 py-4 flex items-start justify-between gap-3 bg-white/90">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-600">Task</p>
            <h2 className="text-lg font-bold text-surface-900 truncate">{task.title}</h2>
            <div className="mt-1 flex flex-wrap gap-2">
              <StatusBadge status={task.status} />
              <PriorityBadge priority={task.priority} />
              <span className="text-xs text-surface-500">{formatDateTime(task.updated_at)}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-lg border border-surface-200 px-3 py-1.5 text-sm font-medium text-surface-700 hover:bg-surface-100">
            Close
          </button>
        </header>

        <div className="shrink-0 flex gap-1 overflow-x-auto border-b border-surface-200 bg-white px-2 pt-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`shrink-0 rounded-t-lg px-3 py-2 text-xs font-semibold transition ${
                tab === t.id ? 'bg-brand-50 text-brand-800 border border-b-0 border-surface-200' : 'text-surface-600 hover:bg-surface-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-5">
          {tab === 'details' && (
            <div className="space-y-4 max-w-xl">
              <div>
                <label className="text-xs font-medium text-surface-600">Title</label>
                <input className={inputClass()} value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-surface-600">Description</label>
                <textarea
                  className={inputClass()}
                  rows={4}
                  value={draft.description}
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-surface-600">Status</label>
                  <select className={inputClass()} value={draft.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}>
                    {STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-surface-600">Priority</label>
                  <select className={inputClass()} value={draft.priority} onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value }))}>
                    {PRIORITY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-surface-600">Progress ({draft.progress}%)</label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={draft.progress}
                  onChange={(e) => setDraft((d) => ({ ...d, progress: e.target.value }))}
                  className="w-full accent-brand-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-surface-600">Start date</label>
                  <input type="date" className={inputClass()} value={draft.start_date} onChange={(e) => setDraft((d) => ({ ...d, start_date: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-surface-600">Start time</label>
                  <input type="time" className={inputClass()} value={draft.start_time} onChange={(e) => setDraft((d) => ({ ...d, start_time: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-surface-600">Due date</label>
                  <input type="date" className={inputClass()} value={draft.due_date} onChange={(e) => setDraft((d) => ({ ...d, due_date: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-surface-600">Due time</label>
                  <input type="time" className={inputClass()} value={draft.due_time} onChange={(e) => setDraft((d) => ({ ...d, due_time: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-surface-600">Labels (comma-separated)</label>
                <input className={inputClass()} value={draft.labelsStr} onChange={(e) => setDraft((d) => ({ ...d, labelsStr: e.target.value }))} />
              </div>
              <button type="button" disabled={saving} onClick={saveDetails} className={btnPrimary()}>
                {saving ? 'Saving…' : 'Save details'}
              </button>
            </div>
          )}

          {tab === 'team' && (
            <div className="space-y-4">
              <p className="text-sm text-surface-600">Assignees</p>
              <ul className="rounded-xl border border-surface-200 divide-y divide-surface-100 bg-white">
                {(task.assignees || []).map((a) => (
                  <li key={a.user_id} className="px-4 py-2 text-sm flex justify-between gap-2">
                    <span className="font-medium text-surface-900">{a.full_name || a.email}</span>
                    <span className="text-surface-500 text-xs">{a.email}</span>
                  </li>
                ))}
              </ul>
              <div>
                <label className="text-xs font-medium text-surface-600 mb-1 block">Add assignees</label>
                <select
                  className={inputClass()}
                  defaultValue=""
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) assignMore([v]);
                    e.target.value = '';
                  }}
                >
                  <option value="">Select user…</option>
                  {tenantUsers
                    .filter((u) => !(task.assignees || []).some((a) => a.user_id === u.id))
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name || u.email}
                      </option>
                    ))}
                </select>
              </div>
            </div>
          )}

          {tab === 'progress' && (
            <div className="space-y-6">
              {canProgress && (
                <div className="rounded-xl border border-surface-200 bg-white p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-surface-900">Log progress</h3>
                  <p className="text-xs text-surface-500">Saves progress and an optional note for the timeline.</p>
                  <textarea
                    className={inputClass()}
                    rows={2}
                    placeholder="What changed? (optional)"
                    value={progressNote}
                    onChange={(e) => setProgressNote(e.target.value)}
                  />
                  <button type="button" disabled={saving} onClick={saveProgressWithNote} className={btnPrimary()}>
                    Save progress & note
                  </button>
                </div>
              )}
              <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-amber-950">Daily progress transcription</h3>
                <p className="text-xs text-amber-900/80">End-of-day narrative. Visible on the timeline as a transcription entry.</p>
                <textarea className={inputClass()} rows={4} value={dailyText} onChange={(e) => setDailyText(e.target.value)} disabled={!canProgress} />
                <button type="button" disabled={saving || !canProgress || !dailyText.trim()} onClick={addDailyTranscription} className={btnPrimary()}>
                  Add transcription
                </button>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-surface-900 mb-2">Timeline</h3>
                <ul className="space-y-2 max-h-72 overflow-y-auto">
                  {(task.progress_updates || []).map((u) => (
                    <li key={u.id} className="rounded-lg border border-surface-100 bg-white px-3 py-2 text-sm">
                      <div className="flex justify-between gap-2 text-xs text-surface-500">
                        <span>{u.user_name || 'User'}</span>
                        <span>{formatDateTime(u.created_at)}</span>
                      </div>
                      <p className="text-[11px] font-semibold uppercase text-brand-700 mt-0.5">{u.entry_type === 'daily_transcription' ? 'Transcription' : 'Progress'}</p>
                      {u.progress != null && <p className="text-xs text-surface-600">Progress: {u.progress}%</p>}
                      {u.note && <p className="text-surface-800 whitespace-pre-wrap mt-1">{u.note}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {tab === 'notes' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-surface-200 bg-white p-4 space-y-3">
                <h3 className="text-sm font-semibold">New note</h3>
                <div className="flex gap-3 text-sm">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="nv" checked={commentVis === 'all'} onChange={() => setCommentVis('all')} />
                    Everyone on the task
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="nv" checked={commentVis === 'assignees'} onChange={() => setCommentVis('assignees')} />
                    Assignees only
                  </label>
                </div>
                <textarea className={inputClass()} rows={3} value={commentBody} onChange={(e) => setCommentBody(e.target.value)} placeholder="Note…" />
                <input type="file" multiple onChange={(e) => setCommentFiles(Array.from(e.target.files || []))} className="text-sm" />
                <button type="button" disabled={saving} onClick={postComment} className={btnPrimary()}>
                  Post note
                </button>
              </div>
              <ul className="space-y-3">
                {(task.comments || []).map((c) => (
                  <li key={c.id} className="rounded-xl border border-surface-200 bg-white p-3 text-sm">
                    <div className="flex justify-between text-xs text-surface-500">
                      <span className="font-medium text-surface-800">{c.user_name}</span>
                      <span>{formatDateTime(c.created_at)}</span>
                    </div>
                    <p className="text-[10px] uppercase text-surface-400 mt-0.5">{c.visibility === 'assignees' ? 'Assignees only' : 'Everyone'}</p>
                    <p className="text-surface-800 whitespace-pre-wrap mt-1">{c.body}</p>
                    {(c.attachments || []).length > 0 && (
                      <ul className="mt-2 text-xs text-brand-700 space-y-1">
                        {c.attachments.map((a) => (
                          <li key={a.id}>
                            <button
                              type="button"
                              className="underline"
                              onClick={() =>
                                downloadAttachmentWithAuth(tasksApi.commentAttachmentDownloadUrl(task.id, c.id, a.id), a.file_name).catch((err) =>
                                  onError(err?.message)
                                )
                              }
                            >
                              {a.file_name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {tab === 'reminders' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-surface-200 bg-white p-4 space-y-3">
                <h3 className="text-sm font-semibold">Schedule reminder</h3>
                <input type="datetime-local" className={inputClass()} value={remindAt} onChange={(e) => setRemindAt(e.target.value)} />
                <select className={inputClass()} value={remindRecurrence} onChange={(e) => setRemindRecurrence(e.target.value)}>
                  {REMINDER_RECURRENCE.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <input className={inputClass()} value={remindNote} onChange={(e) => setRemindNote(e.target.value)} placeholder="Reminder note (optional)" />
                <button type="button" disabled={saving || !remindAt} onClick={addReminder} className={btnPrimary()}>
                  Add reminder
                </button>
                <p className="text-xs text-surface-500">Hourly and daily reminders re-email assignees & creator until dismissed.</p>
              </div>
              <ul className="space-y-2">
                {(task.reminders || []).map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-surface-100 bg-white px-3 py-2 text-sm">
                    <div>
                      <span className="font-medium">{formatDateTime(r.remind_at)}</span>
                      <span className="text-xs text-surface-500 ml-2">({r.recurrence || 'none'})</span>
                      {r.note && <p className="text-xs text-surface-600">{r.note}</p>}
                    </div>
                    {!r.dismissed_at ? (
                      <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => dismissReminder(r.id)}>
                        Dismiss
                      </button>
                    ) : (
                      <span className="text-xs text-surface-400">Dismissed</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {tab === 'files' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-dashed border-surface-300 bg-surface-50 p-4">
                <label className="text-sm font-medium text-surface-800">Upload files</label>
                <input type="file" multiple className="mt-2 text-sm" onChange={(e) => uploadTaskFiles(Array.from(e.target.files || []))} />
              </div>
              <ul className="divide-y divide-surface-100 rounded-xl border border-surface-200 bg-white">
                {(task.attachments || []).map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                    <span className="font-medium text-surface-900 truncate">{a.file_name}</span>
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        className="text-xs text-brand-600 hover:underline"
                        onClick={() => openAttachmentWithAuth(tasksApi.attachmentDownloadUrl(task.id, a.id)).catch((err) => onError(err?.message))}
                      >
                        View
                      </button>
                      <button
                        type="button"
                        className="text-xs text-brand-600 hover:underline"
                        onClick={() =>
                          downloadAttachmentWithAuth(tasksApi.attachmentDownloadUrl(task.id, a.id), a.file_name).catch((err) => onError(err?.message))
                        }
                      >
                        Download
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {tab === 'email' && (
            <div className="rounded-xl border border-surface-200 bg-white p-4 space-y-3 text-sm text-surface-700">
              <h3 className="font-semibold text-surface-900">Email notifications</h3>
              <p className="text-xs text-surface-500">
                When SMTP is configured on the server, the app sends branded emails for the events below. Links open Tasks Tracker with the task
                pre-selected.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li>New assignee or transfer — assignment email with due date.</li>
                <li>Task completed — email to creator.</li>
                <li>New note — notify assignees & creator (respects assignee-only visibility).</li>
                <li>Attachments added — notify others on the task.</li>
                <li>Due reminders — one-off, hourly, or recurring daily/hourly per reminder.</li>
                <li>Overdue tasks — daily job emails assignees.</li>
                <li>Title, dates, priority, status, labels, description updates — summary email to people on the task.</li>
              </ul>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

export default function TasksTracker() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [navHidden, setNavHidden] = useSecondaryNavHidden('tasks-tracker-v2');

  const workspaceView = searchParams.get('view') === 'dashboard' ? 'dashboard' : 'list';
  const setWorkspaceView = (next) => {
    setSearchParams((prev) => {
      const n = new URLSearchParams(prev);
      if (next === 'dashboard') n.set('view', 'dashboard');
      else n.delete('view');
      return n;
    });
  };

  const [createDefaultAssignees, setCreateDefaultAssignees] = useState([]);
  const openCreateModal = (assigneeIds) => {
    setCreateDefaultAssignees(Array.isArray(assigneeIds) && assigneeIds.length ? assigneeIds : []);
    setCreateOpen(true);
  };

  const [tasks, setTasks] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [scope, setScope] = useState('my');
  const [filterUserId, setFilterUserId] = useState('');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [status, setStatus] = useState('all');
  const [priority, setPriority] = useState('all');
  const [label, setLabel] = useState('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [sort, setSort] = useState('due_date');
  const [sortDir, setSortDir] = useState('asc');
  const [showFilters, setShowFilters] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [tenantUsers, setTenantUsers] = useState([]);

  const openFromQuery = (searchParams.get('open') || '').trim();
  useEffect(() => {
    if (!openFromQuery) return;
    setSelectedId(openFromQuery);
  }, [openFromQuery]);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 320);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    tasksApi.tenantUsers().then((d) => setTenantUsers(d.users || [])).catch(() => setTenantUsers([]));
  }, []);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit,
        sort,
        sort_dir: sortDir,
      };
      if (scope === 'my') params.assigned_to_me = 'true';
      if (scope === 'user' && filterUserId) params.assignee_user_id = filterUserId;
      if (status !== 'all') params.status = status;
      if (priority !== 'all') params.priority = priority;
      if (label.trim()) params.label = label.trim();
      if (dueFrom) params.due_from = dueFrom;
      if (dueTo) params.due_to = dueTo;
      if (searchDebounced) params.search = searchDebounced;

      const data = await tasksApi.list(params);
      setTasks(data.tasks || []);
      setPagination((p) => ({ ...p, ...(data.pagination || {}), limit: p.limit }));
    } catch (e) {
      setError(e?.message || 'Failed to load tasks');
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, sort, sortDir, scope, filterUserId, status, priority, label, dueFrom, dueTo, searchDebounced]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const totalPages = useMemo(() => {
    const t = pagination.total || 0;
    const lim = pagination.limit || 25;
    return Math.max(1, Math.ceil(t / lim));
  }, [pagination.total, pagination.limit]);

  const toggleSort = (col) => {
    if (sort === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSort(col);
      setSortDir(col === 'due_date' ? 'asc' : 'desc');
    }
  };

  const clearFilters = () => {
    setStatus('all');
    setPriority('all');
    setLabel('');
    setDueFrom('');
    setDueTo('');
    setSearch('');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col -m-4 sm:-m-6 overflow-hidden bg-gradient-to-b from-slate-50 via-white to-slate-50/80">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside
          className={`shrink-0 border-r border-slate-200/80 bg-white/95 shadow-[1px_0_0_rgba(15,23,42,0.04)] flex flex-col transition-[width] duration-200 overflow-hidden ${
            navHidden ? 'w-0 border-0 shadow-none' : 'w-64 lg:w-72'
          }`}
        >
          <div className="p-4 border-b border-slate-100 flex items-start justify-between gap-2 w-64 lg:w-72 shrink-0 bg-slate-50/50">
            <div>
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">Tasks tracker</h2>
              <p className="text-xs text-slate-500 mt-0.5">Plan, assign, follow up</p>
            </div>
            <button type="button" onClick={() => setNavHidden(true)} className="text-surface-400 hover:text-surface-700" aria-label="Hide menu">
              «
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto p-3 space-y-1 w-64 lg:w-72 text-sm">
            <button type="button" onClick={() => openCreateModal()} className={`w-full ${btnPrimary()} justify-center`}>
              + New task
            </button>
            <div className="pt-4 text-[11px] font-semibold uppercase text-surface-400">Workspace</div>
            <button
              type="button"
              onClick={() => setWorkspaceView('list')}
              className={`w-full text-left rounded-lg px-3 py-2.5 font-medium transition ${
                workspaceView === 'list' ? 'bg-brand-50 text-brand-900 ring-1 ring-brand-200/80' : 'hover:bg-surface-50 text-surface-800'
              }`}
            >
              Task list
            </button>
            <button
              type="button"
              onClick={() => setWorkspaceView('dashboard')}
              className={`w-full text-left rounded-lg px-3 py-2.5 font-medium transition ${
                workspaceView === 'dashboard' ? 'bg-brand-50 text-brand-900 ring-1 ring-brand-200/80' : 'hover:bg-surface-50 text-surface-800'
              }`}
            >
              Tasks dashboard
            </button>
            {workspaceView === 'list' && (
              <button type="button" onClick={() => setShowFilters((x) => !x)} className="w-full text-left rounded-lg px-3 py-2 hover:bg-surface-50 text-surface-700">
                {showFilters ? 'Hide' : 'Show'} advanced filters
              </button>
            )}
          </nav>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {navHidden && (
            <button type="button" onClick={() => setNavHidden(false)} className="m-2 self-start text-sm text-brand-700 hover:underline">
              Show menu
            </button>
          )}

          {error && (
            <div className="shrink-0 mx-4 mt-2 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
              <span>{error}</span>
              <button type="button" className="font-medium underline" onClick={() => setError('')}>
                Dismiss
              </button>
            </div>
          )}

          {workspaceView === 'list' ? (
            <>
              <div className="shrink-0 border-b border-slate-200/80 bg-white/95 backdrop-blur-md px-4 py-4 sm:px-6 shadow-sm shadow-slate-200/40">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Tasks</h1>
                    <InfoHint
                      title="Tasks tracker"
                      text="Use scope to switch between your assignments and the full tenant task board. Filters apply to the table; row click opens the inspector. Open Tasks dashboard for a Kanban workload view. Email alerts fire from the server when SMTP is configured."
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex rounded-xl border border-slate-200/90 bg-slate-100/60 p-1 text-xs font-semibold shadow-inner shadow-white/50">
                      {[
                        { id: 'my', label: 'My tasks' },
                        { id: 'all', label: 'All tasks' },
                        { id: 'user', label: 'By user' },
                      ].map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setScope(s.id);
                            if (s.id !== 'user') setFilterUserId('');
                            setPagination((p) => ({ ...p, page: 1 }));
                          }}
                          className={`rounded-lg px-3.5 py-2 transition ${
                            scope === s.id
                              ? 'bg-white text-brand-800 shadow-sm ring-1 ring-slate-200/60'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                    {scope === 'user' && (
                      <select
                        className={`${inputClass()} max-w-[200px]`}
                        value={filterUserId}
                        onChange={(e) => {
                          setFilterUserId(e.target.value);
                          setPagination((p) => ({ ...p, page: 1 }));
                        }}
                      >
                        <option value="">Select user…</option>
                        {tenantUsers.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.full_name || u.email}
                          </option>
                        ))}
                      </select>
                    )}
                    <button type="button" onClick={() => openCreateModal()} className={btnPrimary()}>
                      New task
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <input
                    className={`${inputClass()} max-w-md flex-1 min-w-[180px]`}
                    placeholder="Search title or description…"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPagination((p) => ({ ...p, page: 1 }));
                    }}
                  />
                  <button type="button" className={btnSecondary()} onClick={loadTasks}>
                    Search
                  </button>
                  <button type="button" className={btnSecondary()} onClick={clearFilters}>
                    Clear filters
                  </button>
                </div>

                {showFilters && (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <label className="text-xs font-medium text-surface-500">Status</label>
                      <select className={inputClass()} value={status} onChange={(e) => { setStatus(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}>
                        <option value="all">All</option>
                        {STATUS_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-surface-500">Priority</label>
                      <select className={inputClass()} value={priority} onChange={(e) => { setPriority(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}>
                        <option value="all">All</option>
                        {PRIORITY_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-surface-500">Label contains</label>
                      <input className={inputClass()} value={label} onChange={(e) => { setLabel(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }} placeholder="e.g. legal" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-medium text-surface-500">Due from</label>
                        <input type="date" className={inputClass()} value={dueFrom} onChange={(e) => { setDueFrom(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }} />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-surface-500">Due to</label>
                        <input type="date" className={inputClass()} value={dueTo} onChange={(e) => { setDueTo(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
                <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-md shadow-slate-200/30 ring-1 ring-slate-950/[0.03]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1024px] text-left text-sm table-fixed">
                  <colgroup>
                    <col style={{ width: '3rem' }} />
                    <col style={{ width: '50%', minWidth: '22rem' }} />
                    <col style={{ width: '7.5rem' }} />
                    <col style={{ width: '5.5rem' }} />
                    <col style={{ width: '4.25rem' }} />
                    <col style={{ width: '7.25rem' }} />
                    <col style={{ width: '7.25rem' }} />
                    <col style={{ width: '14%' }} />
                    <col style={{ width: '11%' }} />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/90 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      <th className="px-3 py-3.5 text-center font-medium" scope="col" aria-label="Done" />
                      <th
                        className="px-4 py-3.5 text-left font-medium text-slate-600 cursor-pointer select-none hover:text-brand-700 hover:bg-slate-100/80 transition-colors"
                        scope="col"
                        onClick={() => toggleSort('title')}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          Title
                          {sort === 'title' && <span className="text-brand-600 tabular-nums">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                        </span>
                      </th>
                      <th className="px-3 py-3.5 font-medium text-slate-600" scope="col">
                        Status
                      </th>
                      <th
                        className="px-3 py-3.5 font-medium text-slate-600 cursor-pointer select-none hover:text-brand-700 hover:bg-slate-100/80 transition-colors"
                        scope="col"
                        onClick={() => toggleSort('priority')}
                      >
                        <span className="inline-flex items-center gap-1">
                          Pri
                          {sort === 'priority' && <span className="text-brand-600">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                        </span>
                      </th>
                      <th
                        className="px-3 py-3.5 text-right font-medium text-slate-600 cursor-pointer select-none hover:text-brand-700 hover:bg-slate-100/80 transition-colors"
                        scope="col"
                        onClick={() => toggleSort('progress')}
                      >
                        <span className="inline-flex items-center justify-end gap-1 w-full">
                          %
                          {sort === 'progress' && <span className="text-brand-600">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                        </span>
                      </th>
                      <th
                        className="px-3 py-3.5 font-medium text-slate-600 whitespace-nowrap cursor-pointer select-none hover:text-brand-700 hover:bg-slate-100/80 transition-colors"
                        scope="col"
                        onClick={() => toggleSort('start_date')}
                      >
                        <span className="inline-flex items-center gap-1">
                          Start
                          {sort === 'start_date' && <span className="text-brand-600">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                        </span>
                      </th>
                      <th
                        className="px-3 py-3.5 font-medium text-slate-600 whitespace-nowrap cursor-pointer select-none hover:text-brand-700 hover:bg-slate-100/80 transition-colors"
                        scope="col"
                        onClick={() => toggleSort('due_date')}
                      >
                        <span className="inline-flex items-center gap-1">
                          Due
                          {sort === 'due_date' && <span className="text-brand-600">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                        </span>
                      </th>
                      <th className="px-3 py-3.5 font-medium text-slate-600" scope="col">
                        Assignees
                      </th>
                      <th className="px-3 py-3.5 font-medium text-slate-600" scope="col">
                        Labels
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-10 text-center text-surface-500">
                          Loading…
                        </td>
                      </tr>
                    ) : tasks.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-10 text-center text-surface-500">
                          No tasks match your filters.
                        </td>
                      </tr>
                    ) : (
                      tasks.map((t) => (
                        <tr
                          key={t.id}
                          onClick={() => {
                            setSelectedId(t.id);
                            setSearchParams((prev) => {
                              const next = new URLSearchParams(prev);
                              next.set('open', t.id);
                              return next;
                            });
                          }}
                          className={`cursor-pointer transition-colors ${
                            selectedId === t.id
                              ? 'bg-brand-50/70 ring-1 ring-inset ring-brand-200/80'
                              : 'hover:bg-slate-50/90'
                          }`}
                        >
                          <td className="px-2 py-3 text-center align-middle">
                            <span
                              className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                                t.status === 'completed'
                                  ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200/80'
                                  : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200/80'
                              }`}
                              aria-hidden
                            >
                              {t.status === 'completed' ? '✓' : '○'}
                            </span>
                          </td>
                          <td className="px-4 py-3 align-middle min-w-0">
                            <span className="block text-[15px] font-semibold leading-snug text-slate-900 line-clamp-3 break-words">
                              {t.title}
                            </span>
                          </td>
                          <td className="px-3 py-3 align-middle">
                            <StatusBadge status={t.status} />
                          </td>
                          <td className="px-3 py-3 align-middle">
                            <PriorityBadge priority={t.priority} />
                          </td>
                          <td className="px-3 py-3 align-middle text-right tabular-nums text-slate-700 font-medium">{t.progress ?? 0}%</td>
                          <td className="px-3 py-3 align-middle text-xs text-slate-600 whitespace-nowrap tabular-nums">
                            {formatDate(t.start_date)} {formatTimeShort(t.start_time)}
                          </td>
                          <td className="px-3 py-3 align-middle text-xs text-slate-600 whitespace-nowrap tabular-nums">
                            {formatDate(t.due_date)} {formatTimeShort(t.due_time)}
                          </td>
                          <td className="px-3 py-3 align-middle text-xs text-slate-600 min-w-0">
                            <span className="line-clamp-2 break-words">{(t.assignees || []).map((a) => a.full_name).join(', ') || '—'}</span>
                          </td>
                          <td className="px-3 py-3 align-middle text-xs text-slate-500 min-w-0">
                            <span className="line-clamp-2 break-words">{(t.labels || []).join(', ') || '—'}</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/40 px-4 py-3 text-sm text-slate-600">
                <span>
                  Page {pagination.page || 1} of {totalPages} · {pagination.total ?? 0} tasks
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={btnSecondary()}
                    disabled={(pagination.page || 1) <= 1}
                    onClick={() => setPagination((p) => ({ ...p, page: Math.max(1, (p.page || 1) - 1) }))}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className={btnSecondary()}
                    disabled={(pagination.page || 1) >= totalPages}
                    onClick={() => setPagination((p) => ({ ...p, page: (p.page || 1) + 1 }))}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
              </div>
            </>
          ) : (
            <TasksDashboardBoard
              tenantUsers={tenantUsers}
              onSelectTask={(id) => {
                setSelectedId(id);
                setSearchParams((prev) => {
                  const next = new URLSearchParams(prev);
                  next.set('open', id);
                  return next;
                });
              }}
              onRefreshList={loadTasks}
              onOpenCreate={(assigneeIds) => openCreateModal(assigneeIds)}
              onError={setError}
            />
          )}
        </main>
      </div>

      <CreateTaskModal
        open={createOpen}
        tenantUsers={tenantUsers}
        defaultAssigneeIds={createDefaultAssignees}
        onClose={() => {
          setCreateOpen(false);
          setCreateDefaultAssignees([]);
        }}
        onCreated={(id) => {
          setCreateOpen(false);
          setCreateDefaultAssignees([]);
          if (id) {
            setSelectedId(id);
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              next.set('open', id);
              return next;
            });
          }
          loadTasks();
        }}
        onError={setError}
      />

      {selectedId && (
        <TaskDetailDrawer
          taskId={selectedId}
          onClose={() => {
            setSelectedId(null);
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              next.delete('open');
              return next;
            });
          }}
          currentUserId={user?.id}
          tenantUsers={tenantUsers}
          onUpdated={loadTasks}
          onError={setError}
        />
      )}
    </div>
  );
}
