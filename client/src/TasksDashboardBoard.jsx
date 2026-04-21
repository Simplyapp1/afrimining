import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { tasks as tasksApi } from './api';

/** Combine SQL date + optional time into a timestamp for urgency math. */
function taskDueTimestamp(task) {
  if (!task?.due_date) return null;
  const d = new Date(task.due_date);
  if (Number.isNaN(d.getTime())) return null;
  const t = task.due_time != null ? String(task.due_time).trim() : '';
  if (t && t.length >= 4) {
    const m = t.match(/^(\d{1,2}):(\d{2})/);
    if (m) d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  }
  return d.getTime();
}

/**
 * Visual lane for cards: progress + due window drive accent (nearly done = warm).
 * Returns tailwind class fragments for left border + progress text.
 */
export function getTaskWorkloadLane(task) {
  const status = task?.status || 'not_started';
  if (status === 'completed' || status === 'cancelled') {
    return {
      key: 'done',
      stripe: 'border-l-4 border-slate-300',
      progressText: 'text-slate-500',
      label: 'Closed',
    };
  }
  const progress = Math.min(100, Math.max(0, Number(task.progress) || 0));
  const dueTs = taskDueTimestamp(task);
  const now = Date.now();
  const hrsToDue = dueTs != null ? (dueTs - now) / 3600000 : null;
  const overdue = hrsToDue != null && hrsToDue < 0;
  const dueSoon = hrsToDue != null && hrsToDue >= 0 && hrsToDue <= 72;
  const nearlyByProgress = progress >= 88;
  const nearlyByDue = dueSoon && (progress >= 55 || hrsToDue <= 48);

  if (overdue) {
    return {
      key: 'overdue',
      stripe: 'border-l-4 border-rose-600',
      progressText: 'text-rose-600',
      label: 'Overdue',
    };
  }
  if (nearlyByProgress || nearlyByDue) {
    return {
      key: 'nearly',
      stripe: 'border-l-4 border-orange-500',
      progressText: 'text-orange-600',
      label: 'Finishing',
    };
  }
  if (progress >= 70 || (hrsToDue != null && hrsToDue <= 168 && hrsToDue > 72)) {
    return {
      key: 'advancing',
      stripe: 'border-l-4 border-amber-500',
      progressText: 'text-amber-600',
      label: 'Advancing',
    };
  }
  if (status === 'in_progress') {
    return {
      key: 'active',
      stripe: 'border-l-4 border-teal-500',
      progressText: 'text-teal-600',
      label: 'In motion',
    };
  }
  return {
    key: 'planned',
    stripe: 'border-l-4 border-sky-600',
    progressText: 'text-sky-700',
    label: 'Queued',
  };
}

function taskRefCode(task) {
  const id = String(task?.id || '').replace(/-/g, '');
  return id.slice(0, 8).toUpperCase() || '—';
}

function taskSubtitle(task) {
  const labels = task?.labels || [];
  if (labels[0]) return String(labels[0]);
  const p = task?.priority || 'medium';
  return p.charAt(0).toUpperCase() + p.slice(1);
}

/** Badge: days until due (≤14) or overdue magnitude */
function dueBadge(task) {
  if (task?.status === 'completed' || task?.status === 'cancelled') return null;
  const dueTs = taskDueTimestamp(task);
  if (dueTs == null) return null;
  const days = Math.ceil((dueTs - Date.now()) / 86400000);
  if (days < 0) return { text: String(Math.abs(days)), title: `${Math.abs(days)}d overdue`, urgent: true };
  if (days <= 14) return { text: String(days), title: days === 0 ? 'Due today' : `Due in ${days}d`, urgent: days <= 3 };
  return null;
}

function IconRefresh({ className }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 21h5v-5" />
    </svg>
  );
}

function IconChart({ className }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 3v18h18" />
      <path d="M7 16v-4" />
      <path d="M12 16V8" />
      <path d="M17 16v-9" />
    </svg>
  );
}

function IconExpand({ className }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M15 3h6v6" />
      <path d="M9 21H3v-6" />
      <path d="M21 3l-7 7" />
      <path d="M3 21l7-7" />
    </svg>
  );
}

