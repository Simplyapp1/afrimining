import { Link } from 'react-router-dom';

export default function SignUp() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl shadow-surface-200/50 border border-surface-100 p-8 text-center">
        <h1 className="text-xl font-semibold text-surface-900">Sign up</h1>
        <p className="mt-3 text-surface-500 text-sm">
          This page will be set up later. You can create an account here once it’s ready.
        </p>
        <Link
          to="/login"
          className="mt-6 inline-block text-brand-600 font-medium hover:text-brand-700 focus:outline-none focus:underline"
        >
          ← Back to sign in
        </Link>
      </div>
    </div>
  );
}
