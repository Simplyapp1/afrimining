/** Path -> page_id for main app pages. Must match backend PAGE_IDS. */
export const PATH_PAGE_IDS = {
  '/users': 'users',
  '/tenants': 'tenants',
  '/profile': 'profile',
  '/management': 'management',
  '/tasks-tracker': 'tasks',
  '/project-tracker': 'project_tracker',
  '/resources-register': 'resources_register',
  '/research': 'research',
  '/contractor-management': 'contractor_management',
  '/recruitment': 'recruitment',
  '/accounting-management': 'accounting_management',
  '/team-leader-admin': 'team_leader_admin',
  '/performance-evaluations': 'performance_evaluations',
  '/auditor': 'auditor',
};

export const ALL_PATHS_ORDER = [
  '/profile',
  '/team-leader-admin',
  '/performance-evaluations',
  '/auditor',
  '/management',
  '/tasks-tracker',
  '/project-tracker',
  '/resources-register',
  '/research',
  '/contractor-management',
  '/users',
  '/tenants',
  '/recruitment',
  '/accounting-management',
];

/**
 * Whether the user can access the given page.
 * Only super_admin sees all screens. Everyone else (including tenant_admin and enterprise tenants) needs page_id in page_roles.
 */
function normalizedPageRoles(user) {
  const raw = user?.page_roles;
  if (Array.isArray(raw)) return raw;
  if (raw == null) return [];
  return [raw];
}

export function canAccessPage(user, pageId) {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  const pid = String(pageId).toLowerCase();
  const roles = normalizedPageRoles(user);
  if (!roles.length) return false;
  const norm = roles.map((r) => String(r).toLowerCase());
  if (norm.includes(pid)) return true;
  /**
   * Project tracker: explicit role, or any “Management” sidebar page (users/tenants/tasks/management).
   * Keeps sidebar/API aligned with src/lib/projectTrackerAccess.js on the server.
   */
  if (
    (pid === 'project_tracker' || pid === 'resources_register' || pid === 'research') &&
    (norm.includes('tasks') || norm.includes('management') || norm.includes('users') || norm.includes('tenants'))
  ) {
    return true;
  }
  /** Contractor management: same API access as legacy contractor portal + ops roles. */
  if (pid === 'contractor_management') {
    return norm.some((r) => ['contractor', 'command_centre', 'access_management', 'rector'].includes(r));
  }
  return false;
}

/**
 * First sidebar route the user may open, or `/no-access` when their assignments do not map to any registered screen.
 */
export function getFirstAllowedPath(user) {
  return ALL_PATHS_ORDER.find((p) => canAccessPage(user, PATH_PAGE_IDS[p])) ?? '/no-access';
}
