/** Path -> page_id for main app pages. Must match backend PAGE_IDS. */
export const PATH_PAGE_IDS = {
  '/users': 'users',
  '/tenants': 'tenants',
  '/contractor': 'contractor',
  '/command-centre': 'command_centre',
  '/access-management': 'access_management',
  '/rector': 'rector',
  '/tasks': 'tasks',
  '/profile': 'profile',
  '/management': 'management',
  '/recruitment': 'recruitment',
  '/letters': 'letters',
  '/accounting-management': 'accounting_management',
};

export const ALL_PATHS_ORDER = ['/profile', '/management', '/users', '/tenants', '/contractor', '/command-centre', '/access-management', '/rector', '/tasks', '/recruitment', '/letters', '/accounting-management'];

/**
 * Whether the user can access the given page.
 * Super_admin, tenant_admin, enterprise plan: all. No page_roles assigned: all (legacy).
 * Otherwise only assigned pages (case-insensitive id match).
 */
export function canAccessPage(user, pageId) {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  if (user.role === 'tenant_admin') return true;
  if (String(user.tenant_plan || '').toLowerCase() === 'enterprise') return true;
  const roles = user.page_roles;
  if (!roles || roles.length === 0) return true;
  const pid = String(pageId).toLowerCase();
  return roles.some((r) => String(r).toLowerCase() === pid);
}

/** First path the user is allowed to access, or /profile as fallback. */
export function getFirstAllowedPath(user) {
  return ALL_PATHS_ORDER.find((p) => canAccessPage(user, PATH_PAGE_IDS[p])) || '/profile';
}
