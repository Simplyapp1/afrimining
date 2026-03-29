import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

/** Shown when the user is signed in but has no mapped app pages (e.g. only backend-only page IDs). */
export default function NoAccess() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="max-w-lg mx-auto px-6 py-16 text-center">
      <h1 className="text-xl font-semibold text-surface-900 dark:text-surface-100">No pages available</h1>
      <p className="mt-3 text-sm text-surface-600 dark:text-surface-400 leading-relaxed">
        Your account does not have access to any screens in this app, or your page assignments need to be updated by an
        administrator.
      </p>
      <button
        type="button"
        onClick={async () => {
          await logout();
          navigate('/login', { replace: true });
        }}
        className="mt-8 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
      >
        Sign out
      </button>
    </div>
  );
}
