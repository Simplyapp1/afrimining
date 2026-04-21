import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import session from 'express-session';
import cors from 'cors';
import authRoutes from './src/routes/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import tenantRoutes from './src/routes/tenants.js';
import userRoutes from './src/routes/users.js';
import testEmailRoutes from './src/routes/testEmail.js';
import profileManagementRoutes from './src/routes/profileManagement.js';
import shiftClockRoutes, { runShiftClockAlerts } from './src/routes/shiftClock.js';
import shiftScoreRoutes from './src/routes/shiftScore.js';
import recruitmentRoutes from './src/routes/recruitment.js';
import accountingRoutes from './src/routes/accounting.js';
import teamGoalsRoutes from './src/routes/teamGoals.js';
import performanceEvaluationsRoutes from './src/routes/performanceEvaluations.js';
import userCareerRoutes from './src/routes/userCareer.js';
import tasksRoutes, { runOverdueTaskNotifications, runTaskReminderNotifications } from './src/routes/tasks.js';
import projectTrackerRoutes from './src/routes/projectTracker.js';
import resourcesRegisterRoutes from './src/routes/resourcesRegister.js';
import contractorRoutes from './src/routes/contractor.js';
import { isEmailConfigured } from './src/lib/emailService.js';
import { isDbEnvConfigured } from './src/db.js';

const app = express();
// Azure App Service / reverse proxies: correct req.secure, req.ip, and secure session cookies
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3001;

function normalizeOrigin(o) {
  if (!o || typeof o !== 'string') return '';
  return o.trim().replace(/\/$/, '');
}

/** Normalize scheme + host + port for CORS (host lowercased; avoids www vs WWW mismatches). */
function canonicalOrigin(o) {
  const n = normalizeOrigin(o);
  if (!n) return '';
  try {
    const u = new URL(n);
    const host = u.hostname.toLowerCase();
    const port = u.port ? `:${u.port}` : '';
    return `${u.protocol}//${host}${port}`;
  } catch {
    return n;
  }
}

// CORS: public origins must match FRONTEND_ORIGIN / FRONTEND_ORIGINS (canonical host, etc.).
// Loopback browser origins (localhost / 127.0.0.1 / ::1, any port) are always allowed so local dev works
// even when root .env sets NODE_ENV=production.
// Split FRONTEND_ORIGIN on commas too (some portals paste multiple URLs into one field).
const extraFromEnv = [
  ...(process.env.FRONTEND_ORIGIN ? process.env.FRONTEND_ORIGIN.split(',') : []),
  ...(process.env.FRONTEND_ORIGINS ? process.env.FRONTEND_ORIGINS.split(',') : []),
].map((s) => s.trim());
const corsOriginSet = new Set(
  ['http://localhost:5173', 'http://127.0.0.1:5173', ...extraFromEnv].map(canonicalOrigin).filter(Boolean)
);

function isLoopbackOrigin(o) {
  try {
    const u = new URL(o);
    const h = u.hostname.toLowerCase();
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1';
  } catch {
    return false;
  }
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const n = canonicalOrigin(origin);
      if (corsOriginSet.has(n)) return callback(null, true);
      // Always allow browser loopback origins. Real users on https://your-domain never send these;
      // this avoids breaking local dev when root .env has NODE_ENV=production (strict prod CORS otherwise blocks non-5173 Vite ports).
      if (isLoopbackOrigin(origin)) return callback(null, true);
      if (process.env.LOG_CORS_REJECTIONS === '1' || process.env.LOG_CORS_REJECTIONS === 'true') {
        console.warn('[cors] blocked Origin:', origin, '→ canonical:', n, '| allowed count:', corsOriginSet.size);
      }
      callback(null, false);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '50mb' })); // allow large payloads e.g. progress report PDF send-email

// Same-site default is Lax. If the SPA is on a different host than the API (cross-site), set
// SESSION_COOKIE_SAMESITE=none in App Service so the browser sends the session cookie on credentialed fetches (requires HTTPS / secure cookie).
const rawSameSite = (process.env.SESSION_COOKIE_SAMESITE || 'lax').toLowerCase();
const sessionSameSite = rawSameSite === 'none' || rawSameSite === 'lax' || rawSameSite === 'strict' ? rawSameSite : 'lax';
const sessionSecure = process.env.NODE_ENV === 'production';
if (sessionSameSite === 'none' && !sessionSecure) {
  console.warn('[session] SESSION_COOKIE_SAMESITE=none requires HTTPS; using secure=false in non-production may break cookies.');
}

