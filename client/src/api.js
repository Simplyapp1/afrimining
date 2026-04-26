import { getApiBase } from './lib/apiBase.js';

// In dev, call API directly so it works even if proxy fails. Override with VITE_API_BASE in client .env.
const API = getApiBase();

/** Open an attachment URL in a new tab using fetch with credentials so auth is sent. */
export async function openAttachmentWithAuth(url) {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(res.status === 401 ? 'Please sign in again' : 'Could not load attachment');
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const w = window.open(objectUrl, '_blank', 'noopener');
  if (w) setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  else URL.revokeObjectURL(objectUrl);
}

/** Download an attachment (fetch with credentials, then trigger save). */
export async function downloadAttachmentWithAuth(url, filename) {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    const text = await res.text();
    let msg = res.status === 401 ? 'Please sign in again' : 'Could not download';
    try {
      const data = JSON.parse(text);
      if (data?.error) msg = data.error;
    } catch (_) {}
    throw new Error(msg);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename || 'attachment';
  a.click();
  URL.revokeObjectURL(objectUrl);
}

function wrapNetworkError(err) {
  if (err?.message === 'Failed to fetch') {
    if (import.meta.env.DEV) {
      return new Error(
        'Cannot reach the API (local dev). (1) Start the backend in the project root: npm run server or npm start. (2) If the API uses another port, set VITE_API_BASE in client/.env and restart Vite. (3) This text only appears while running Vite (npm run dev)—it is not shown by the production build. If you see it on https://your live domain, you are not running the deployed bundle; use the production build on Azure and fix server env (FRONTEND_ORIGIN), not localhost.'
      );
    }
    return new Error(
      'Cannot reach the API. If the site is hosted separately from the API, rebuild the client with VITE_API_BASE set to your API base URL (e.g. https://your-app.azurewebsites.net/api). On the server, set FRONTEND_ORIGIN (and optionally FRONTEND_ORIGINS) to this site’s exact URL(s) so CORS allows the browser. See docs/azure-hosting.md.'
    );
  }
  return err;
}

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
      credentials: 'include',
    });
  } catch (err) {
    throw wrapNetworkError(err);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const base =
      data.error ||
      (res.status === 404 ? `Not found (${path})` : res.statusText);
    const hint = data.hint ? ` ${data.hint}` : '';
    const err = new Error(`${base}${hint}`.trim());
    if (data.code) err.code = data.code;
    if (data.distanceMeters != null) err.distanceMeters = data.distanceMeters;
    if (data.allowedRadiusMeters != null) err.allowedRadiusMeters = data.allowedRadiusMeters;
    throw err;
  }
  return data;
}

async function requestForm(path, formData) {
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });
  } catch (err) {
    throw wrapNetworkError(err);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const base = data.error || res.statusText;
    const hint = data.hint ? ` ${data.hint}` : '';
    throw new Error(`${base}${hint}`.trim());
  }
  return data;
}

export const research = {
  schema: () => request('/research/schema'),
  listParticipants: () => request('/research/participants'),
  createParticipant: (body) => request('/research/participants', { method: 'POST', body: JSON.stringify(body || {}) }),
  getParticipant: (id) => request(`/research/participants/${id}`),
  patchParticipant: (id, body) => request(`/research/participants/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  scanParticipant: (id, formData) => requestForm(`/research/participants/${id}/scan`, formData),
  deleteParticipant: (id) => request(`/research/participants/${id}`, { method: 'DELETE' }),
  analysis: (includeDraft) =>
    request(`/research/analysis${includeDraft ? '?include_draft=1' : ''}`),
  exportUrl: (includeDraft) => `${API}/research/export.xlsx${includeDraft ? '?include_draft=1' : ''}`,
};

export const auth = {
  login: (email, password, location) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        ...(location && typeof location === 'object'
          ? {
              latitude: location.latitude,
              longitude: location.longitude,
              accuracy_meters: location.accuracy_meters ?? location.accuracy,
            }
          : {}),
      }),
    }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),
  switchTenant: (tenantId) => request('/auth/switch-tenant', { method: 'POST', body: JSON.stringify({ tenant_id: tenantId }) }),
  forgotPassword: (body) => request('/auth/forgot-password', { method: 'POST', body: JSON.stringify(body) }),
  resetPassword: (body) => request('/auth/reset-password', { method: 'POST', body: JSON.stringify(body) }),
  signUp: (body) => request('/auth/sign-up', { method: 'POST', body: JSON.stringify(body) }),
};

export const users = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/users${q ? `?${q}` : ''}`);
  },
  get: (id) => request(`/users/${id}`),
  activity: (id) => request(`/users/${id}/activity`),
  loginActivity: (id, params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/users/${encodeURIComponent(id)}/login-activity${q ? `?${q}` : ''}`);
  },
  loginActivityBulkDelete: (ids) =>
    request('/users/login-activity/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) }),
  create: (body) => request('/users', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => request(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  bulk: (body) => request('/users/bulk', { method: 'POST', body: JSON.stringify(body) }),
  delete: (id) => request(`/users/${id}`, { method: 'DELETE' }),
  signUpRequests: {
    list: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/users/sign-up-requests${q ? `?${q}` : ''}`);
    },
    get: (id) => request(`/users/sign-up-requests/${id}`),
    approve: (id, body) => request(`/users/sign-up-requests/${id}/approve`, { method: 'POST', body: JSON.stringify(body) }),
    reject: (id, body) => request(`/users/sign-up-requests/${id}/reject`, { method: 'POST', body: JSON.stringify(body || {}) }),
  },
  /** Super admin: accounts locked after failed sign-in attempts. */
  blockRequests: {
    list: () => request('/users/block-requests'),
    unlock: (id) => request(`/users/block-requests/${encodeURIComponent(id)}/unlock`, { method: 'POST', body: '{}' }),
  },
};

