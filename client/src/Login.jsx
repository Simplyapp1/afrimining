import { useState, useEffect } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { getFirstAllowedPath } from './lib/pageAccess.js';
import { getCurrentPosition } from './lib/geolocation.js';
import AppAttributionFooter from './components/AppAttributionFooter.jsx';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [geoStatus, setGeoStatus] = useState('pending');
  const [locationError, setLocationError] = useState('');
  const [signInLocation, setSignInLocation] = useState(null);
  const { user, login } = useAuth();
  const navigate = useNavigate();

  if (user) return <Navigate to={getFirstAllowedPath(user)} replace />;

  useEffect(() => {
    let cancelled = false;
    setGeoStatus('pending');
    setLocationError('');
    getCurrentPosition()
      .then((loc) => {
        if (cancelled) return;
        setSignInLocation(loc);
        setGeoStatus('ok');
      })
      .catch((err) => {
        if (cancelled) return;
        setGeoStatus('error');
        setSignInLocation(null);
        setLocationError(
          err?.code === 1
            ? 'Location permission denied. Allow location for this site in your browser settings, then refresh the page.'
            : 'Could not read location. Check connection and permissions, then refresh.'
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (geoStatus !== 'ok' || !signInLocation) {
      setError('Location is required to sign in. Allow location permission in your browser and try again.');
      return;
    }
    setLoading(true);
    try {
      const u = await login(email.trim(), password, signInLocation);
      if (u) navigate(getFirstAllowedPath(u), { replace: true });
      else navigate('/login', { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @keyframes login-mesh {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.9; }
          33% { transform: translate(2%, -1%) scale(1.03); opacity: 1; }
          66% { transform: translate(-1%, 2%) scale(0.98); opacity: 0.85; }
        }
        @keyframes login-shimmer {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        @keyframes login-float {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-12px) rotate(1deg); }
        }
        @keyframes login-grid-pan {
          0% { transform: perspective(500px) rotateX(60deg) translateY(0); }
          100% { transform: perspective(500px) rotateX(60deg) translateY(40px); }
        }
        .login-mesh-layer { animation: login-mesh 18s ease-in-out infinite; }
        .login-orb-1 { animation: login-float 14s ease-in-out infinite; }
        .login-orb-2 { animation: login-float 11s ease-in-out infinite 2s; }
        .login-orb-3 { animation: login-float 16s ease-in-out infinite 1s; }
        .login-grid-floor {
          animation: login-grid-pan 20s linear infinite;
          background-image:
            linear-gradient(rgba(212, 175, 55, 0.07) 1px, transparent 1px),
            linear-gradient(90deg, rgba(212, 175, 55, 0.07) 1px, transparent 1px);
          background-size: 48px 48px;
        }
      `}</style>

      <div className="min-h-screen flex flex-col bg-[#020617] text-white overflow-hidden relative">
        {/* Deep atmosphere + animated mesh orbs */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-[#020617] via-[#0c1222] to-[#030f1c]" />
          <div
            className="login-mesh-layer absolute -top-1/2 -left-1/4 w-[90%] h-[90%] rounded-full blur-[120px]"
            style={{
              background:
                'radial-gradient(circle at 30% 30%, rgba(56, 189, 248, 0.45), transparent 50%), radial-gradient(circle at 70% 60%, rgba(168, 85, 247, 0.35), transparent 45%), radial-gradient(circle at 50% 80%, rgba(212, 175, 55, 0.2), transparent 40%)',
            }}
          />
          <div
            className="absolute top-1/4 right-0 w-[70%] h-[70%] rounded-full blur-[100px] opacity-60 login-mesh-layer"
            style={{
              background: 'radial-gradient(circle, rgba(14, 165, 233, 0.25), transparent 55%)',
              animationDelay: '-6s',
            }}
          />
          <div className="login-grid-floor absolute inset-x-0 bottom-0 h-[55%] origin-bottom opacity-40" />
          <div className="login-orb-1 absolute top-[8%] left-[12%] h-72 w-72 rounded-full border border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-transparent" />
          <div className="login-orb-2 absolute bottom-[20%] right-[8%] h-96 w-96 rounded-full border border-cyan-400/15 bg-gradient-to-tl from-cyan-500/10 to-transparent" />
          <div className="login-orb-3 absolute top-1/2 left-1/3 h-48 w-48 rounded-full border border-violet-400/20 bg-violet-500/5" />
          <div
            className="absolute inset-0 opacity-[0.15]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
            }}
          />
        </div>

        <div className="relative z-10 flex flex-1 flex-col lg:flex-row min-h-0">
          {/* Brand column */}
          <div className="relative flex flex-1 flex-col justify-center px-8 py-14 sm:px-12 lg:px-16 xl:px-24 lg:max-w-[52%] border-b border-white/5 lg:border-b-0 lg:border-r lg:border-white/10">
            <div className="absolute top-8 left-8 sm:left-12 lg:left-16 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-400 via-amber-600 to-orange-700 shadow-lg shadow-amber-900/40 ring-2 ring-white/20" />
              <span className="text-[11px] font-bold uppercase tracking-[0.35em] text-amber-200/90">Enterprise</span>
            </div>

            <div className="mt-16 lg:mt-0 space-y-8 max-w-xl">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-cyan-300/80 mb-3">Simplyapp</p>
                <h1 className="text-4xl sm:text-5xl xl:text-6xl font-black tracking-tight leading-[1.05]">
                  <span className="bg-gradient-to-r from-white via-cyan-100 to-amber-100 bg-clip-text text-transparent">
                    Command every
                  </span>
                  <br />
                  <span className="bg-gradient-to-r from-amber-200 via-white to-cyan-200 bg-clip-text text-transparent">
                    operation.
                  </span>
                </h1>
              </div>
              <div className="h-1 w-24 rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-transparent shadow-[0_0_24px_rgba(251,191,36,0.45)]" />
              <p className="text-base sm:text-lg text-slate-300/90 leading-relaxed font-light max-w-md">
                A premium workspace for teams that expect clarity, speed, and control—wrapped in a surface you actually want to sign in to.
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                {['Secure access', 'Live-ready', 'Built for scale'].map((label) => (
                  <span
                    key={label}
                    className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-200 backdrop-blur-sm"
                  >
                    <span className="mr-2 h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Form column */}
          <div className="relative flex flex-1 items-center justify-center px-6 py-12 sm:px-10 lg:py-16">
            <div className="absolute inset-0 bg-gradient-to-t from-[#020617] via-transparent to-transparent lg:hidden pointer-events-none" />

            <div className="relative w-full max-w-md">
              <div className="mb-8 text-center lg:text-left lg:hidden">
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-amber-300/90 mb-2">Simplyapp</p>
                <h2 className="text-2xl font-bold text-white">Welcome back</h2>
              </div>

              <div className="relative rounded-3xl p-[1px] bg-gradient-to-br from-white/25 via-amber-400/30 to-cyan-400/25 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_25px_80px_-20px_rgba(0,0,0,0.8),0_0_120px_-30px_rgba(56,189,248,0.25)]">
                <div className="rounded-3xl bg-[#0a0f1a]/85 backdrop-blur-2xl border border-white/10 overflow-hidden">
                  <div
                    className="h-1.5 w-full opacity-90"
                    style={{
                      background:
                        'linear-gradient(90deg, transparent, rgba(56,189,248,0.8), rgba(251,191,36,0.9), rgba(168,85,247,0.7), transparent)',
                      backgroundSize: '200% 100%',
                      animation: 'login-shimmer 4s linear infinite',
                    }}
                  />
                  <div className="p-8 sm:p-9">
                    <div className="hidden lg:block mb-8">
                      <p className="text-xs font-bold uppercase tracking-[0.3em] text-amber-300/90 mb-1">Access</p>
                      <h2 className="text-2xl font-bold text-white tracking-tight">Sign in to Simplyapp</h2>
                      <p className="text-sm text-slate-400 mt-1.5">Use your work email and password.</p>
                    </div>

                    <div className="flex items-center justify-between gap-3 mb-6 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Location</span>
                      <span
                        className={`text-[11px] font-bold uppercase tracking-wide ${
                          geoStatus === 'ok'
                            ? 'text-emerald-400'
                            : geoStatus === 'pending'
                              ? 'text-amber-300 animate-pulse'
                              : 'text-red-400'
                        }`}
                      >
                        {geoStatus === 'ok' ? 'Ready' : geoStatus === 'pending' ? 'Acquiring…' : 'Required'}
                      </span>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                      {locationError && (
                        <div className="text-xs text-amber-100 bg-amber-950/60 border border-amber-500/30 rounded-xl px-3 py-2.5" role="alert">
                          {locationError}
                        </div>
                      )}
                      {error && (
                        <div className="text-xs text-red-100 bg-red-950/50 border border-red-500/30 rounded-xl px-3 py-2.5" role="alert">
                          {error}
                        </div>
                      )}
                      <div className="space-y-1.5">
                        <label htmlFor="email" className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          Email
                        </label>
                        <input
                          id="email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition shadow-inner focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-500/20"
                          placeholder="you@company.com"
                          required
                          autoComplete="email"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label htmlFor="password" className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                            Password
                          </label>
                          <Link
                            to="/forgot-password"
                            className="text-[11px] font-semibold text-amber-400/90 hover:text-amber-300 focus:outline-none focus:underline"
                          >
                            Forgot password?
                          </Link>
                        </div>
                        <input
                          id="password"
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition shadow-inner focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-500/20"
                          placeholder="••••••••"
                          required
                          autoComplete="current-password"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={loading || geoStatus !== 'ok'}
                        className="relative w-full overflow-hidden rounded-xl py-3.5 text-sm font-bold uppercase tracking-widest text-[#0a1628] transition hover:brightness-110 disabled:opacity-45 disabled:hover:brightness-100 disabled:cursor-not-allowed enabled:hover:scale-[1.02] enabled:active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0f1a]"
                      >
                        <span className="absolute inset-0 bg-gradient-to-r from-amber-300 via-amber-400 to-orange-500" />
                        <span className="relative">
                          {loading ? 'Signing in…' : geoStatus === 'pending' ? 'Waiting for location…' : 'Enter workspace'}
                        </span>
                      </button>
                    </form>

                    <p className="mt-8 text-center text-xs text-slate-500">
                      New to the platform?{' '}
                      <Link to="/signup" className="font-bold text-cyan-400 hover:text-cyan-300 focus:outline-none focus:underline">
                        Create an account
                      </Link>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <AppAttributionFooter className="relative z-10 text-slate-500 border-t border-white/5 bg-black/40 backdrop-blur-md" />
      </div>
    </>
  );
}
