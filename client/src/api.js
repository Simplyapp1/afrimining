// In dev, call API directly so it works even if proxy fails. Override with VITE_API_BASE in client .env.
const API =
  (typeof import.meta.env?.VITE_API_BASE === 'string' && import.meta.env.VITE_API_BASE) ||
  (import.meta.env.DEV ? 'http://localhost:3001/api' : '/api');

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
  if (!res.ok) throw new Error(res.status === 401 ? 'Please sign in again' : 'Could not download');
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
    return new Error(
      'Cannot reach the API. (1) Start the backend: npm run server (in project root). (2) If the API runs on another port, set VITE_API_BASE in client/.env (e.g. VITE_API_BASE=http://localhost:3001/api) and restart the dev server.'
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
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export const auth = {
  login: (email, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),
  switchTenant: (tenantId) => request('/auth/switch-tenant', { method: 'POST', body: JSON.stringify({ tenant_id: tenantId }) }),
  forgotPassword: (body) => request('/auth/forgot-password', { method: 'POST', body: JSON.stringify(body) }),
  resetPassword: (body) => request('/auth/reset-password', { method: 'POST', body: JSON.stringify(body) }),
};

export const users = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/users${q ? `?${q}` : ''}`);
  },
  get: (id) => request(`/users/${id}`),
  activity: (id) => request(`/users/${id}/activity`),
  create: (body) => request('/users', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => request(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  bulk: (body) => request('/users/bulk', { method: 'POST', body: JSON.stringify(body) }),
  delete: (id) => request(`/users/${id}`, { method: 'DELETE' }),
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

export const contractor = {
  context: () => request('/contractor/context'),
  trucks: {
    list: () => request('/contractor/trucks'),
    create: (body) => request('/contractor/trucks', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => request(`/contractor/trucks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    bulk: (body) => request('/contractor/trucks/bulk', { method: 'POST', body: JSON.stringify(body) }),
  },
  drivers: {
    list: () => request('/contractor/drivers'),
    create: (body) => request('/contractor/drivers', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => request(`/contractor/drivers/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    bulk: (body) => request('/contractor/drivers/bulk', { method: 'POST', body: JSON.stringify(body) }),
  },
  incidents: {
    list: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/contractor/incidents${q ? `?${q}` : ''}`);
    },
    get: (id) => request(`/contractor/incidents/${id != null ? String(id) : ''}`),
    create: (body) => request('/contractor/incidents', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => request(`/contractor/incidents/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    resolveWithDetails: (id, formData) =>
      fetch(`${API}/contractor/incidents/${id}/resolve`, {
        method: 'PATCH',
        body: formData,
        credentials: 'include',
      }).then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || res.statusText);
        return data;
      }).catch((err) => { throw wrapNetworkError(err); }),
    /** Submit offloading slip later (incident must be resolved). */
    submitOffloadingSlip: (id, formData) =>
      fetch(`${API}/contractor/incidents/${id}/offloading-slip`, {
        method: 'PATCH',
        body: formData,
        credentials: 'include',
      }).then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || res.statusText);
        return data;
      }).catch((err) => { throw wrapNetworkError(err); }),
    /** Fetch an attachment as blob (for view/download). Uses credentials. */
    getAttachmentBlob: (id, type) =>
      fetch(`${API}/contractor/incidents/${id}/attachments/${type}`, { credentials: 'include' }).then((res) => {
        if (!res.ok) throw new Error(res.status === 404 ? 'Attachment not found' : 'Failed to load attachment');
        return res.blob();
      }).catch((err) => { throw wrapNetworkError(err); }),
    createWithAttachments: (formData) =>
      fetch(`${API}/contractor/incidents`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      }).then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || res.statusText);
        return data;
      }).catch((err) => {
        throw wrapNetworkError(err);
      }),
  },
  expiries: {
    list: () => request('/contractor/expiries'),
    create: (body) => request('/contractor/expiries', { method: 'POST', body: JSON.stringify(body) }),
  },
  suspensions: {
    list: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/contractor/suspensions${q ? `?${q}` : ''}`);
    },
    create: (body) => request('/contractor/suspensions', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => request(`/contractor/suspensions/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  },
  reinstatementRequests: () => request('/contractor/reinstatement-requests'),
    reinstatementHistory: () => request('/contractor/reinstatement-history'),
  complianceRecords: {
    list: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/contractor/compliance-records${q ? `?${q}` : ''}`);
    },
    get: (id) => request(`/contractor/compliance-records/${id}`),
    respond: (id, responseText, files = null) => {
      if (files && files.length > 0) {
        const formData = new FormData();
        formData.append('responseText', responseText ?? '');
        for (let i = 0; i < files.length; i++) formData.append('attachments', files[i]);
        return fetch(`${API}/contractor/compliance-records/${id}/respond`, {
          method: 'PATCH',
          body: formData,
          credentials: 'include',
        }).then((res) => res.json().then((data) => (res.ok ? data : Promise.reject(new Error(data.error || res.statusText)))));
      }
      return request(`/contractor/compliance-records/${id}/respond`, { method: 'PATCH', body: JSON.stringify({ responseText: responseText ?? '' }) });
    },
    attachmentUrl: (inspectionId, attachmentId) => `${API}/contractor/compliance-records/${inspectionId}/attachments/${attachmentId}`,
  },
  messages: {
    list: () => request('/contractor/messages'),
    create: (body) => request('/contractor/messages', { method: 'POST', body: JSON.stringify(body) }),
    markRead: (id) => request(`/contractor/messages/${id}/read`, { method: 'PATCH' }),
  },
  routes: {
    list: () => request('/contractor/routes'),
    enrolledByTruck: (truckId) => request(`/contractor/routes/enrolled-by-truck/${encodeURIComponent(truckId)}`),
    get: (id) => request(`/contractor/routes/${id}`),
    create: (body) => request('/contractor/routes', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => request(`/contractor/routes/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id) => request(`/contractor/routes/${id}`, { method: 'DELETE' }),
    enrollTrucks: (routeId, truckIds) => request(`/contractor/routes/${routeId}/trucks`, { method: 'POST', body: JSON.stringify({ truckIds }) }),
    enrollDrivers: (routeId, driverIds) => request(`/contractor/routes/${routeId}/drivers`, { method: 'POST', body: JSON.stringify({ driverIds }) }),
    unenrollTruck: (routeId, truckId) => request(`/contractor/routes/${routeId}/trucks/${truckId}`, { method: 'DELETE' }),
    unenrollDriver: (routeId, driverId) => request(`/contractor/routes/${routeId}/drivers/${driverId}`, { method: 'DELETE' }),
  },
  rectorMyRoutes: () => request('/contractor/rector-my-routes'),
  routeFactors: {
    list: (routeId) => request(`/contractor/route-factors${routeId ? `?routeId=${encodeURIComponent(routeId)}` : ''}`),
    create: (body) => request('/contractor/route-factors', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => request(`/contractor/route-factors/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id) => request(`/contractor/route-factors/${id}`, { method: 'DELETE' }),
  },
  distributionHistory: {
    list: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/contractor/distribution-history${q ? `?${q}` : ''}`);
    },
    contractors: () => request('/contractor/distribution/contractors'),
    create: (body) => request('/contractor/distribution-history', { method: 'POST', body: JSON.stringify(body) }),
    sendEmail: (body) => request('/contractor/distribution/send-email', { method: 'POST', body: JSON.stringify(body) }),
    exportUrl: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      const API = (typeof import.meta.env?.VITE_API_BASE === 'string' && import.meta.env.VITE_API_BASE) || (import.meta.env.DEV ? 'http://localhost:3001/api' : '/api');
      return `${API}/contractor/distribution-history/export${q ? `?${q}` : ''}`;
    },
  },
  enrollment: {
    approvedTrucks: () => request('/contractor/enrollment/approved-trucks'),
    approvedDrivers: () => request('/contractor/enrollment/approved-drivers'),
    downloadFleetList: (routeId) => {
      const q = routeId ? `?routeId=${encodeURIComponent(routeId)}` : '';
      return fetch(`${API}/contractor/enrollment/fleet-list${q}`, { credentials: 'include' })
        .then((res) => {
          if (!res.ok) throw new Error('Failed to download fleet list');
          return res.blob();
        })
        .then((blob) => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'fleet-list.csv';
          a.click();
          URL.revokeObjectURL(a.href);
        });
    },
    downloadDriverList: (routeId) => {
      const q = routeId ? `?routeId=${encodeURIComponent(routeId)}` : '';
      return fetch(`${API}/contractor/enrollment/driver-list${q}`, { credentials: 'include' })
        .then((res) => {
          if (!res.ok) throw new Error('Failed to download driver list');
          return res.blob();
        })
        .then((blob) => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'driver-list.csv';
          a.click();
          URL.revokeObjectURL(a.href);
        });
    },
  },
  info: {
    get: () => request('/contractor/info'),
    update: (body) => request('/contractor/info', { method: 'PATCH', body: JSON.stringify(body) }),
  },
  subcontractors: {
    list: () => request('/contractor/subcontractors'),
    create: (body) => request('/contractor/subcontractors', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => request(`/contractor/subcontractors/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id) => request(`/contractor/subcontractors/${id}`, { method: 'DELETE' }),
  },
  library: {
    documentTypes: () => request('/contractor/library/document-types'),
    list: () => request('/contractor/library'),
    upload: (file, documentType = 'other') => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('document_type', documentType);
      return fetch(`${API}/contractor/library`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      }).then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || res.statusText);
        return data;
      }).catch((err) => { throw wrapNetworkError(err); });
    },
    delete: (id) => request(`/contractor/library/${id}`, { method: 'DELETE' }),
    downloadUrl: (id) => `${API}/contractor/library/${id}/download`,
  },
};

