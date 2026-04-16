/**
 * App calendar timezone (default South Africa, SAST, no DST).
 * Server: set APP_TIMEZONE to an IANA zone if needed (e.g. Africa/Johannesburg).
 */

const DEFAULT_TZ = 'Africa/Johannesburg';

export function getAppTimeZone() {
  const z = (process.env.APP_TIMEZONE || DEFAULT_TZ).trim();
  return z || DEFAULT_TZ;
}

/** YYYY-MM-DD for the instant `date` in the app calendar zone. */
export function toYmdInAppZone(date = new Date()) {
  const tz = getAppTimeZone();
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch (_) {}
  return date.toISOString().slice(0, 10);
}

export function todayYmd() {
  return toYmdInAppZone(new Date());
}

/** Pure Gregorian calendar YYYY-MM-DD plus/minus whole days. */
export function addCalendarDays(ymd, deltaDays) {
  const s = String(ymd || '').slice(0, 10);
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return todayYmd();
  const u = Date.UTC(y, m - 1, d + deltaDays);
  return new Date(u).toISOString().slice(0, 10);
}

export function yesterdayYmd() {
  return addCalendarDays(todayYmd(), -1);
}

/** First / last calendar day of a wall month (year, monthIndex0 = 0..11). Independent of DST. */
export function calendarMonthStartYmd(year, monthIndex0) {
  const y = Number(year);
  const m = Number(monthIndex0);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return todayYmd();
  return `${String(y).padStart(4, '0')}-${String(m + 1).padStart(2, '0')}-01`;
}

export function calendarMonthEndYmd(year, monthIndex0) {
  const y = Number(year);
  const m = Number(monthIndex0);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return todayYmd();
  const d = new Date(Date.UTC(y, m + 1, 0));
  return d.toISOString().slice(0, 10);
}

/** Current wall year and month index (0–11) in the app zone. */
export function wallMonthYearInAppZone(date = new Date()) {
  const ymd = toYmdInAppZone(date);
  const [ys, ms] = ymd.split('-');
  return { year: parseInt(ys, 10), monthIndex0: parseInt(ms, 10) - 1 };
}

export function addCalendarMonths(ymd, deltaMonths) {
  const s = String(ymd || '').slice(0, 10);
  const [y0, m0, d0] = s.split('-').map(Number);
  if (!y0 || !m0 || !d0) return todayYmd();
  const u = new Date(Date.UTC(y0, m0 - 1 + deltaMonths, 1));
  const y = u.getUTCFullYear();
  const m = u.getUTCMonth();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const day = Math.min(d0, last);
  return new Date(Date.UTC(y, m, day)).toISOString().slice(0, 10);
}

export function hourInAppZone(date = new Date()) {
  const tz = getAppTimeZone();
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: 'numeric',
      hour12: false,
    }).formatToParts(date);
    return Number(parts.find((p) => p.type === 'hour')?.value);
  } catch (_) {
    return date.getHours();
  }
}

export function isEarlyMorningInAppZone() {
  const h = hourInAppZone(new Date());
  return Number.isFinite(h) && h >= 0 && h < 6;
}

/** Normalize DB date / ISO string to YYYY-MM-DD in app zone for instants; preserve date-only strings. */
export function toYmdFromDbOrString(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'string') {
    const t = v.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  }
  if (v instanceof Date && !Number.isNaN(v.getTime())) return toYmdInAppZone(v);
  const t = new Date(v);
  return Number.isNaN(t.getTime()) ? '' : toYmdInAppZone(t);
}

export function daysInCalendarMonth(year, monthIndex0) {
  const y = Number(year);
  const m = Number(monthIndex0);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return 31;
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}

export function startPadForCalendarMonth(year, monthIndex0) {
  const ymd = calendarMonthStartYmd(year, monthIndex0);
  const tz = getAppTimeZone();
  const d = new Date(`${ymd}T12:00:00.000Z`);
  const w = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(d);
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const i = names.indexOf(w);
  return i >= 0 ? i : 0;
}

export function isWeekendYmd(ymd) {
  const tz = getAppTimeZone();
  const s = String(ymd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T12:00:00.000Z`);
  const w = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(d);
  return w === 'Sat' || w === 'Sun';
}
