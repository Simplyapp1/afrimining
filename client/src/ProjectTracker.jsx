import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { projectTracker as pt, tasks as tasksApi, downloadAttachmentWithAuth, openAttachmentWithAuth } from './api';
import { useSecondaryNavHidden } from './lib/useSecondaryNavHidden.js';
import InfoHint from './components/InfoHint.jsx';

const MAIN_TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'registration', label: 'Project registration' },
  { id: 'implementation', label: 'Project implementation' },
];

const PROJECT_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'registered', label: 'Registered' },
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const PHASE_STATUSES = [
  { value: 'planned', label: 'Planned' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'blocked', label: 'Blocked' },
];

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, { dateStyle: 'short' });
}

function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

function inputClass() {
  return 'w-full rounded-lg border border-surface-300 bg-white dark:bg-surface-900 px-3 py-2 text-sm text-surface-900 dark:text-surface-100';
}

function btnPrimary() {
  return 'inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50';
}

function btnSecondary() {
  return 'inline-flex items-center justify-center rounded-lg border border-surface-300 bg-white px-4 py-2 text-sm font-medium text-surface-800 hover:bg-surface-50';
}

export default function ProjectTracker() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab');
  const [mainTab, setMainTab] = useState(() =>
    MAIN_TABS.some((t) => t.id === tabFromUrl) ? tabFromUrl : 'dashboard'
  );
  const [navHidden, setNavHidden] = useSecondaryNavHidden('project-tracker');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [dash, setDash] = useState(null);
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [tenantUsers, setTenantUsers] = useState([]);

  const [implProjectId, setImplProjectId] = useState(null);
  const [implDetail, setImplDetail] = useState(null);
  const [implPhaseId, setImplPhaseId] = useState(null);
  const [logs, setLogs] = useState([]);
  const [finance, setFinance] = useState([]);
  const [notes, setNotes] = useState([]);
  const [attachments, setAttachments] = useState([]);

  const [logForm, setLogForm] = useState({ work_transcript: '', progress_percent: 0, finances_note: '' });
  const [finForm, setFinForm] = useState({ entry_type: 'expense', label: '', amount: '', entry_date: '', notes: '', phase_id: '' });
  const [noteBody, setNoteBody] = useState('');
  const [uploadPhaseId, setUploadPhaseId] = useState('');

  const [projForm, setProjForm] = useState({
    title: '',
    code: '',
    description: '',
    sponsor: '',
    site_location: '',
    planned_start_date: '',
    planned_end_date: '',
    overall_budget: '',
    status: 'draft',
    owner_user_id: '',
  });

  const [phaseForm, setPhaseForm] = useState({
    name: '',
    description: '',
    actions_required: '',
    budget_allocated: '',
    requirements_summary: '',
    status: 'planned',
    planned_start: '',
    planned_end: '',
    sort_order: 0,
  });

  const [memberForm, setMemberForm] = useState({ phaseId: '', user_id: '', role_title: '', requirements_notes: '' });

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t && MAIN_TABS.some((x) => x.id === t)) setMainTab(t);
  }, [searchParams]);

  const setTab = (id) => {
    setMainTab(id);
    setSearchParams(id === 'dashboard' ? {} : { tab: id }, { replace: true });
  };

  const refreshDashboard = useCallback(async () => {
    const d = await pt.dashboard();
    setDash(d);
  }, []);

  const refreshProjects = useCallback(async () => {
    const d = await pt.listProjects();
    setProjects(d.projects || []);
  }, []);

  const loadDetail = useCallback(async (id) => {
    if (!id) {
      setDetail(null);
      return;
    }
    const d = await pt.getProject(id);
    setDetail(d);
  }, []);

  const loadImplementationData = useCallback(async (projectId, phaseId) => {
    if (!projectId) return;
    const [l, f, n, a] = await Promise.all([
      phaseId ? pt.listLogs(phaseId) : Promise.resolve({ logs: [] }),
      pt.listFinance(projectId),
      pt.listNotes(projectId),
      pt.listAttachments(projectId),
    ]);
    setLogs(l.logs || []);
    setFinance(f.lines || []);
    setNotes(n.notes || []);
    setAttachments(a.attachments || []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const u = await tasksApi.tenantUsers();
        if (!cancelled) setTenantUsers(u.users || []);
        await refreshDashboard();
        await refreshProjects();
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshDashboard, refreshProjects]);

  useEffect(() => {
    if (selectedProjectId) loadDetail(selectedProjectId);
    else setDetail(null);
  }, [selectedProjectId, loadDetail]);

  useEffect(() => {
    if (!implProjectId || mainTab !== 'implementation') {
      if (!implProjectId) setImplDetail(null);
      return;
    }
    let cancelled = false;
    pt.getProject(implProjectId)
      .then((d) => {
        if (!cancelled) setImplDetail(d);
      })
      .catch(() => {
        if (!cancelled) setImplDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [implProjectId, mainTab]);

  useEffect(() => {
    if (implProjectId && implPhaseId) loadImplementationData(implProjectId, implPhaseId);
    else if (implProjectId) loadImplementationData(implProjectId, null);
  }, [implProjectId, implPhaseId, loadImplementationData]);

  const onCreateProject = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await pt.createProject({
        title: projForm.title.trim(),
        code: projForm.code.trim() || undefined,
        description: projForm.description.trim() || undefined,
        sponsor: projForm.sponsor.trim() || undefined,
        site_location: projForm.site_location.trim() || undefined,
        planned_start_date: projForm.planned_start_date || undefined,
        planned_end_date: projForm.planned_end_date || undefined,
        overall_budget: projForm.overall_budget ? Number(projForm.overall_budget) : undefined,
        status: projForm.status,
        owner_user_id: projForm.owner_user_id || undefined,
      });
      setProjForm({
        title: '',
        code: '',
        description: '',
        sponsor: '',
        site_location: '',
        planned_start_date: '',
        planned_end_date: '',
        overall_budget: '',
        status: 'draft',
        owner_user_id: '',
      });
      await refreshProjects();
      await refreshDashboard();
    } catch (err) {
      setError(err?.message || 'Could not create project');
    }
  };

  const onSaveProject = async () => {
    if (!detail?.project?.id) return;
    setError('');
    try {
      await pt.updateProject(detail.project.id, {
        title: detail.project.title,
        code: detail.project.code,
        description: detail.project.description,
        sponsor: detail.project.sponsor,
        site_location: detail.project.site_location,
        planned_start_date: detail.project.planned_start_date,
        planned_end_date: detail.project.planned_end_date,
        actual_start_date: detail.project.actual_start_date,
        actual_end_date: detail.project.actual_end_date,
        overall_budget: detail.project.overall_budget,
        status: detail.project.status,
        owner_user_id: detail.project.owner_user_id,
      });
      await refreshProjects();
      await refreshDashboard();
      await loadDetail(detail.project.id);
    } catch (err) {
      setError(err?.message || 'Save failed');
    }
  };

  const onAddPhase = async (e) => {
    e.preventDefault();
    if (!selectedProjectId) return;
    setError('');
    try {
      await pt.createPhase(selectedProjectId, {
        name: phaseForm.name.trim(),
        description: phaseForm.description.trim() || undefined,
        actions_required: phaseForm.actions_required.trim() || undefined,
        budget_allocated: phaseForm.budget_allocated ? Number(phaseForm.budget_allocated) : undefined,
        requirements_summary: phaseForm.requirements_summary.trim() || undefined,
        status: phaseForm.status,
        planned_start: phaseForm.planned_start || undefined,
        planned_end: phaseForm.planned_end || undefined,
        sort_order: phaseForm.sort_order,
      });
      setPhaseForm({
        name: '',
        description: '',
        actions_required: '',
        budget_allocated: '',
        requirements_summary: '',
        status: 'planned',
        planned_start: '',
        planned_end: '',
        sort_order: 0,
      });
      await loadDetail(selectedProjectId);
      await refreshDashboard();
    } catch (err) {
      setError(err?.message || 'Could not add phase');
    }
  };

  const onAddMember = async (e) => {
    e.preventDefault();
    if (!memberForm.phaseId || !memberForm.user_id || !memberForm.role_title.trim()) {
      setError('Pick phase, user, and role title');
      return;
    }
    setError('');
    try {
      await pt.addPhaseMember(memberForm.phaseId, {
        user_id: memberForm.user_id,
        role_title: memberForm.role_title.trim(),
        requirements_notes: memberForm.requirements_notes.trim() || undefined,
      });
      setMemberForm({ phaseId: '', user_id: '', role_title: '', requirements_notes: '' });
      await loadDetail(selectedProjectId);
    } catch (err) {
      setError(err?.message || 'Could not add member');
    }
  };

  const onSubmitLog = async (e) => {
    e.preventDefault();
    if (!implPhaseId) return;
    setError('');
    try {
      await pt.addLog(implPhaseId, {
        work_transcript: logForm.work_transcript.trim() || undefined,
        progress_percent: Number(logForm.progress_percent) || 0,
        finances_note: logForm.finances_note.trim() || undefined,
      });
      setLogForm({ work_transcript: '', progress_percent: 0, finances_note: '' });
      await loadImplementationData(implProjectId, implPhaseId);
      await refreshDashboard();
    } catch (err) {
      setError(err?.message || 'Could not save log');
    }
  };

  const onAddFinance = async (e) => {
    e.preventDefault();
    if (!implProjectId) return;
    setError('');
    try {
      await pt.addFinance(implProjectId, {
        entry_type: finForm.entry_type,
        label: finForm.label.trim(),
        amount: Number(finForm.amount) || 0,
        entry_date: finForm.entry_date || undefined,
        notes: finForm.notes.trim() || undefined,
        phase_id: finForm.phase_id || undefined,
      });
      setFinForm({ entry_type: 'expense', label: '', amount: '', entry_date: '', notes: '', phase_id: '' });
      await loadImplementationData(implProjectId, implPhaseId);
    } catch (err) {
      setError(err?.message || 'Could not add finance line');
    }
  };

  const onAddNote = async (e) => {
    e.preventDefault();
    if (!implProjectId || !noteBody.trim()) return;
    setError('');
    try {
      await pt.addNote(implProjectId, { body: noteBody.trim(), phase_id: implPhaseId || undefined });
      setNoteBody('');
      await loadImplementationData(implProjectId, implPhaseId);
    } catch (err) {
      setError(err?.message || 'Could not add note');
    }
  };

  const onUpload = async (e) => {
    const files = e.target.files;
    if (!files?.length || !implProjectId) return;
    setError('');
    try {
      await pt.uploadAttachments(implProjectId, files, uploadPhaseId || undefined);
      e.target.value = '';
      await loadImplementationData(implProjectId, implPhaseId);
    } catch (err) {
      setError(err?.message || 'Upload failed');
    }
  };

  const mainTabMeta = MAIN_TABS.find((t) => t.id === mainTab) || MAIN_TABS[0];
  const tabSubtitles = {
    dashboard: 'Portfolio metrics and recent implementation activity.',
    registration: 'Create projects, define phases, budgets, and people per stage.',
    implementation: 'Logs, finances, files, and notes against open phases.',
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col -m-4 sm:-m-6 overflow-hidden bg-gradient-to-b from-slate-50 via-white to-slate-50/80 dark:from-surface-950 dark:via-surface-900 dark:to-surface-950">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside
          className={`shrink-0 border-r border-slate-200/80 dark:border-surface-700 bg-white/95 dark:bg-surface-900/95 shadow-[1px_0_0_rgba(15,23,42,0.04)] flex flex-col transition-[width] duration-200 overflow-hidden ${
            navHidden ? 'w-0 border-0 shadow-none' : 'w-64 lg:w-72'
          }`}
        >
          <div className="p-4 border-b border-slate-100 dark:border-surface-800 flex items-start justify-between gap-2 w-64 lg:w-72 shrink-0 bg-slate-50/50 dark:bg-surface-800/40">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-surface-100 tracking-tight">Project tracker</h2>
              <p className="text-xs text-slate-500 dark:text-surface-400 mt-0.5">Sections</p>
            </div>
            <button
              type="button"
              onClick={() => setNavHidden(true)}
              className="text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 shrink-0"
              aria-label="Hide section menu"
            >
              «
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto p-3 space-y-1 w-64 lg:w-72 text-sm">
            <div className="pt-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-surface-400">Workspace</div>
            {MAIN_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`w-full text-left rounded-lg px-3 py-2.5 font-medium transition ${
                  mainTab === t.id
                    ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-900 dark:text-brand-200 ring-1 ring-brand-200/80 dark:ring-brand-800/80'
                    : 'hover:bg-surface-50 dark:hover:bg-surface-800 text-surface-800 dark:text-surface-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {navHidden && (
            <button
              type="button"
              onClick={() => setNavHidden(false)}
              className="m-2 self-start text-sm text-brand-700 dark:text-brand-400 hover:underline shrink-0"
            >
              Show section menu
            </button>
          )}

          <div className="shrink-0 border-b border-slate-200/80 dark:border-surface-700 bg-white/95 dark:bg-surface-900/95 px-4 py-4 sm:px-6">
            <div className="flex items-center gap-2 flex-wrap max-w-7xl mx-auto w-full">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-surface-50">{mainTabMeta.label}</h1>
              <InfoHint
                title="Project tracker"
                text="Register projects with full details, design phases (stages) with budgets and team roles, then run implementation: transcribe work, progress %, finances, attachments, and notes. Assign the Project tracker page role in User management to grant access."
              />
            </div>
            <p className="text-sm text-surface-600 dark:text-surface-400 mt-1 max-w-7xl mx-auto w-full">
              {tabSubtitles[mainTab] || tabSubtitles.dashboard}
            </p>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6 w-full">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">{error}</div>
      )}

      {loading && mainTab === 'dashboard' ? (
        <p className="text-surface-500">Loading…</p>
      ) : null}

      {mainTab === 'dashboard' && dash && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Projects', value: dash.project_count, hint: 'All in tenant' },
              { label: 'Active / registered', value: dash.active_projects, hint: 'In motion' },
              { label: 'Open phases', value: dash.open_phases, hint: 'Open or in progress' },
              { label: 'Planned budget (sum)', value: dash.total_planned_budget?.toLocaleString?.() ?? dash.total_planned_budget, hint: 'Project-level' },
            ].map((c) => (
              <div
                key={c.label}
                className="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-4 shadow-sm"
              >
                <p className="text-xs font-medium text-surface-500 uppercase">{c.label}</p>
                <p className="text-2xl font-bold text-brand-700 dark:text-brand-400 mt-1 tabular-nums">{c.value}</p>
                <p className="text-xs text-surface-500 mt-1">{c.hint}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-4">
            <h2 className="text-sm font-semibold text-surface-900 dark:text-surface-100 mb-3">Phase budget allocated (sum)</h2>
            <p className="text-lg font-semibold tabular-nums text-surface-800 dark:text-surface-200">
              {Number(dash.phases_allocated_budget || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-4">
            <h2 className="text-sm font-semibold text-surface-900 dark:text-surface-100 mb-3">Recent implementation logs</h2>
            {dash.recent_logs?.length ? (
              <ul className="space-y-2 text-sm">
                {dash.recent_logs.map((l) => (
                  <li key={l.id} className="border-b border-surface-100 dark:border-surface-800 pb-2">
                    <span className="font-medium text-surface-800 dark:text-surface-200">{l.project_title}</span>
                    <span className="text-surface-500"> · {l.phase_name}</span>
                    <span className="text-surface-500"> · {l.progress_percent}%</span>
                    <span className="text-surface-400 text-xs ml-2">{formatDateTime(l.created_at)}</span>
                    {l.work_transcript_preview && (
                      <p className="text-surface-600 dark:text-surface-400 mt-1 text-xs">{l.work_transcript_preview}…</p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-surface-500">No logs yet — add work from Project implementation.</p>
            )}
          </div>
        </div>
      )}

      {mainTab === 'registration' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1 space-y-3">
            <h2 className="text-sm font-semibold text-surface-800 dark:text-surface-200">Projects</h2>
            <div className="rounded-xl border border-surface-200 dark:border-surface-800 divide-y max-h-[32rem] overflow-y-auto">
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedProjectId(p.id)}
                  className={`w-full text-left px-3 py-2 text-sm ${selectedProjectId === p.id ? 'bg-brand-50 dark:bg-brand-900/20' : 'hover:bg-surface-50 dark:hover:bg-surface-800'}`}
                >
                  <div className="font-medium text-surface-900 dark:text-surface-100">{p.title}</div>
                  <div className="text-xs text-surface-500">
                    {p.status} · {p.phase_count ?? 0} phases
                  </div>
                </button>
              ))}
              {projects.length === 0 && <p className="p-3 text-sm text-surface-500">No projects yet.</p>}
            </div>
          </div>
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-4 space-y-3">
              <h2 className="text-sm font-semibold text-surface-800 dark:text-surface-200">New project</h2>
              <form onSubmit={onCreateProject} className="grid sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-surface-600 mb-1">Title *</label>
                  <input className={inputClass()} value={projForm.title} onChange={(e) => setProjForm((f) => ({ ...f, title: e.target.value }))} required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-surface-600 mb-1">Code</label>
                  <input className={inputClass()} value={projForm.code} onChange={(e) => setProjForm((f) => ({ ...f, code: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-surface-600 mb-1">Status</label>
                  <select className={inputClass()} value={projForm.status} onChange={(e) => setProjForm((f) => ({ ...f, status: e.target.value }))}>
                    {PROJECT_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-surface-600 mb-1">Description</label>
                  <textarea rows={3} className={inputClass()} value={projForm.description} onChange={(e) => setProjForm((f) => ({ ...f, description: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-surface-600 mb-1">Sponsor / client</label>
                  <input className={inputClass()} value={projForm.sponsor} onChange={(e) => setProjForm((f) => ({ ...f, sponsor: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-surface-600 mb-1">Site / location</label>
                  <input className={inputClass()} value={projForm.site_location} onChange={(e) => setProjForm((f) => ({ ...f, site_location: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-surface-600 mb-1">Planned start</label>
                  <input type="date" className={inputClass()} value={projForm.planned_start_date} onChange={(e) => setProjForm((f) => ({ ...f, planned_start_date: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-surface-600 mb-1">Planned end</label>
                  <input type="date" className={inputClass()} value={projForm.planned_end_date} onChange={(e) => setProjForm((f) => ({ ...f, planned_end_date: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-surface-600 mb-1">Overall budget</label>
                  <input type="number" step="0.01" className={inputClass()} value={projForm.overall_budget} onChange={(e) => setProjForm((f) => ({ ...f, overall_budget: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-surface-600 mb-1">Owner</label>
                  <select className={inputClass()} value={projForm.owner_user_id} onChange={(e) => setProjForm((f) => ({ ...f, owner_user_id: e.target.value }))}>
                    <option value="">—</option>
                    {tenantUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name || u.email}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <button type="submit" className={btnPrimary()}>
                    Create project
                  </button>
                </div>
              </form>
            </div>

            {detail?.project && (
              <>
                <div className="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-4 space-y-3">
                  <div className="flex justify-between items-center gap-2">
                    <h2 className="text-sm font-semibold text-surface-800 dark:text-surface-200">Edit project</h2>
                    {user?.role === 'tenant_admin' || user?.role === 'super_admin' ? (
                      <button
                        type="button"
                        className="text-xs text-red-600 hover:underline"
                        onClick={async () => {
                          if (!window.confirm('Delete this project and all phases, logs, and files?')) return;
                          try {
                            await pt.deleteProject(detail.project.id);
                            setSelectedProjectId(null);
                            setDetail(null);
                            await refreshProjects();
                            await refreshDashboard();
                          } catch (err) {
                            setError(err?.message || 'Delete failed');
                          }
                        }}
                      >
                        Delete project
                      </button>
                    ) : null}
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-surface-600 mb-1">Title</label>
                      <input
                        className={inputClass()}
                        value={detail.project.title || ''}
                        onChange={(e) => setDetail((d) => ({ ...d, project: { ...d.project, title: e.target.value } }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-surface-600 mb-1">Code</label>
                      <input
                        className={inputClass()}
                        value={detail.project.code || ''}
                        onChange={(e) => setDetail((d) => ({ ...d, project: { ...d.project, code: e.target.value } }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-surface-600 mb-1">Status</label>
                      <select
                        className={inputClass()}
                        value={detail.project.status || 'draft'}
                        onChange={(e) => setDetail((d) => ({ ...d, project: { ...d.project, status: e.target.value } }))}
                      >
                        {PROJECT_STATUSES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-surface-600 mb-1">Description</label>
                      <textarea
                        rows={3}
                        className={inputClass()}
                        value={detail.project.description || ''}
                        onChange={(e) => setDetail((d) => ({ ...d, project: { ...d.project, description: e.target.value } }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-surface-600 mb-1">Sponsor</label>
                      <input
                        className={inputClass()}
                        value={detail.project.sponsor || ''}
                        onChange={(e) => setDetail((d) => ({ ...d, project: { ...d.project, sponsor: e.target.value } }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-surface-600 mb-1">Site</label>
                      <input
                        className={inputClass()}
                        value={detail.project.site_location || ''}
                        onChange={(e) => setDetail((d) => ({ ...d, project: { ...d.project, site_location: e.target.value } }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-surface-600 mb-1">Owner</label>
                      <select
                        className={inputClass()}
                        value={detail.project.owner_user_id || ''}
                        onChange={(e) => setDetail((d) => ({ ...d, project: { ...d.project, owner_user_id: e.target.value || null } }))}
                      >
                        <option value="">—</option>
                        {tenantUsers.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.full_name || u.email}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-surface-600 mb-1">Overall budget</label>
                      <input
                        type="number"
                        step="0.01"
                        className={inputClass()}
                        value={detail.project.overall_budget ?? ''}
                        onChange={(e) => setDetail((d) => ({ ...d, project: { ...d.project, overall_budget: e.target.value } }))}
                      />
                    </div>
                  </div>
                  <button type="button" className={btnPrimary()} onClick={onSaveProject}>
                    Save project
                  </button>
                </div>

                <div className="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-4 space-y-4">
                  <h2 className="text-sm font-semibold text-surface-800 dark:text-surface-200">Project design — phases / stages</h2>
                  <form onSubmit={onAddPhase} className="grid sm:grid-cols-2 gap-3 border-b border-surface-100 dark:border-surface-800 pb-4">
                    <div>
                      <label className="block text-xs font-medium text-surface-600 mb-1">Phase name *</label>
                      <input className={inputClass()} value={phaseForm.name} onChange={(e) => setPhaseForm((f) => ({ ...f, name: e.target.value }))} required />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-surface-600 mb-1">Sort order</label>
                      <input type="number" className={inputClass()} value={phaseForm.sort_order} onChange={(e) => setPhaseForm((f) => ({ ...f, sort_order: e.target.value }))} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-surface-600 mb-1">Description</label>
                      <textarea rows={2} className={inputClass()} value={phaseForm.description} onChange={(e) => setPhaseForm((f) => ({ ...f, description: e.target.value }))} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-surface-600 mb-1">Actions required</label>
                      <textarea rows={2} className={inputClass()} value={phaseForm.actions_required} onChange={(e) => setPhaseForm((f) => ({ ...f, actions_required: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-surface-600 mb-1">Budget (this stage)</label>
                      <input type="number" step="0.01" className={inputClass()} value={phaseForm.budget_allocated} onChange={(e) => setPhaseForm((f) => ({ ...f, budget_allocated: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-surface-600 mb-1">Phase status</label>
                      <select className={inputClass()} value={phaseForm.status} onChange={(e) => setPhaseForm((f) => ({ ...f, status: e.target.value }))}>
                        {PHASE_STATUSES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-surface-600 mb-1">Requirements (summary)</label>
                      <textarea rows={2} className={inputClass()} value={phaseForm.requirements_summary} onChange={(e) => setPhaseForm((f) => ({ ...f, requirements_summary: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-surface-600 mb-1">Planned start</label>
                      <input type="date" className={inputClass()} value={phaseForm.planned_start} onChange={(e) => setPhaseForm((f) => ({ ...f, planned_start: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-surface-600 mb-1">Planned end</label>
                      <input type="date" className={inputClass()} value={phaseForm.planned_end} onChange={(e) => setPhaseForm((f) => ({ ...f, planned_end: e.target.value }))} />
                    </div>
                    <div className="sm:col-span-2">
                      <button type="submit" className={btnPrimary()}>
                        Add phase
                      </button>
                    </div>
                  </form>

                  {(detail.phases || []).map((ph) => (
                    <div key={ph.id} className="border border-surface-200 dark:border-surface-700 rounded-lg p-3 space-y-2">
                      <div className="flex flex-wrap justify-between gap-2">
                        <div>
                          <span className="font-semibold text-surface-900 dark:text-surface-100">{ph.name}</span>
                          <span className="text-xs text-surface-500 ml-2">{ph.status}</span>
                        </div>
                        <button
                          type="button"
                          className="text-xs text-red-600"
                          onClick={async () => {
                            if (!window.confirm('Remove this phase?')) return;
                            try {
                              await pt.deletePhase(ph.id);
                              await loadDetail(selectedProjectId);
                              await refreshDashboard();
                            } catch (err) {
                              setError(err?.message || 'Delete failed');
                            }
                          }}
                        >
                          Remove phase
                        </button>
                      </div>
                      <p className="text-xs text-surface-600 dark:text-surface-400">{ph.description}</p>
                      <div className="text-xs text-surface-500">Budget: {ph.budget_allocated ?? '—'}</div>
                      <div className="flex flex-wrap gap-2 items-end">
                        <select className={inputClass() + ' max-w-[10rem]'} value={ph.status} onChange={async (e) => {
                          try {
                            await pt.updatePhase(ph.id, { status: e.target.value });
                            await loadDetail(selectedProjectId);
                          } catch (err) {
                            setError(err?.message || 'Update failed');
                          }
                        }}
                        >
                          {PHASE_STATUSES.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="mt-2">
                        <p className="text-xs font-medium text-surface-600 mb-1">People on this stage</p>
                        <ul className="text-xs space-y-1">
                          {(ph.members || []).map((m) => (
                            <li key={m.id} className="flex justify-between gap-2">
                              <span>
                                {m.full_name || m.email} — <em>{m.role_title}</em>
                                {m.requirements_notes && <span className="text-surface-500"> ({m.requirements_notes})</span>}
                              </span>
                              <button type="button" className="text-red-600 shrink-0" onClick={async () => {
                                try {
                                  await pt.removePhaseMember(m.id);
                                  await loadDetail(selectedProjectId);
                                } catch (err) {
                                  setError(err?.message || 'Remove failed');
                                }
                              }}
                              >
                                Remove
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}

                  <form onSubmit={onAddMember} className="grid sm:grid-cols-2 gap-2 items-end border-t border-surface-100 dark:border-surface-800 pt-4">
                    <div>
                      <label className="block text-xs font-medium text-surface-600 mb-1">Phase</label>
                      <select className={inputClass()} value={memberForm.phaseId} onChange={(e) => setMemberForm((f) => ({ ...f, phaseId: e.target.value }))}>
                        <option value="">Select phase…</option>
                        {(detail.phases || []).map((ph) => (
                          <option key={ph.id} value={ph.id}>{ph.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-surface-600 mb-1">User</label>
                      <select className={inputClass()} value={memberForm.user_id} onChange={(e) => setMemberForm((f) => ({ ...f, user_id: e.target.value }))}>
                        <option value="">Select…</option>
                        {tenantUsers.map((u) => (
                          <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-surface-600 mb-1">Role on stage</label>
                      <input className={inputClass()} value={memberForm.role_title} onChange={(e) => setMemberForm((f) => ({ ...f, role_title: e.target.value }))} placeholder="e.g. Lead engineer" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-surface-600 mb-1">Requirements / notes</label>
                      <input className={inputClass()} value={memberForm.requirements_notes} onChange={(e) => setMemberForm((f) => ({ ...f, requirements_notes: e.target.value }))} />
                    </div>
                    <div className="sm:col-span-2">
                      <button type="submit" className={btnSecondary()}>Add person to phase</button>
                    </div>
                  </form>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {mainTab === 'implementation' && (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">Project</label>
              <select className={inputClass() + ' min-w-[14rem]'} value={implProjectId || ''} onChange={(e) => {
                const v = e.target.value || null;
                setImplProjectId(v);
                setImplPhaseId(null);
              }}
              >
                <option value="">Select project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">Phase (for logs)</label>
              <select className={inputClass() + ' min-w-[14rem]'} value={implPhaseId || ''} onChange={(e) => setImplPhaseId(e.target.value || null)} disabled={!implProjectId}>
                <option value="">Select phase…</option>
                {(implDetail?.phases || []).map((ph) => (
                  <option key={ph.id} value={ph.id}>{ph.name} ({ph.status})</option>
                ))}
              </select>
            </div>
          </div>

          {!implProjectId && <p className="text-sm text-surface-500">Choose a project to record implementation, finances, files, and notes.</p>}

          {implProjectId && (
            <>
              <div className="grid lg:grid-cols-2 gap-6">
                <div className="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-4 space-y-3">
                  <h2 className="text-sm font-semibold text-surface-800 dark:text-surface-200">Work transcript & progress</h2>
                  <form onSubmit={onSubmitLog} className="space-y-2">
                    <textarea
                      rows={4}
                      className={inputClass()}
                      placeholder="Transcribe work done, decisions, blockers…"
                      value={logForm.work_transcript}
                      onChange={(e) => setLogForm((f) => ({ ...f, work_transcript: e.target.value }))}
                      disabled={!implPhaseId}
                    />
                    <div className="flex gap-3 flex-wrap">
                      <div>
                        <label className="block text-xs text-surface-600 mb-1">Progress %</label>
                        <input type="number" min={0} max={100} className={inputClass() + ' w-24'} value={logForm.progress_percent} onChange={(e) => setLogForm((f) => ({ ...f, progress_percent: e.target.value }))} disabled={!implPhaseId} />
                      </div>
                      <div className="flex-1 min-w-[8rem]">
                        <label className="block text-xs text-surface-600 mb-1">Finances note (this entry)</label>
                        <input className={inputClass()} value={logForm.finances_note} onChange={(e) => setLogForm((f) => ({ ...f, finances_note: e.target.value }))} disabled={!implPhaseId} />
                      </div>
                    </div>
                    <button type="submit" className={btnPrimary()} disabled={!implPhaseId}>Save log entry</button>
                  </form>
                  <ul className="text-xs space-y-2 max-h-56 overflow-y-auto border-t border-surface-100 pt-2">
                    {logs.map((l) => (
                      <li key={l.id} className="text-surface-700 dark:text-surface-300">
                        <span className="font-medium">{l.progress_percent}%</span> · {formatDateTime(l.created_at)} · {l.author_name}
                        {l.work_transcript && <p className="text-surface-500 mt-0.5 whitespace-pre-wrap">{l.work_transcript}</p>}
                        {l.finances_note && <p className="text-amber-700 dark:text-amber-400 mt-0.5">{l.finances_note}</p>}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-4 space-y-3">
                  <h2 className="text-sm font-semibold text-surface-800 dark:text-surface-200">Finances</h2>
                  <form onSubmit={onAddFinance} className="grid sm:grid-cols-2 gap-2">
                    <select className={inputClass()} value={finForm.entry_type} onChange={(e) => setFinForm((f) => ({ ...f, entry_type: e.target.value }))}>
                      <option value="income">Income</option>
                      <option value="expense">Expense</option>
                      <option value="forecast">Forecast</option>
                    </select>
                    <input className={inputClass()} placeholder="Label" value={finForm.label} onChange={(e) => setFinForm((f) => ({ ...f, label: e.target.value }))} />
                    <input type="number" step="0.01" className={inputClass()} placeholder="Amount" value={finForm.amount} onChange={(e) => setFinForm((f) => ({ ...f, amount: e.target.value }))} />
                    <input type="date" className={inputClass()} value={finForm.entry_date} onChange={(e) => setFinForm((f) => ({ ...f, entry_date: e.target.value }))} />
                    <select className={inputClass()} value={finForm.phase_id} onChange={(e) => setFinForm((f) => ({ ...f, phase_id: e.target.value }))}>
                      <option value="">All project (no phase)</option>
                        {(implDetail?.phases || []).map((ph) => (
                          <option key={ph.id} value={ph.id}>{ph.name}</option>
                        ))}
                    </select>
                    <input className={inputClass() + ' sm:col-span-2'} placeholder="Notes" value={finForm.notes} onChange={(e) => setFinForm((f) => ({ ...f, notes: e.target.value }))} />
                    <button type="submit" className={btnPrimary() + ' sm:col-span-2'}>Add finance line</button>
                  </form>
                  <table className="w-full text-xs mt-2">
                    <thead>
                      <tr className="text-left text-surface-500">
                        <th className="py-1">Date</th>
                        <th>Type</th>
                        <th>Label</th>
                        <th className="text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {finance.map((x) => (
                        <tr key={x.id} className="border-t border-surface-100 dark:border-surface-800">
                          <td className="py-1">{formatDate(x.entry_date)}</td>
                          <td>{x.entry_type}</td>
                          <td>{x.label}{x.phase_name ? ` · ${x.phase_name}` : ''}</td>
                          <td className="text-right tabular-nums">{Number(x.amount).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid lg:grid-cols-2 gap-6">
                <div className="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-4 space-y-3">
                  <h2 className="text-sm font-semibold text-surface-800 dark:text-surface-200">Attachments</h2>
                  <div className="flex flex-wrap gap-2 items-end">
                    <div>
                      <label className="block text-xs text-surface-600 mb-1">Tag to phase (optional)</label>
                      <select className={inputClass()} value={uploadPhaseId} onChange={(e) => setUploadPhaseId(e.target.value)}>
                        <option value="">Project-level</option>
                        {(implDetail?.phases || []).map((ph) => (
                          <option key={ph.id} value={ph.id}>{ph.name}</option>
                        ))}
                      </select>
                    </div>
                    <label className={`${btnSecondary()} cursor-pointer`}>
                      Upload files
                      <input type="file" multiple className="hidden" onChange={onUpload} />
                    </label>
                  </div>
                  <ul className="text-sm space-y-2">
                    {attachments.map((a) => (
                      <li key={a.id} className="flex flex-wrap justify-between gap-2 border-b border-surface-100 pb-2">
                        <span>{a.file_name}{a.phase_name ? <span className="text-surface-500"> · {a.phase_name}</span> : null}</span>
                        <span className="flex gap-2">
                          <button type="button" className="text-brand-600 text-xs" onClick={() => openAttachmentWithAuth(pt.attachmentDownloadUrl(implProjectId, a.id))}>View</button>
                          <button type="button" className="text-brand-600 text-xs" onClick={() => downloadAttachmentWithAuth(pt.attachmentDownloadUrl(implProjectId, a.id), a.file_name)}>Download</button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-4 space-y-3">
                  <h2 className="text-sm font-semibold text-surface-800 dark:text-surface-200">Notes</h2>
                  <form onSubmit={onAddNote} className="space-y-2">
                    <textarea rows={3} className={inputClass()} value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="Implementation notes…" />
                    <button type="submit" className={btnPrimary()}>Add note</button>
                  </form>
                  <ul className="text-xs space-y-2 max-h-48 overflow-y-auto">
                    {notes.map((n) => (
                      <li key={n.id} className="border-b border-surface-100 pb-2">
                        <span className="text-surface-500">{formatDateTime(n.created_at)} · {n.author_name}</span>
                        {n.phase_name && <span className="text-surface-400"> · {n.phase_name}</span>}
                        <p className="text-surface-800 dark:text-surface-200 mt-0.5 whitespace-pre-wrap">{n.body}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          )}
        </div>
      )}

            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