function IconPlus({ className }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconGear({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

const UNASSIGNED_ID = '__unassigned__';

export default function TasksDashboardBoard({
  tenantUsers,
  onSelectTask,
  onRefreshList,
  onOpenCreate,
  onError,
}) {
  const boardRootRef = useRef(null);
  const [rawTasks, setRawTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalFromApi, setTotalFromApi] = useState(0);
  const [workloadScope, setWorkloadScope] = useState('active');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [dueHorizon, setDueHorizon] = useState('any');
  const [search, setSearch] = useState('');
  const [showLegend, setShowLegend] = useState(false);
  const [dragOverUserId, setDragOverUserId] = useState(null);
  const [transferring, setTransferring] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page: 1,
        limit: 100,
        sort: 'due_date',
        sort_dir: 'asc',
      };
      if (priorityFilter !== 'all') params.priority = priorityFilter;
      const q = search.trim();
      if (q) params.search = q;
      const data = await tasksApi.list(params);
      setRawTasks(data.tasks || []);
      setTotalFromApi(data.pagination?.total ?? 0);
    } catch (e) {
      onError?.(e?.message || 'Failed to load board');
      setRawTasks([]);
    } finally {
      setLoading(false);
    }
  }, [priorityFilter, search, onError]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredTasks = useMemo(() => {
    let list = rawTasks;
    if (workloadScope === 'active') {
      list = list.filter((t) => t.status !== 'completed' && t.status !== 'cancelled');
    }
    const now = Date.now();
    if (dueHorizon === 'overdue') {
      list = list.filter((t) => {
        const ts = taskDueTimestamp(t);
        return ts != null && ts < now && t.status !== 'completed' && t.status !== 'cancelled';
      });
    } else if (dueHorizon === 'week') {
      const week = now + 7 * 86400000;
      list = list.filter((t) => {
        const ts = taskDueTimestamp(t);
        return ts != null && ts <= week && ts >= now - 86400000;
      });
    }
    return list;
  }, [rawTasks, workloadScope, dueHorizon]);

  const columns = useMemo(() => {
    const users = [...(tenantUsers || [])].sort((a, b) => String(a.full_name || a.email).localeCompare(String(b.full_name || b.email)));
    const byUser = {};
    for (const u of users) {
      byUser[u.id] = [];
    }
    byUser[UNASSIGNED_ID] = [];
    for (const task of filteredTasks) {
      const assignees = task.assignees || [];
      if (!assignees.length) {
        byUser[UNASSIGNED_ID].push({ task, columnUserId: null });
      } else {
        for (const a of assignees) {
          const uid = a.user_id;
          if (!byUser[uid]) byUser[uid] = [];
          byUser[uid].push({ task, columnUserId: uid });
        }
      }
    }
    return { users, byUser };
  }, [tenantUsers, filteredTasks]);

  const handleDrop = async (e, targetUserId) => {
    e.preventDefault();
    setDragOverUserId(null);
    let payload;
    try {
      payload = JSON.parse(e.dataTransfer.getData('application/json') || '{}');
    } catch {
      return;
    }
    const { taskId, columnUserId } = payload;
    if (!taskId) return;
    if (targetUserId === columnUserId) return;
    setTransferring(true);
    onError?.('');
    try {
      if (columnUserId == null) {
        if (!targetUserId || targetUserId === UNASSIGNED_ID) return;
        await tasksApi.assign(taskId, { user_ids: [targetUserId] });
      } else {
        if (!targetUserId || targetUserId === UNASSIGNED_ID) {
          onError?.('Move to Unassigned: open the task and remove assignees in the drawer.');
          return;
        }
        await tasksApi.assign(taskId, { transfer_from_user_id: columnUserId, transfer_to_user_id: targetUserId });
      }
      await load();
      onRefreshList?.();
    } catch (err) {
      onError?.(err?.message || 'Could not move task');
    } finally {
      setTransferring(false);
    }
  };

  const toggleFs = () => {
    const el = boardRootRef.current;
    if (!el) return;
    if (!document.fullscreenElement) el.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  };

  const truncated = totalFromApi > 100;

  return (
    <div ref={boardRootRef} className="flex min-h-0 flex-1 flex-col bg-slate-100/90">
      <header className="shrink-0 border-b border-slate-200/90 bg-white px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <h2 className="text-lg font-bold tracking-tight text-slate-900">Tasks dashboard</h2>
            <p className="text-xs text-slate-500 max-w-3xl leading-relaxed">
              Workload board — assignee columns, live progress signals, and drag-to-transfer. Polished for stakeholder updates and blog-ready
              screenshots; filters mirror your task list semantics.
            </p>
          </div>
          <div className="flex items-center gap-1 text-slate-500">
            <button
              type="button"
              title="Refresh"
              onClick={() => {
                load();
                onRefreshList?.();
              }}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 disabled:opacity-50"
              disabled={loading || transferring}
            >
              <IconRefresh className="block" />
            </button>
            <button
              type="button"
              title={showLegend ? 'Hide signal legend' : 'Signal legend'}
              onClick={() => setShowLegend((v) => !v)}
              className={`p-2 rounded-lg hover:bg-slate-100 ${showLegend ? 'text-brand-700 bg-brand-50' : 'text-slate-600'}`}
            >
              <IconChart className="block" />
            </button>
            <button type="button" title="Fullscreen board" onClick={toggleFs} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600">
              <IconExpand className="block" />
            </button>
            <button
              type="button"
              title="New task"
              onClick={() => onOpenCreate?.()}
              className="p-2 rounded-lg hover:bg-slate-100 text-brand-700"
            >
              <IconPlus className="block" />
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={workloadScope}
            onChange={(e) => setWorkloadScope(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 shadow-sm"
          >
            <option value="active">Active workload</option>
            <option value="all">All statuses</option>
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 shadow-sm"
          >
            <option value="all">All priorities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
          <select
            value={dueHorizon}
            onChange={(e) => setDueHorizon(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 shadow-sm"
          >
            <option value="any">Any due window</option>
            <option value="week">Due this week</option>
            <option value="overdue">Overdue</option>
          </select>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter title / description…"
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs min-w-[160px] flex-1 max-w-xs shadow-sm"
          />
          <button
            type="button"
            onClick={() => load()}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
          >
            Apply
          </button>
        </div>

        {truncated && (
          <p className="mt-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-md px-2 py-1.5 inline-block">
            Board loads up to <strong>100</strong> tasks by due date ({totalFromApi} match in tenant). Narrow filters or use <strong>Task list</strong> for
            full pagination.
          </p>
        )}

        {showLegend && (
          <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-2 text-[11px] text-slate-600 border border-slate-100 rounded-xl bg-slate-50/80 p-3">
            <div>
              <span className="inline-block w-1 h-3 rounded bg-sky-600 mr-1.5 align-middle" />
              <strong className="text-slate-800">Queued</strong> — not started; cool lane.
            </div>
            <div>
              <span className="inline-block w-1 h-3 rounded bg-teal-500 mr-1.5 align-middle" />
              <strong className="text-slate-800">In motion</strong> — in progress, healthy runway.
            </div>
            <div>
              <span className="inline-block w-1 h-3 rounded bg-amber-500 mr-1.5 align-middle" />
              <strong className="text-slate-800">Advancing</strong> — at least 70% or due within a week.
            </div>
            <div>
              <span className="inline-block w-1 h-3 rounded bg-orange-500 mr-1.5 align-middle" />
              <strong className="text-slate-800">Finishing</strong> — nearly done: high progress or due within 48–72h.
            </div>
            <div>
              <span className="inline-block w-1 h-3 rounded bg-rose-600 mr-1.5 align-middle" />
              <strong className="text-slate-800">Overdue</strong> — past due (open tasks).
            </div>
            <div>
              <span className="inline-block w-1 h-3 rounded bg-slate-300 mr-1.5 align-middle" />
              <strong className="text-slate-800">Closed</strong> — completed / cancelled.
            </div>
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden p-3 sm:p-4">
        {loading ? (
          <div className="flex h-64 items-center justify-center text-sm text-slate-500">Loading workload…</div>
        ) : (
          <div className="flex h-full gap-3 min-w-min pb-1">
            {columns.users.map((u) => (
              <KanbanColumn
                key={u.id}
                user={u}
                entries={columns.byUser[u.id] || []}
                dragOverUserId={dragOverUserId}
                setDragOverUserId={setDragOverUserId}
                onDrop={handleDrop}
                onSelectTask={onSelectTask}
                onOpenCreate={() => onOpenCreate?.([u.id])}
                transferring={transferring}
              />
            ))}
            <KanbanColumn
              key={UNASSIGNED_ID}
              user={{ id: UNASSIGNED_ID, full_name: 'Queue (unassigned)', email: 'No assignee yet' }}
              entries={columns.byUser[UNASSIGNED_ID] || []}
              dragOverUserId={dragOverUserId}
              setDragOverUserId={setDragOverUserId}
              onSelectTask={onSelectTask}
              onOpenCreate={() => onOpenCreate?.([])}
              transferring={transferring}
              isUnassigned
            />
          </div>
        )}
      </div>
    </div>
  );
}

function KanbanColumn({
  user,
  entries,
  dragOverUserId,
  setDragOverUserId,
  onDrop,
  onSelectTask,
  onOpenCreate,
  transferring,
  isUnassigned,
}) {
  const dropHandler = onDrop || (() => {});
  const uid = user.id;
  const count = entries.length;
  const dropActive = dragOverUserId === uid && !isUnassigned;

  return (
    <div
      className={`flex w-[280px] shrink-0 flex-col rounded-2xl border bg-white/95 shadow-sm min-h-0 max-h-full transition-shadow ${
        dropActive ? 'border-brand-400 ring-2 ring-brand-200/60 shadow-md' : 'border-slate-200/90'
      }`}
      onDragOver={(e) => {
        if (isUnassigned) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverUserId(uid);
      }}
      onDragLeave={() => setDragOverUserId((cur) => (cur === uid ? null : cur))}
      onDrop={(e) => !isUnassigned && dropHandler(e, uid)}
    >
      <div className="shrink-0 rounded-t-2xl border-b border-slate-100 bg-white px-3 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-slate-900 leading-snug truncate" title={user.full_name || user.email}>
              {user.full_name || user.email || 'Member'}
            </p>
            <p className="text-[11px] text-slate-500 truncate mt-0.5" title={user.email}>
              {user.email || '—'}
            </p>
          </div>
          <span className="shrink-0 tabular-nums text-xs font-semibold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">{count}</span>
        </div>
        <div className="mt-2 flex justify-end gap-1">
          <button
            type="button"
            title="New task for this assignee"
            onClick={onOpenCreate}
            disabled={transferring}
            className="p-1 rounded-md text-slate-400 hover:text-brand-700 hover:bg-slate-50 disabled:opacity-30"
          >
            <IconPlus className="block" />
          </button>
          <span className="p-1 text-slate-200 select-none" title="Column preferences — use task drawer">
            <IconGear className="block text-slate-300" />
          </span>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto rounded-b-2xl bg-slate-100/85 p-2 space-y-2.5">
        {!entries.length && (
          <p className="text-[11px] text-center text-slate-400 py-6 px-2">{isUnassigned ? 'No unassigned tasks.' : 'No tasks in this lane.'}</p>
        )}
        {entries.map(({ task, columnUserId }) => (
          <TaskCard
            key={`${task.id}-${columnUserId ?? 'u'}`}
            task={task}
            columnUserId={columnUserId}
            onSelect={() => onSelectTask(task.id)}
            disabled={transferring}
          />
        ))}
      </div>
    </div>
  );
}

function TaskCard({ task, columnUserId, onSelect, disabled }) {
  const lane = getTaskWorkloadLane(task);
  const badge = dueBadge(task);

  return (
    <article
      draggable={!disabled}
      onDragStart={(e) => {
        e.dataTransfer.setData('application/json', JSON.stringify({ taskId: task.id, columnUserId }));
        e.dataTransfer.effectAllowed = 'move';
      }}
      className={`group relative rounded-xl border border-slate-200/90 bg-white shadow-sm hover:shadow-md transition-shadow ${lane.stripe} ${
        disabled ? 'opacity-60' : 'cursor-grab active:cursor-grabbing'
      }`}
    >
      <button type="button" onClick={onSelect} className="block w-full text-left p-3 pr-10 pt-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[12px] font-bold text-slate-900 tracking-tight font-mono">{taskRefCode(task)}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{taskSubtitle(task)}</p>
          </div>
          {badge && (
            <span
              title={badge.title}
              className={`shrink-0 flex h-6 min-w-[1.5rem] items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white ${
                badge.urgent ? 'bg-rose-600' : 'bg-slate-500'
              }`}
            >
              {badge.text}
            </span>
          )}
        </div>
        <p className="mt-2 text-[12px] font-semibold text-slate-800 leading-snug line-clamp-2">{task.title}</p>
        <p className={`mt-2 text-[11px] font-semibold tabular-nums ${lane.progressText}`}>Progress: {task.progress ?? 0}%</p>
      </button>
      <button
        type="button"
        title="Open task"
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        className="absolute bottom-2 right-2 p-1 rounded-md text-slate-300 hover:text-slate-600 hover:bg-slate-50"
      >
        <IconGear className="block" />
      </button>
    </article>
  );
}