app.use(
  session({
    name: 'simplyapp.sid',
    secret: process.env.SESSION_SECRET || 'simplyapp-dev-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: sessionSecure,
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: sessionSameSite,
    },
  })
);

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/users', userRoutes);
app.use('/api/test-email', testEmailRoutes);
app.use('/api/profile-management', profileManagementRoutes);
app.use('/api/shift-clock', shiftClockRoutes);
app.use('/api/shift-score', shiftScoreRoutes);
app.use('/api/recruitment', recruitmentRoutes);
app.use('/api/accounting', accountingRoutes);
app.use('/api/team-goals', teamGoalsRoutes);
app.use('/api/performance-evaluations', performanceEvaluationsRoutes);
app.use('/api/user-career', userCareerRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/project-tracker', projectTrackerRoutes);
app.use('/api/resources-register', resourcesRegisterRoutes);
app.use('/api/contractor', contractorRoutes);

// Unmatched /api/* — Express default 404 is often non-JSON, so the client showed a bare "Not Found".
app.use('/api', (req, res) => {
  const pathLower = `${req.path || ''} ${req.originalUrl || ''}`.toLowerCase();
  const genericHint =
    'No route matched. Check the URL (including /api prefix and path), that the server process is the latest deployment, and that reverse proxies forward /api to this app.';
  res.status(404).json({
    error: 'API route not found',
    path: req.originalUrl,
    method: req.method,
    hint: genericHint,
  });
});

// Serve frontend (Vite build) when both run on same host (e.g. Render, Railway, Azure)
const clientDist = path.join(__dirname, 'client', 'dist');
const noCacheHtml = (res, filePath) => {
  if (filePath.endsWith('index.html')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
  }
};
app.use(
  express.static(clientDist, {
    setHeaders: (res, pathName) => noCacheHtml(res, pathName),
  })
);
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('Error:', err.message || err);
  if (err.stack) console.error(err.stack);
  const message = err.message || 'Internal server error';
  const isDev = process.env.NODE_ENV !== 'production';
  res.status(500).json({
    error: message,
    ...(isDev && err.stack && { detail: err.stack }),
  });
});

setInterval(() => {
  runShiftClockAlerts().catch(() => {});
}, 5 * 60 * 1000);

setInterval(() => {
  runOverdueTaskNotifications().catch(() => {});
}, 24 * 60 * 60 * 1000);

setInterval(() => {
  runTaskReminderNotifications().catch(() => {});
}, 60 * 60 * 1000);

const server = app.listen(PORT, () => {
  console.log(`Simplyapp API running at http://localhost:${PORT}`);
  runShiftClockAlerts().catch(() => {});
  runOverdueTaskNotifications().catch(() => {});
  runTaskReminderNotifications().catch(() => {});
  if (!isDbEnvConfigured()) {
    console.warn(
      'Database: no SQLSERVER_* / AZURE_SQL_* / connection string in environment — API routes that use the DB will fail. ' +
        'Set the same variables in Azure App Service → Configuration, ECS task definition, etc. (.env is not deployed).'
    );
  }
  const emailOn = isEmailConfigured();
  console.log(
    'Email:',
    emailOn
      ? 'yes (SMTP via EMAIL_USER / EMAIL_PASS @ ' + (process.env.EMAIL_HOST || 'smtp.gmail.com').trim() + ')'
      : 'no — set EMAIL_USER & EMAIL_PASS in .env (set EMAIL_ENABLED=false to force off)'
  );
  if (emailOn && !(process.env.FRONTEND_ORIGIN || process.env.APP_URL || '').trim()) {
    console.warn('Email: set FRONTEND_ORIGIN (or APP_URL) so password-reset links are not localhost-only.');
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Kill the other process or use a different PORT.`);
  } else {
    console.error('Server error:', err.message);
  }
  process.exitCode = 1;
});
