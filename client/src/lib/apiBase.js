/**
 * Resolved API base URL (includes `/api`). In production builds, never use loopback —
 * a mistaken `VITE_API_BASE=http://localhost:3001/api` in client/.env would bake into
 * the bundle and break https://your-domain (browser cannot reach the developer's PC).
 */
export function getApiBase() {
  const raw = typeof import.meta.env?.VITE_API_BASE === 'string' ? import.meta.env.VITE_API_BASE.trim() : '';
  if (raw) {
    if (!import.meta.env.DEV && /localhost|127\.0\.0\.1|^https?:\/\/0\.0\.0\.0/i.test(raw)) {
      console.warn(
        '[api] Ignoring VITE_API_BASE pointing to loopback in a production build. Using same-origin /api. Remove VITE_API_BASE from client/.env for same-host deploys, or set it to your real API URL (https://…/api).'
      );
      return '/api';
    }
    return raw;
  }
  return import.meta.env.DEV ? 'http://localhost:3001/api' : '/api';
}