export const tenants = {
  list: () => request('/tenants'),
  get: (id) => request(`/tenants/${id}`),
  create: (body) => request('/tenants', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => request(`/tenants/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (id) => request(`/tenants/${id}`, { method: 'DELETE' }),
  uploadLogo: (id, file) => {
    const formData = new FormData();
    formData.append('logo', file);
    return fetch(`${API}/tenants/${id}/logo`, { method: 'POST', body: formData, credentials: 'include' })
      .then((res) => res.json().then((data) => (res.ok ? data : Promise.reject(new Error(data.error || res.statusText)))));
  },
  logoUrl: (id) => `${API}/tenants/${id}/logo`,
};

export const tasks = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/tasks${q ? `?${q}` : ''}`);
  },
  get: (id) => request(`/tasks/${id}`),
  create: (body) => request('/tasks', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => request(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  assign: (id, body) => request(`/tasks/${id}/assign`, { method: 'POST', body: JSON.stringify(body) }),
  addProgressUpdate: (id, body) => request(`/tasks/${id}/progress-updates`, { method: 'POST', body: JSON.stringify(body) }),
  addComment: (id, body) => request(`/tasks/${id}/comments`, { method: 'POST', body: JSON.stringify(body) }),
  addCommentAttachments: (taskId, commentId, files) => {
    const formData = new FormData();
    Array.from(files).forEach((file) => formData.append('files', file));
    return fetch(`${API}/tasks/${taskId}/comments/${commentId}/attachments`, { method: 'POST', body: formData, credentials: 'include' })
      .then((res) => res.json().then((data) => (res.ok ? data : Promise.reject(new Error(data.error || res.statusText)))));
  },
  commentAttachmentDownloadUrl: (taskId, commentId, attachmentId) =>
    `${API}/tasks/${taskId}/comments/${commentId}/attachments/${attachmentId}/download`,
  addReminder: (id, body) => request(`/tasks/${id}/reminders`, { method: 'POST', body: JSON.stringify(body) }),
  dismissReminder: (taskId, reminderId) => request(`/tasks/${taskId}/reminders/${reminderId}/dismiss`, { method: 'PATCH' }),
  uploadAttachment: (id, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return fetch(`${API}/tasks/${id}/attachments`, { method: 'POST', body: formData, credentials: 'include' })
      .then((res) => res.json().then((data) => (res.ok ? data : Promise.reject(new Error(data.error || res.statusText)))));
  },
  uploadAttachments: (id, files) => {
    const formData = new FormData();
    Array.from(files || []).forEach((f) => formData.append('files', f));
    return fetch(`${API}/tasks/${id}/attachments`, { method: 'POST', body: formData, credentials: 'include' })
      .then((res) => res.json().then((data) => (res.ok ? data : Promise.reject(new Error(data.error || res.statusText)))));
  },
  attachmentDownloadUrl: (id, attachmentId) => `${API}/tasks/${id}/attachments/${attachmentId}/download`,
  tenantUsers: () => request('/tasks/users/tenant'),
  library: {
    folders: {
      list: () => request('/tasks/library/folders'),
      create: (body) => request('/tasks/library/folders', { method: 'POST', body: JSON.stringify(body) }),
    },
    files: {
      list: (folderId) => request(`/tasks/library/files${folderId != null && folderId !== '' ? `?folder_id=${encodeURIComponent(folderId)}` : '?folder_id='}`),
      upload: (file, folderId) => {
        const formData = new FormData();
        formData.append('file', file);
        if (folderId != null && folderId !== '') formData.append('folder_id', folderId);
        return fetch(`${API}/tasks/library/files`, { method: 'POST', body: formData, credentials: 'include' })
          .then((res) => res.json().then((data) => (res.ok ? data : Promise.reject(new Error(data.error || res.statusText)))));
      },
      downloadUrl: (id) => `${API}/tasks/library/files/${id}/download`,
    },
  },
};

/** Project tracker — portfolio projects, phased design, implementation logs, finance, attachments. */
export const projectTracker = {
  dashboard: () => request('/project-tracker/dashboard'),
  listProjects: () => request('/project-tracker/projects'),
  createProject: (body) => request('/project-tracker/projects', { method: 'POST', body: JSON.stringify(body) }),
  getProject: (id) => request(`/project-tracker/projects/${encodeURIComponent(id)}`),
  updateProject: (id, body) =>
    request(`/project-tracker/projects/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteProject: (id) => request(`/project-tracker/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  createPhase: (projectId, body) =>
    request(`/project-tracker/projects/${encodeURIComponent(projectId)}/phases`, { method: 'POST', body: JSON.stringify(body) }),
  updatePhase: (phaseId, body) =>
    request(`/project-tracker/phases/${encodeURIComponent(phaseId)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deletePhase: (phaseId) => request(`/project-tracker/phases/${encodeURIComponent(phaseId)}`, { method: 'DELETE' }),
  addPhaseMember: (phaseId, body) =>
    request(`/project-tracker/phases/${encodeURIComponent(phaseId)}/members`, { method: 'POST', body: JSON.stringify(body) }),
  removePhaseMember: (memberId) =>
    request(`/project-tracker/phase-members/${encodeURIComponent(memberId)}`, { method: 'DELETE' }),
  listLogs: (phaseId) => request(`/project-tracker/phases/${encodeURIComponent(phaseId)}/logs`),
  addLog: (phaseId, body) =>
    request(`/project-tracker/phases/${encodeURIComponent(phaseId)}/logs`, { method: 'POST', body: JSON.stringify(body) }),
  listFinance: (projectId) => request(`/project-tracker/projects/${encodeURIComponent(projectId)}/finance-lines`),
  addFinance: (projectId, body) =>
    request(`/project-tracker/projects/${encodeURIComponent(projectId)}/finance-lines`, { method: 'POST', body: JSON.stringify(body) }),
  listNotes: (projectId) => request(`/project-tracker/projects/${encodeURIComponent(projectId)}/notes`),
  addNote: (projectId, body) =>
    request(`/project-tracker/projects/${encodeURIComponent(projectId)}/notes`, { method: 'POST', body: JSON.stringify(body) }),
  listAttachments: (projectId) => request(`/project-tracker/projects/${encodeURIComponent(projectId)}/attachments`),
  uploadAttachments: (projectId, files, phaseId) => {
    const formData = new FormData();
    Array.from(files || []).forEach((f) => formData.append('files', f));
    if (phaseId) formData.append('phase_id', phaseId);
    return fetch(`${API}/project-tracker/projects/${encodeURIComponent(projectId)}/attachments`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    }).then((res) => res.json().then((data) => (res.ok ? data : Promise.reject(new Error(data.error || res.statusText)))));
  },
  attachmentDownloadUrl: (projectId, attachmentId) =>
    `${API}/project-tracker/projects/${encodeURIComponent(projectId)}/attachments/${encodeURIComponent(attachmentId)}/download`,
};

/** Resources register — assets, inventory, stock movements, rich attachments. */
export const resourcesRegister = {
  dashboard: () => request('/resources-register/dashboard'),
  listAssets: (params) => {
    const q = new URLSearchParams(params || {}).toString();
    return request(`/resources-register/assets${q ? `?${q}` : ''}`);
  },
  createAsset: (body) => request('/resources-register/assets', { method: 'POST', body: JSON.stringify(body) }),
  getAsset: (id) => request(`/resources-register/assets/${encodeURIComponent(id)}`),
  updateAsset: (id, body) =>
    request(`/resources-register/assets/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteAsset: (id) => request(`/resources-register/assets/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  listServiceEvents: (assetId) => request(`/resources-register/assets/${encodeURIComponent(assetId)}/service-events`),
  addServiceEvent: (assetId, body) =>
    request(`/resources-register/assets/${encodeURIComponent(assetId)}/service-events`, { method: 'POST', body: JSON.stringify(body) }),
  listInventory: (params) => {
    const q = new URLSearchParams(params || {}).toString();
    return request(`/resources-register/inventory/items${q ? `?${q}` : ''}`);
  },
  createInventoryItem: (body) => request('/resources-register/inventory/items', { method: 'POST', body: JSON.stringify(body) }),
  getInventoryItem: (id) => request(`/resources-register/inventory/items/${encodeURIComponent(id)}`),
  updateInventoryItem: (id, body) =>
    request(`/resources-register/inventory/items/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteInventoryItem: (id) => request(`/resources-register/inventory/items/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  listMovements: (itemId) => request(`/resources-register/inventory/items/${encodeURIComponent(itemId)}/movements`),
  addMovement: (itemId, body) =>
    request(`/resources-register/inventory/items/${encodeURIComponent(itemId)}/movements`, { method: 'POST', body: JSON.stringify(body) }),
  listAttachments: (entityType, entityId) =>
    request(
      `/resources-register/attachments?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}`
    ),
  uploadAttachments: (entityType, entityId, files, meta = {}) => {
    const formData = new FormData();
    Array.from(files || []).forEach((f) => formData.append('files', f));
    if (meta.document_category) formData.append('document_category', meta.document_category);
    if (meta.expiry_date) formData.append('expiry_date', meta.expiry_date);
    if (meta.renewal_date) formData.append('renewal_date', meta.renewal_date);
    if (meta.maintenance_interval_days != null) formData.append('maintenance_interval_days', String(meta.maintenance_interval_days));
    if (meta.notes) formData.append('notes', meta.notes);
    if (meta.display_name) formData.append('display_name', meta.display_name);
    return fetch(
      `${API}/resources-register/attachments/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`,
      { method: 'POST', body: formData, credentials: 'include' }
    ).then((res) => res.json().then((data) => (res.ok ? data : Promise.reject(new Error(data.error || res.statusText)))));
  },
  updateAttachment: (id, body) =>
    request(`/resources-register/attachments/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteAttachment: (id) => request(`/resources-register/attachments/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  attachmentDownloadUrl: (attachmentId) =>
    `${API}/resources-register/attachments/${encodeURIComponent(attachmentId)}/download`,
};

/** Contractor / haulier management API (`/api/contractor`). */
export const contractor = {
  context: () => request('/contractor/context'),
  listContractors: () => request('/contractor/contractors'),
  createContractor: (body) => request('/contractor/contractors', { method: 'POST', body: JSON.stringify(body) }),
  updateContractor: (id, body) =>
    request(`/contractor/contractors/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  getInfo: () => request('/contractor/info'),
  updateInfo: (body) => request('/contractor/info', { method: 'PATCH', body: JSON.stringify(body) }),
  listExpiries: () => request('/contractor/expiries'),
  createExpiry: (body) => request('/contractor/expiries', { method: 'POST', body: JSON.stringify(body) }),
  updateExpiry: (id, body) =>
    request(`/contractor/expiries/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteExpiry: (id) => request(`/contractor/expiries/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  libraryDocumentTypes: () => request('/contractor/library/document-types'),
  listLibrary: () => request('/contractor/library'),
  uploadLibraryDocument: (file, documentType, linkedEntityType, linkedEntityId) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('document_type', documentType || 'other');
    if (linkedEntityType && linkedEntityId) {
      formData.append('linked_entity_type', linkedEntityType);
      formData.append('linked_entity_id', linkedEntityId);
    }
    return fetch(`${API}/contractor/library`, { method: 'POST', body: formData, credentials: 'include' }).then((res) =>
      res.json().then((data) => (res.ok ? data : Promise.reject(new Error(data.error || res.statusText))))
    );
  },
  deleteLibraryDocument: (id) => request(`/contractor/library/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  libraryDownloadUrl: (id) => `${API}/contractor/library/${encodeURIComponent(id)}/download`,
  listSubcontractors: () => request('/contractor/subcontractors'),
  createSubcontractor: (body) => request('/contractor/subcontractors', { method: 'POST', body: JSON.stringify(body) }),
  updateSubcontractor: (id, body) =>
    request(`/contractor/subcontractors/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteSubcontractor: (id) => request(`/contractor/subcontractors/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

const rec = (path, options = {}) => request(`/recruitment${path}`, { ...options, body: options.body ? JSON.stringify(options.body) : options.body });
/** Public job application (no auth): used by external /apply/:token page */
export const recruitmentApply = {
  getInvite: (token) => fetch(`${API}/recruitment/apply/${encodeURIComponent(token)}`, { credentials: 'include' }).then((res) => res.json().then((data) => (res.ok ? data : Promise.reject(new Error(data.error || res.statusText))))),
  submit: (token, formData) =>
    fetch(`${API}/recruitment/apply/${encodeURIComponent(token)}`, { method: 'POST', body: formData, credentials: 'include' }).then((res) =>
      res.json().then((data) => (res.ok ? data : Promise.reject(new Error(data.error || res.statusText))))
    ),
};
export const recruitment = {
  vacancies: {
    list: () => rec('/vacancies'),
    get: (id) => rec(`/vacancies/${id}`),
    create: (body) => rec('/vacancies', { method: 'POST', body }),
    update: (id, body) => rec(`/vacancies/${id}`, { method: 'PATCH', body }),
    delete: (id) => rec(`/vacancies/${id}`, { method: 'DELETE' }),
  },
  folders: {
    list: () => rec('/folders'),
    create: (body) => rec('/folders', { method: 'POST', body }),
    update: (id, body) => rec(`/folders/${id}`, { method: 'PATCH', body }),
    delete: (id) => rec(`/folders/${id}`, { method: 'DELETE' }),
  },
  cvs: {
    list: (folderId, opts = {}) => {
      const q = new URLSearchParams();
      if (folderId != null && folderId !== '') q.set('folder_id', folderId);
      if (opts.linked_to_interview === true) q.set('linked_to_interview', 'true');
      if (opts.linked_to_interview === false) q.set('linked_to_interview', 'false');
      return rec(`/cvs${q.toString() ? `?${q.toString()}` : ''}`);
    },
    get: (id) => rec(`/cvs/${id}`),
    upload: (file, body = {}) => {
      const formData = new FormData();
      formData.append('file', file);
      if (body.folder_id != null) formData.append('folder_id', body.folder_id);
      if (body.applicant_name) formData.append('applicant_name', body.applicant_name);
      if (body.applicant_email) formData.append('applicant_email', body.applicant_email);
      return fetch(`${API}/recruitment/cvs`, { method: 'POST', body: formData, credentials: 'include' })
        .then((res) => res.json().then((data) => (res.ok ? data : Promise.reject(new Error(data.error || res.statusText)))));
    },
    downloadUrl: (id) => `${API}/recruitment/cvs/${id}/download`,
    delete: (id) => rec(`/cvs/${id}`, { method: 'DELETE' }),
    bulkDelete: (ids) => rec('/cvs/bulk-delete', { method: 'POST', body: { ids } }),
  },
  applicants: {
    list: (vacancyIdOrParams) => {
      const params = vacancyIdOrParams == null ? {} : (typeof vacancyIdOrParams === 'string' ? { vacancy_id: vacancyIdOrParams } : vacancyIdOrParams);
      const qs = new URLSearchParams();
      if (params.vacancy_id) qs.set('vacancy_id', params.vacancy_id);
      if (params.date_from) qs.set('date_from', params.date_from);
      if (params.date_to) qs.set('date_to', params.date_to);
      return rec(`/applicants${qs.toString() ? `?${qs.toString()}` : ''}`);
    },
    create: (body) => rec('/applicants', { method: 'POST', body }),
    update: (id, body) => rec(`/applicants/${id}`, { method: 'PATCH', body }),
    sendInterviewInvite: (id, body) => rec(`/applicants/${id}/send-interview-invite`, { method: 'POST', body }),
    sendRegret: (id) => rec(`/applicants/${id}/send-regret`, { method: 'POST' }),
  },
  interviewQuestions: {
    list: (vacancyId) => rec(`/interview-questions${vacancyId ? `?vacancy_id=${encodeURIComponent(vacancyId)}` : ''}`),
    create: (body) => rec('/interview-questions', { method: 'POST', body }),
    update: (id, body) => rec(`/interview-questions/${id}`, { method: 'PATCH', body }),
    delete: (id) => rec(`/interview-questions/${id}`, { method: 'DELETE' }),
  },
  myIntendedQuestions: {
    list: () => rec('/my-intended-questions'),
    add: (questionId) => rec('/my-intended-questions', { method: 'POST', body: { question_id: questionId } }),
    remove: (questionId) => rec(`/my-intended-questions/${questionId}`, { method: 'DELETE' }),
  },
  panelSessions: {
    list: (params) => rec(`/panel-sessions${new URLSearchParams(params).toString() ? `?${new URLSearchParams(params)}` : ''}`),
    create: (body) => rec('/panel-sessions', { method: 'POST', body }),
    update: (id, body) => rec(`/panel-sessions/${id}`, { method: 'PATCH', body }),
    getScores: (id) => rec(`/panel-sessions/${id}/scores`),
    saveScore: (sessionId, body) => rec(`/panel-sessions/${sessionId}/scores`, { method: 'POST', body }),
  },
  results: {
    list: (vacancyId) => rec(`/results${vacancyId ? `?vacancy_id=${encodeURIComponent(vacancyId)}` : ''}`),
  },
  appointments: {
    list: (vacancyId) => rec(`/appointments${vacancyId ? `?vacancy_id=${encodeURIComponent(vacancyId)}` : ''}`),
    create: (body) => rec('/appointments', { method: 'POST', body }),
    update: (id, body) => rec(`/appointments/${id}`, { method: 'PATCH', body }),
    sendCongratulations: (id) => rec(`/appointments/${id}/send-congratulations`, { method: 'POST' }),
    sendRegret: (id) => rec(`/appointments/${id}/send-regret`, { method: 'POST' }),
  },
  invites: {
    list: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return rec(`/invites${q ? `?${q}` : ''}`);
    },
    create: (body) => rec('/invites', { method: 'POST', body }),
  },
  externalApplications: {
    list: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return rec(`/external-applications${q ? `?${q}` : ''}`);
    },
    get: (id) => rec(`/external-applications/${id}`),
    update: (id, body) => rec(`/external-applications/${id}`, { method: 'PATCH', body }),
    score: (id) => rec(`/external-applications/${id}/score`, { method: 'POST' }),
    acceptToScreening: (id) => rec(`/external-applications/${id}/accept-to-screening`, { method: 'POST' }),
    downloadUrl: (id, field) => `${API}/recruitment/external-applications/${id}/download/${field}`,
  },
  myTabs: () => rec('/my-tabs'),
  tabPermissions: {
    list: () => rec('/tab-permissions'),
    grant: (body) => rec('/tab-permissions', { method: 'POST', body }),
    revoke: (params) => rec(`/tab-permissions?${new URLSearchParams(params)}`, { method: 'DELETE' }),
  },
  panelMembers: {
    list: () => rec('/panel-members'),
    options: () => rec('/panel-members/options'),
    add: (body) => rec('/panel-members', { method: 'POST', body }),
    remove: (userId) => rec(`/panel-members/${userId}`, { method: 'DELETE' }),
  },
  panelAddQuestion: (body) => rec('/panel/add-question', { method: 'POST', body }),
};

const pm = (path, options = {}) => request(`/profile-management${path}`, options);

export const profileManagement = {
  schedules: {
    list: (userId) => pm(`/schedules${userId ? `?user_id=${userId}` : ''}`),
    create: (body) => pm('/schedules', { method: 'POST', body: JSON.stringify(body) }),
    generateBulk: (body) => pm('/schedules/bulk', { method: 'POST', body: JSON.stringify(body) }),
    deleteAllForUser: (userId) => pm(`/schedules/by-user/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
    getEntries: (id) => pm(`/schedules/${id}/entries`),
    addEntries: (id, entries) => pm(`/schedules/${id}/entries`, { method: 'POST', body: JSON.stringify({ entries }) }),
  },
  mySchedule: (params) => {
    const q = new URLSearchParams(params).toString();
    return pm(`/my-schedule${q ? `?${q}` : ''}`);
  },
  /** Colleagues' shifts for the month (tenant peers). Pass user_ids: string[] to filter who appears on the calendar. */
  myScheduleColleagues: ({ month, year, user_ids = [] }) => {
    const q = new URLSearchParams({ month: String(month), year: String(year) });
    if (user_ids.length) q.set('user_ids', user_ids.join(','));
    return pm(`/my-schedule/colleagues?${q}`);
  },
  leave: {
    balance: (year) => pm(`/leave/balance${year != null ? `?year=${year}` : ''}`),
    applications: () => pm('/leave/applications'),
    create: (body) => pm('/leave/applications', { method: 'POST', body: JSON.stringify(body) }),
    addAttachments: (id, files) => {
      const formData = new FormData();
      Array.from(files).forEach((f) => formData.append('files', f));
      return fetch(`${API}/profile-management/leave/applications/${id}/attachments`, { method: 'POST', body: formData, credentials: 'include' })
        .then((res) => res.json().then((data) => (res.ok ? data : Promise.reject(new Error(data.error || res.statusText)))));
    },
    pending: () => pm('/leave/pending'),
    review: (id, body) => pm(`/leave/applications/${id}/review`, { method: 'PATCH', body: JSON.stringify(body) }),
    types: () => pm('/leave/types'),
    createType: (body) => pm('/leave/types', { method: 'POST', body: JSON.stringify(body) }),
    history: () => pm('/leave/applications/history'),
  },
  documents: {
    list: (userId) => pm(`/documents${userId ? `?userId=${userId}` : ''}`),
    upload: (file, category) => {
      const formData = new FormData();
      formData.append('file', file);
      if (category) formData.append('category', category);
      return fetch(`${API}/profile-management/documents`, { method: 'POST', body: formData, credentials: 'include' })
        .then((res) => res.json().then((data) => (res.ok ? data : Promise.reject(new Error(data.error || res.statusText)))));
    },
    downloadUrl: (id) => `${API}/profile-management/documents/${id}/download`,
    library: () => pm('/documents/library'),
  },
  employeeDetails: {
    get: () => pm('/employee-details'),
    save: (body) => pm('/employee-details', { method: 'PUT', body: JSON.stringify(body) }),
    uploadAttachments: (files, folderName) => {
      const formData = new FormData();
      Array.from(files).forEach((f) => formData.append('files', f));
      if (folderName) formData.append('folder_name', folderName);
      return fetch(`${API}/profile-management/employee-details/attachments`, { method: 'POST', body: formData, credentials: 'include' }).then((res) =>
        res.json().then((data) => (res.ok ? data : Promise.reject(new Error(data.error || res.statusText))))
      );
    },
    updateAttachmentFolder: (id, folder_name) =>
      pm(`/employee-details/attachments/${encodeURIComponent(id)}/folder`, { method: 'PATCH', body: JSON.stringify({ folder_name }) }),
    bulkAttachmentFolders: (attachment_ids, folder_name) =>
      pm('/employee-details/attachments/bulk-folder', { method: 'PATCH', body: JSON.stringify({ attachment_ids, folder_name }) }),
    deleteAttachment: (id) => pm(`/employee-details/attachments/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    downloadUrl: (id) => `${API}/profile-management/employee-details/attachments/${encodeURIComponent(id)}/download`,
    directory: () => pm('/employee-details/directory'),
    getForUser: (userId) => pm(`/employee-details/user/${encodeURIComponent(userId)}`),
  },
  warnings: { list: () => pm('/warnings'), listAll: () => pm('/warnings/all'), create: (body) => pm('/warnings', { method: 'POST', body: JSON.stringify(body) }) },
  rewards: { list: () => pm('/rewards'), listAll: () => pm('/rewards/all'), create: (body) => pm('/rewards', { method: 'POST', body: JSON.stringify(body) }) },
  queries: {
    list: () => pm('/queries'),
    create: (body) => pm('/queries', { method: 'POST', body: JSON.stringify(body) }),
    listAll: () => pm('/queries/all'),
    respond: (id, body) => pm(`/queries/${id}/respond`, { method: 'PATCH', body: JSON.stringify(body) }),
  },
  evaluations: {
    list: () => pm('/evaluations'),
    listAll: () => pm('/evaluations/all'),
    create: (body) => pm('/evaluations', { method: 'POST', body: JSON.stringify(body) }),
    controllerList: () => pm('/evaluations/controller-evaluations'),
    controllerGet: (id) => pm(`/evaluations/controller-evaluations/${id}`),
  },
  pip: {
    list: () => pm('/pip'),
    listAll: () => pm('/pip/all'),
    create: (body) => pm('/pip', { method: 'POST', body: JSON.stringify(body) }),
    getProgress: (id) => pm(`/pip/${id}/progress`),
    addProgress: (id, body) => pm(`/pip/${id}/progress`, { method: 'POST', body: JSON.stringify(body) }),
  },
  scheduleEvents: {
    list: (month, year) => pm(`/schedule-events${month != null && year != null ? `?month=${month}&year=${year}` : ''}`),
    create: (body) => pm('/schedule-events', { method: 'POST', body: JSON.stringify(body) }),
  },
  shiftSwaps: {
    colleagueEntries: (userId, month, year) => {
      const q = new URLSearchParams({ user_id: userId, month: String(month), year: String(year) });
      return pm(`/shift-swaps/colleague-entries?${q}`);
    },
    my: (month, year) => {
      const q = new URLSearchParams({ month: String(month), year: String(year) });
      return pm(`/shift-swaps/my?${q}`);
    },
    create: (body) => pm('/shift-swaps', { method: 'POST', body: JSON.stringify(body) }),
    cancel: (id) => pm(`/shift-swaps/${id}/cancel`, { method: 'PATCH', body: JSON.stringify({}) }),
    peerReview: (id, body) => pm(`/shift-swaps/${id}/peer`, { method: 'PATCH', body: JSON.stringify(body) }),
    managementQueue: (status) => pm(`/shift-swaps/management-queue${status ? `?status=${encodeURIComponent(status)}` : ''}`),
    managementReview: (id, body) => pm(`/shift-swaps/${id}/management`, { method: 'PATCH', body: JSON.stringify(body) }),
  },
  tenantUsers: () => pm('/users/tenant'),
};

const sc = (path, options = {}) => request(`/shift-clock${path}`, options);

/** Shift clock-in, breaks, overtime — Profile & Management. */
export const shiftClock = {
  ccAccess: () => sc('/cc-access'),
  myStatus: () => sc('/my-status'),
  startSession: (body) => sc('/session', { method: 'POST', body: JSON.stringify(body) }),
  clockOut: (id, body) => sc(`/session/${encodeURIComponent(id)}/clock-out`, { method: 'PATCH', body: JSON.stringify(body || {}) }),
  /** Void mistaken clock-in (active session only). */
  cancelSession: (id) => sc(`/session/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  startBreak: (sessionId, body) =>
    sc(`/session/${encodeURIComponent(sessionId)}/break/start`, { method: 'POST', body: JSON.stringify(body) }),
  endBreak: (sessionId, breakId, body = {}) =>
    sc(`/session/${encodeURIComponent(sessionId)}/break/${encodeURIComponent(breakId)}/end`, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),
  myHistory: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return sc(`/my-history${q ? `?${q}` : ''}`);
  },
  teamDay: (date, opts = {}) => {
    const q = new URLSearchParams();
    if (date) q.set('date', date);
    if (opts.scope) q.set('scope', opts.scope);
    const qs = q.toString();
    return sc(`/team-day${qs ? `?${qs}` : ''}`);
  },
  managementSessions: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return sc(`/management/sessions${q ? `?${q}` : ''}`);
  },
  requestLocationAuth: (sessionId, body) =>
    sc(`/session/${encodeURIComponent(sessionId)}/location-auth-request`, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),
};

const ss = (path, options = {}) => request(`/shift-score${path}`, options);

/** Shift productivity score — shift clock in/out vs roster, Tasks tracker assignments, CC evaluations/reports/team progress (rolling window). */
export const shiftScore = {
  me: (params = {}) => {
    const q = new URLSearchParams();
    if (params.days != null) q.set('days', String(params.days));
    const qs = q.toString();
    return ss(`/me${qs ? `?${qs}` : ''}`);
  },
  tenant: (params = {}) => {
    const q = new URLSearchParams();
    if (params.days != null) q.set('days', String(params.days));
    const qs = q.toString();
    return ss(`/tenant${qs ? `?${qs}` : ''}`);
  },
};

const tg = (path, options = {}) => request(`/team-goals${path}`, options);

/** Department strategy, shift/team objectives, team leader questionnaires, management ratings. */
export const teamGoals = {
  getDepartment: () => tg('/department'),
  putDepartment: (body) => tg('/department', { method: 'PUT', body: JSON.stringify(body) }),
  /** Profile dashboard: team-scoped objectives only (read-only). */
  listProfileTeamObjectives: () => tg('/profile/team-objectives'),
  listObjectives: () => tg('/objectives'),
  createObjective: (body) => tg('/objectives', { method: 'POST', body: JSON.stringify(body) }),
  patchObjective: (id, body) => tg(`/objectives/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  listTeamLeaders: () => tg('/team-leaders'),
  assignTeamLeader: (user_id) => tg('/team-leaders', { method: 'POST', body: JSON.stringify({ user_id }) }),
  removeTeamLeader: (userId) => tg(`/team-leaders/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
  scheduleCohort: (work_date, shift_type = 'day') => {
    const q = new URLSearchParams();
    q.set('work_date', work_date);
    q.set('shift_type', shift_type || 'day');
    return tg(`/schedule-cohort?${q}`);
  },
  postRating: (body) => tg('/management/ratings', { method: 'POST', body: JSON.stringify(body) }),
  listRatings: (params = {}) => {
    const q = new URLSearchParams();
    if (params.days != null) q.set('days', String(params.days));
    const qs = q.toString();
    return tg(`/management/ratings${qs ? `?${qs}` : ''}`);
  },
  listManagementQuestionnaires: (params = {}) => {
    const q = new URLSearchParams();
    if (params.days != null) q.set('days', String(params.days));
    const qs = q.toString();
    return tg(`/management/team-leader-questionnaires${qs ? `?${qs}` : ''}`);
  },
  teamScoresSummary: (params = {}) => {
    const q = new URLSearchParams();
    if (params.leader_id) q.set('leader_id', params.leader_id);
    const qs = q.toString();
    return tg(`/team-scores/summary${qs ? `?${qs}` : ''}`);
  },
  teamLeaderMe: () => tg('/team-leader/me'),
  /** work_date YYYY-MM-DD; shift_type 'auto' | 'day' | 'night' — colleagues on that shift (excl. leader). */
  teamLeaderTouchpointRoster: (work_date, shift_type = 'auto') => {
    const q = new URLSearchParams();
    q.set('work_date', work_date);
    q.set('shift_type', shift_type || 'auto');
    return tg(`/team-leader/touchpoint-roster?${q}`);
  },
  postQuestionnaire: (body) => tg('/team-leader/questionnaire', { method: 'POST', body: JSON.stringify(body) }),
  listMyQuestionnaires: () => tg('/team-leader/questionnaires'),
};

const pev = (path, options = {}) => request(`/performance-evaluations${path}`, options);

/** 360-style performance evaluations, management trends, auditor workflow. */
export const performanceEvaluations = {
  getCurrentEvaluationPeriod: () => pev('/evaluation-periods/current'),
  listEvaluationPeriods: () => pev('/evaluation-periods'),
  openEvaluationPeriod: (body) => pev('/evaluation-periods/open', { method: 'POST', body: JSON.stringify(body || {}) }),
  closeEvaluationPeriod: (id) =>
    pev(`/evaluation-periods/${encodeURIComponent(id)}/close`, { method: 'POST', body: JSON.stringify({}) }),
  listEvaluateeOptions: () => pev('/evaluatee-options'),
  listQuestions: () => pev('/questions'),
  createQuestion: (body) => pev('/questions', { method: 'POST', body: JSON.stringify(body) }),
  patchQuestion: (id, body) => pev(`/questions/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteQuestion: (id) => pev(`/questions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  listMySubmissions: () => pev('/my-submissions'),
  aboutMe: () => pev('/about-me'),
  submissionDetail: (id) => pev(`/submissions/${encodeURIComponent(id)}/detail`),
  submit: (body) => pev('/submissions', { method: 'POST', body: JSON.stringify(body) }),
  saveEvaluateeImprovement: (body) => pev('/improvement/evaluatee', { method: 'POST', body: JSON.stringify(body) }),
  trends: (params = {}) => {
    const q = new URLSearchParams();
    if (params.days != null) q.set('days', String(params.days));
    const qs = q.toString();
    return pev(`/trends${qs ? `?${qs}` : ''}`);
  },
  getManagementWorkspace: () => pev('/management/workspace'),
  putManagementWorkspace: (body) => pev('/management/workspace', { method: 'PUT', body: JSON.stringify(body) }),
  auditorQueue: () => pev('/auditor/queue'),
  createAuditorReview: (body) => pev('/auditor/reviews', { method: 'POST', body: JSON.stringify(body) }),
  listAuditorReviews: () => pev('/auditor/reviews'),
  patchAuditorFollowUp: (id, body) =>
    pev(`/auditor/reviews/${encodeURIComponent(id)}/follow-up`, { method: 'PATCH', body: JSON.stringify(body) }),
  listManagementAuditorReviews: () => pev('/management/auditor-reviews'),
  patchManagementAuditorResponse: (id, body) =>
    pev(`/management/auditor-reviews/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
};

const uc = (path, options = {}) => request(`/user-career${path}`, options);

/** Personal career plan, milestones, CV (Profile). */
export const userCareer = {
  getPlan: () => uc('/plan'),
  putPlan: (body) => uc('/plan', { method: 'PUT', body: JSON.stringify(body) }),
  listMilestones: () => uc('/milestones'),
  createMilestone: (body) => uc('/milestones', { method: 'POST', body: JSON.stringify(body) }),
  patchMilestone: (id, body) => uc(`/milestones/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteMilestone: (id) => uc(`/milestones/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  listCv: () => uc('/cv'),
  uploadCv: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return fetch(`${getApiBase()}/user-career/cv`, { method: 'POST', body: formData, credentials: 'include' }).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      return data;
    });
  },
  cvDownloadUrl: (id) => `${getApiBase()}/user-career/cv/${encodeURIComponent(id)}/download`,
  deleteCv: (id) => uc(`/cv/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

const acc = (path, options = {}) => request(`/accounting${path}`, options);

export const accounting = {
  companySettings: {
    get: () => acc('/company-settings'),
    update: (body) => acc('/company-settings', { method: 'PATCH', body: JSON.stringify(body) }),
    uploadLogo: (file) => {
      const formData = new FormData();
      formData.append('logo', file);
      return fetch(`${API}/accounting/company-settings/logo`, { method: 'POST', body: formData, credentials: 'include' })
        .then((res) => res.json().then((data) => (res.ok ? data : Promise.reject(new Error(data.error || res.statusText)))));
    },
    logoUrl: () => `${API}/accounting/company-settings/logo`,
  },
  library: {
    list: () => acc('/library'),
    upload: (file) => {
      const formData = new FormData();
      formData.append('file', file);
      return fetch(`${API}/accounting/library`, { method: 'POST', body: formData, credentials: 'include' })
        .then((res) => res.json().then((data) => (res.ok ? data : Promise.reject(new Error(data.error || res.statusText)))));
    },
    viewUrl: (filename) => `${API}/accounting/library/${encodeURIComponent(filename)}`,
  },
  customers: {
    list: () => acc('/customers'),
    get: (id) => acc(`/customers/${id}`),
    create: (body) => acc('/customers', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => acc(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id) => acc(`/customers/${id}`, { method: 'DELETE' }),
  },
  suppliers: {
    list: () => acc('/suppliers'),
    get: (id) => acc(`/suppliers/${id}`),
    create: (body) => acc('/suppliers', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => acc(`/suppliers/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id) => acc(`/suppliers/${id}`, { method: 'DELETE' }),
  },
  items: {
    list: () => acc('/items'),
    get: (id) => acc(`/items/${id}`),
    create: (body) => acc('/items', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => acc(`/items/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id) => acc(`/items/${id}`, { method: 'DELETE' }),
  },
  quotations: {
    list: () => acc('/quotations'),
    get: (id) => acc(`/quotations/${id}`),
    create: (body) => acc('/quotations', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => acc(`/quotations/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id) => acc(`/quotations/${id}`, { method: 'DELETE' }),
    recipients: () => acc('/quotations/recipients'),
    pdfUrl: (id) => `${API}/accounting/quotations/${id}/pdf`,
    sendEmail: (id, body) => acc(`/quotations/${id}/send-email`, { method: 'POST', body: JSON.stringify(body) }),
    createInvoice: (id) => acc(`/quotations/${id}/create-invoice`, { method: 'POST' }),
  },
  invoices: {
    list: () => acc('/invoices'),
    nextNumber: () => acc('/invoices/next-number'),
    get: (id) => acc(`/invoices/${id}`),
    create: (body) => acc('/invoices', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => acc(`/invoices/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    markPaid: (id, body) => acc(`/invoices/${id}/mark-paid`, { method: 'POST', body: JSON.stringify(body) }),
    delete: (id) => acc(`/invoices/${id}`, { method: 'DELETE' }),
    recipients: () => acc('/invoices/recipients'),
    pdfUrl: (id) => `${API}/accounting/invoices/${id}/pdf`,
    sendEmail: (id, body) => acc(`/invoices/${id}/send-email`, { method: 'POST', body: JSON.stringify(body) }),
  },
  purchaseOrders: {
    list: () => acc('/purchase-orders'),
    get: (id) => acc(`/purchase-orders/${id}`),
    create: (body) => acc('/purchase-orders', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => acc(`/purchase-orders/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id) => acc(`/purchase-orders/${id}`, { method: 'DELETE' }),
    recipients: () => acc('/purchase-orders/recipients'),
    pdfUrl: (id) => `${API}/accounting/purchase-orders/${id}/pdf`,
    sendEmail: (id, body) => acc(`/purchase-orders/${id}/send-email`, { method: 'POST', body: JSON.stringify(body) }),
  },
  statements: {
    list: () => acc('/statements'),
    get: (id) => acc(`/statements/${id}`),
    create: (body) => acc('/statements', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => acc(`/statements/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id) => acc(`/statements/${id}`, { method: 'DELETE' }),
    recipients: () => acc('/statements/recipients'),
    pdfUrl: (id) => `${API}/accounting/statements/${id}/pdf`,
    excelUrl: (id) => `${API}/accounting/statements/${id}/excel`,
    sendEmail: (id, body) => acc(`/statements/${id}/send-email`, { method: 'POST', body: JSON.stringify(body) }),
    importInvoices: (id, body) => acc(`/statements/${id}/import-invoices`, { method: 'POST', body: JSON.stringify(body) }),
    previewCustomerInvoices: (params) => {
      const q = new URLSearchParams(
        Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v != null && v !== ''))
      ).toString();
      return acc(`/statements/preview/customer-invoices?${q}`);
    },
  },
  documentation: {
    list: (params = {}) => {
      const q = new URLSearchParams(
        Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v != null && v !== ''))
      ).toString();
      return acc(`/documentation${q ? `?${q}` : ''}`);
    },
    recipients: () => acc('/documentation/recipients'),
    get: (id) => acc(`/documentation/${id}`),
    create: (body) => acc('/documentation', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => acc(`/documentation/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id) => acc(`/documentation/${id}`, { method: 'DELETE' }),
    pdfUrl: (id) => `${API}/accounting/documentation/${id}/pdf`,
    pdfDownloadUrl: (id) => `${API}/accounting/documentation/${id}/pdf-download`,
    wordTemplateDownloadUrl: (id) => `${API}/accounting/documentation/${id}/word-template-download`,
    sendEmail: (id, body) => acc(`/documentation/${id}/send-email`, { method: 'POST', body: JSON.stringify(body) }),
    versions: (id) => acc(`/documentation/${id}/versions`),
    getVersion: (id, versionId) => acc(`/documentation/${id}/versions/${versionId}`),
    restoreVersion: (id, versionId) => acc(`/documentation/${id}/restore-version/${versionId}`, { method: 'POST' }),
    uploadFigure: (file) => {
      const formData = new FormData();
      formData.append('file', file);
      return fetch(`${API}/accounting/documentation/figures/upload`, { method: 'POST', body: formData, credentials: 'include' })
        .then((res) => res.json().then((data) => (res.ok ? data : Promise.reject(new Error(data.error || res.statusText)))));
    },
  },
};