export const commandCentre = {
  myTabs: () => request('/command-centre/my-tabs'),
  permissions: () => request('/command-centre/permissions'),
  grantPermission: (userId, tabId) => request('/command-centre/permissions', { method: 'POST', body: JSON.stringify({ user_id: userId, tab_id: tabId }) }),
  revokePermission: (userId, tabId) => request(`/command-centre/permissions?user_id=${encodeURIComponent(userId)}&tab_id=${encodeURIComponent(tabId)}`, { method: 'DELETE' }),
  approvers: () => request('/command-centre/approvers'),
  trends: (params = {}) => {
    const q = new URLSearchParams();
    if (params.dateFrom) q.set('dateFrom', params.dateFrom);
    if (params.dateTo) q.set('dateTo', params.dateTo);
    if (params.route) q.set('route', params.route);
    return request(`/command-centre/trends${q.toString() ? `?${q.toString()}` : ''}`);
  },
  shiftReports: {
    list: (requestsOnly) => request(`/command-centre/shift-reports${requestsOnly ? '?requests=1' : ''}`),
    listDecidedByMe: () => request('/command-centre/shift-reports?decidedByMe=1'),
    get: (id) => request(`/command-centre/shift-reports/${id}`),
    create: (body) => request('/command-centre/shift-reports', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => request(`/command-centre/shift-reports/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    submit: (id, submitted_to_user_id) => request(`/command-centre/shift-reports/${id}/submit`, { method: 'POST', body: JSON.stringify({ submitted_to_user_id }) }),
    addComment: (id, comment_text) => request(`/command-centre/shift-reports/${id}/comments`, { method: 'POST', body: JSON.stringify({ comment_text }) }),
    markCommentAddressed: (reportId, commentId) => request(`/command-centre/shift-reports/${reportId}/comments/${commentId}/addressed`, { method: 'PATCH' }),
    getEvaluation: (id) => request(`/command-centre/shift-reports/${id}/evaluation`),
    submitEvaluation: (id, body) => request(`/command-centre/shift-reports/${id}/evaluation`, { method: 'POST', body: JSON.stringify(body) }),
    requestOverride: (id) => request(`/command-centre/shift-reports/${id}/request-override`, { method: 'POST' }),
    approve: (id, overrideCode) => request(`/command-centre/shift-reports/${id}/approve`, { method: 'PATCH', body: JSON.stringify(overrideCode ? { override_code: overrideCode } : {}) }),
    reject: (id, overrideCode) => request(`/command-centre/shift-reports/${id}/reject`, { method: 'PATCH', body: JSON.stringify(overrideCode ? { override_code: overrideCode } : {}) }),
    provisional: (id, overrideCode) => request(`/command-centre/shift-reports/${id}/provisional`, { method: 'PATCH', body: JSON.stringify(overrideCode ? { override_code: overrideCode } : {}) }),
    revokeApproval: (id) => request(`/command-centre/shift-reports/${id}/revoke-approval`, { method: 'PATCH' }),
  },
  shiftItems: (params = {}) => {
    const q = new URLSearchParams();
    if (params.days != null) q.set('days', params.days);
    if (params.route) q.set('route', params.route);
    return request(`/command-centre/shift-items${q.toString() ? `?${q.toString()}` : ''}`);
  },
  shiftReportExport: (params = {}) => {
    const q = new URLSearchParams();
    if (params.section) q.set('section', params.section);
    if (params.dateFrom) q.set('dateFrom', params.dateFrom);
    if (params.dateTo) q.set('dateTo', params.dateTo);
    if (params.route) q.set('route', params.route);
    return request(`/command-centre/shift-report-export${q.toString() ? `?${q.toString()}` : ''}`);
  },
  library: () => request('/command-centre/library'),
  libraryDocuments: {
    list: () => request('/command-centre/library/documents'),
    upload: (file) => {
      const formData = new FormData();
      formData.append('file', file);
      const API = (typeof import.meta.env?.VITE_API_BASE === 'string' && import.meta.env.VITE_API_BASE) || (import.meta.env.DEV ? 'http://localhost:3001/api' : '/api');
      return fetch(`${API}/command-centre/library/documents`, { method: 'POST', body: formData, credentials: 'include' })
        .then((res) => res.json().then((data) => (res.ok ? data : Promise.reject(new Error(data.error || res.statusText)))));
    },
    downloadUrl: (id) => {
      const API = (typeof import.meta.env?.VITE_API_BASE === 'string' && import.meta.env.VITE_API_BASE) || (import.meta.env.DEV ? 'http://localhost:3001/api' : '/api');
      return `${API}/command-centre/library/documents/${id}/download`;
    },
  },
  investigationReports: {
    list: (approvedOnly) => request(`/command-centre/investigation-reports${approvedOnly ? '?approved=1' : ''}`),
    create: (body) => request('/command-centre/investigation-reports', { method: 'POST', body: JSON.stringify(body) }),
    approve: (id) => request(`/command-centre/investigation-reports/${id}/approve`, { method: 'PATCH' }),
  },
  complianceInspections: {
    list: () => request('/command-centre/compliance-inspections'),
    create: (body) => request('/command-centre/compliance-inspections', { method: 'POST', body: JSON.stringify(body) }),
    reply: (id, replyText) => request(`/command-centre/compliance-inspections/${id}/reply`, { method: 'PATCH', body: JSON.stringify({ replyText }) }),
    attachmentUrl: (inspectionId, attachmentId) => `${API}/command-centre/compliance-inspections/${inspectionId}/attachments/${attachmentId}`,
  },
  suspendTruck: (truckId, reason, options = {}) => request('/command-centre/suspend-truck', {
    method: 'POST',
    body: JSON.stringify({
      truck_id: truckId,
      reason: reason || undefined,
      permanent: options.permanent !== false,
      duration_days: options.duration_days ?? undefined,
    }),
  }),
  suspensions: {
    list: (status) => request(`/command-centre/suspensions${status ? `?status=${encodeURIComponent(status)}` : ''}`),
    reinstate: (suspensionId) => request('/command-centre/reinstate-suspension', { method: 'POST', body: JSON.stringify({ suspensionId }) }),
  },
  fleetApplications: {
    list: (status) => request(`/command-centre/fleet-applications${status ? `?status=${encodeURIComponent(status)}` : ''}`),
    get: (id) => request(`/command-centre/fleet-applications/${id}`),
    approve: (id) => request(`/command-centre/fleet-applications/${id}/approve`, { method: 'PATCH' }),
    decline: (id, declineReason) => request(`/command-centre/fleet-applications/${id}/decline`, { method: 'PATCH', body: JSON.stringify({ decline_reason: declineReason }) }),
  },
  fleetIntegration: {
    list: (params = {}) => {
      const q = new URLSearchParams();
      if (params.tenantId) q.set('tenantId', params.tenantId);
      return request(`/command-centre/fleet-integration${q.toString() ? `?${q.toString()}` : ''}`);
    },
  },
  contractorsDetails: () => request('/command-centre/contractors-details'),
  breakdowns: {
    tenants: () => request('/command-centre/breakdowns/tenants'),
    list: (params = {}) => {
      const q = new URLSearchParams();
      if (params.resolved !== undefined && params.resolved !== '') q.set('resolved', params.resolved);
      if (params.dateFrom) q.set('dateFrom', params.dateFrom);
      if (params.dateTo) q.set('dateTo', params.dateTo);
      if (params.type) q.set('type', params.type);
      if (params.severity) q.set('severity', params.severity);
      if (params.tenantId) q.set('tenantId', params.tenantId);
      return request(`/command-centre/breakdowns${q.toString() ? `?${q.toString()}` : ''}`);
    },
    get: (id) => request(`/command-centre/breakdowns/${id}`),
    resolve: (id, resolutionNote) =>
      request(`/command-centre/breakdowns/${id}/resolve`, {
        method: 'PATCH',
        body: JSON.stringify({ resolution_note: resolutionNote }),
      }),
    attachmentUrl: (id, type) => `${API}/command-centre/breakdowns/${id}/attachments/${type}`,
  },
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
  attachmentDownloadUrl: (id, attachmentId) => `${API}/tasks/${id}/attachments/${attachmentId}/download`,
  tenantUsers: () => request('/tasks/users/tenant'),
};

const pm = (path, options = {}) => request(`/profile-management${path}`, options);

export const profileManagement = {
  schedules: {
    list: (userId) => pm(`/schedules${userId ? `?user_id=${userId}` : ''}`),
    create: (body) => pm('/schedules', { method: 'POST', body: JSON.stringify(body) }),
    generateBulk: (body) => pm('/schedules/bulk', { method: 'POST', body: JSON.stringify(body) }),
    getEntries: (id) => pm(`/schedules/${id}/entries`),
    addEntries: (id, entries) => pm(`/schedules/${id}/entries`, { method: 'POST', body: JSON.stringify({ entries }) }),
  },
  mySchedule: (params) => {
    const q = new URLSearchParams(params).toString();
    return pm(`/my-schedule${q ? `?${q}` : ''}`);
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
  tenantUsers: () => pm('/users/tenant'),
};
