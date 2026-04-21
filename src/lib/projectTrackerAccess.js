/**
 * Management-area modules that share the same implicit page access (tasks / management / users / tenants).
 * Keep in sync with client/src/lib/pageAccess.js.
 */
const SURROGATE_PAGE_IDS = ['project_tracker', 'resources_register'];

const IMPLICIT_ROLES = ['tasks', 'management', 'users', 'tenants'];

export function rolesAllowManagementSurrogateAccess(roleNorm, pageId) {
  const pid = String(pageId || '').toLowerCase();
  if (!SURROGATE_PAGE_IDS.includes(pid)) return false;
  if (roleNorm.includes(pid)) return true;
  return IMPLICIT_ROLES.some((r) => roleNorm.includes(r));
}

/** @deprecated use rolesAllowManagementSurrogateAccess(roleNorm, 'project_tracker') */
export function rolesAllowProjectTrackerAccess(pageRoleIds) {
  const norm = (Array.isArray(pageRoleIds) ? pageRoleIds : [])
    .map((r) => String(r || '').toLowerCase().trim())
    .filter(Boolean);
  return rolesAllowManagementSurrogateAccess(norm, 'project_tracker');
}
