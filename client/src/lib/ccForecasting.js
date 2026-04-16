/**
 * Command Centre desk forecasting: completed deliveries & controller throughput
 * (loads per approved shift report), from historical timeline + shift reports.
 * Uses additive Holt–Winters smoothing (trend + weekly seasonality) with
 * residual-based prediction intervals — indicative projections, not guarantees.
 */

import { addCalendarDays, addCalendarMonths, todayYmd } from './appTime.js';

function toNum(v) {
  const n = parseFloat(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** Monday = 0 … Sunday = 6 (local calendar from YYYY-MM-DD). */
export function dowMon0FromYmd(ymd) {
  const s = String(ymd || '').slice(0, 10);
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return 0;
  const dt = new Date(y, m - 1, d);
  return (dt.getDay() + 6) % 7;
}

function shiftReportDayKey(r) {
  const st = String(r?.status || '').trim().toLowerCase();
  if (st !== 'approved') return null;
  const day = String(
    r?.approved_at || r?.report_date || r?.shift_date || r?.created_at || ''
  ).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return day;
}

function deliveredFromReport(r) {
  const direct = toNum(r?.total_loads_delivered);
  if (direct > 0) return direct;
  const disp = toNum(r?.total_loads_dispatched);
  const pend = toNum(r?.total_pending_deliveries);
  return Math.max(0, disp - pend);
}

/**
 * Daily table aligned to `dates` (ordered YYYY-MM-DD).
 */
export function buildDailyDeskSeries(dates, totals, shiftReports) {
  const deliveredByDay = Object.fromEntries((dates || []).map((d) => [d, 0]));
  for (const t of totals || []) {
    const d = String(t?.date || '').slice(0, 10);
    if (deliveredByDay[d] === undefined) continue;
    deliveredByDay[d] += Math.max(0, Number(t?.delivered || 0));
  }
  const reportsByDay = { ...deliveredByDay };
  Object.keys(reportsByDay).forEach((k) => {
    reportsByDay[k] = 0;
  });
  for (const r of shiftReports || []) {
    const day = shiftReportDayKey(r);
    if (!day || reportsByDay[day] === undefined) continue;
    reportsByDay[day] += 1;
  }
  return (dates || []).map((date) => {
    const delivered = deliveredByDay[date] || 0;
    const reports = reportsByDay[date] || 0;
    const productivity = reports > 0 ? delivered / reports : delivered;
    return { date, delivered, reports, productivity };
  });
}

/**
 * Additive Holt–Winters (trend + level + season length M).
 * Classic recurrence (see Hyndman & Athanasopoulos): ℓ, b, s.
 */
function holtWintersTrain(y, M, alpha = 0.22, beta = 0.12, gamma = 0.18) {
  const n = y.length;
  if (n < M * 2) return null;
  let L = 0;
  for (let i = 0; i < M; i++) L += y[i];
  L /= M;
  let sumSecond = 0;
  for (let i = M; i < Math.min(2 * M, n); i++) sumSecond += y[i];
  const L1 = sumSecond / Math.min(M, n - M);
  let T = (L1 - L) / M;
  const S = [];
  for (let i = 0; i < M; i++) S[i] = y[i] - L;

  for (let t = M; t < n; t++) {
    const sm = S[t % M];
    const prevL = L;
    L = alpha * (y[t] - sm) + (1 - alpha) * (L + T);
    T = beta * (L - prevL) + (1 - beta) * T;
    S[t % M] = gamma * (y[t] - L) + (1 - gamma) * sm;
  }
  return { L, T, S, M, n, y };
}

function hwForecastAhead(state, h) {
  const { L, T, S, M, n } = state;
  const out = [];
  for (let step = 1; step <= h; step++) {
    const seasonal = S[(n - 1 + step) % M];
    const yhat = L + step * T + seasonal;
    out.push(Math.max(0, yhat));
  }
  return out;
}

function median(arr) {
  const a = [...arr].sort((x, y) => x - y);
  if (!a.length) return 0;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/** Robust spread for prediction bands (does not assume Gaussian errors). */
function robustForecastSpread(y, tail = 42) {
  const slice = y.slice(Math.max(0, y.length - tail));
  if (!slice.length) return 1;
  const med = median(slice);
  const mad = median(slice.map((x) => Math.abs(x - med))) || 1;
  const base = med * 0.12 + mad * 0.55;
  return Math.max(1, base, std(slice) * 0.35);
}

function std(arr) {
  const a = arr.filter((x) => Number.isFinite(x));
  if (a.length < 2) return 1;
  const m = a.reduce((s, x) => s + x, 0) / a.length;
  const v = a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1);
  return Math.sqrt(Math.max(v, 1e-6));
}

function forecastSeriesDaily(y, horizonDays) {
  const M = 7;
  if (y.length < M * 2) {
    const mu = y.length ? y.reduce((s, x) => s + x, 0) / y.length : 0;
    const sig = std(y) || 1;
    return {
      point: Array.from({ length: horizonDays }, () => Math.max(0, mu)),
      low: Array.from({ length: horizonDays }, () => Math.max(0, mu - 1.65 * sig)),
      high: Array.from({ length: horizonDays }, () => Math.max(0, mu + 1.65 * sig)),
      method: 'historical_mean_fallback',
    };
  }
  const st = holtWintersTrain(y, M);
  if (!st) {
    const mu = y.reduce((s, x) => s + x, 0) / y.length;
    const sig = std(y) || 1;
    return {
      point: Array.from({ length: horizonDays }, () => Math.max(0, mu)),
      low: Array.from({ length: horizonDays }, () => Math.max(0, mu - 1.65 * sig)),
      high: Array.from({ length: horizonDays }, () => Math.max(0, mu + 1.65 * sig)),
      method: 'historical_mean_fallback',
    };
  }
  const point = hwForecastAhead(st, horizonDays);
  const sigma = robustForecastSpread(y);
  const low = [];
  const high = [];
  for (let h = 1; h <= horizonDays; h++) {
    const widen = Math.sqrt(1 + 0.14 * h);
    const z = 1.65 * sigma * widen;
    low.push(Math.max(0, point[h - 1] - z));
    high.push(Math.max(0, point[h - 1] + z));
  }
  return { point, low, high, method: 'holt_winters_additive_s7' };
}

function aggregateMonthly(daily) {
  const map = new Map();
  for (const row of daily) {
    const mk = row.date.slice(0, 7);
    if (!map.has(mk)) map.set(mk, { month: mk, delivered: 0, reports: 0 });
    const o = map.get(mk);
    o.delivered += row.delivered;
    o.reports += row.reports;
  }
  return [...map.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((o) => ({
      ...o,
      productivity: o.reports > 0 ? o.delivered / o.reports : o.delivered,
    }));
}

/** Simple damped trend on series (monthly buckets). */
function monthlyTrendForecast(values, monthsAhead) {
  const n = values.length;
  if (n < 2) {
    const v = n ? values[0] : 0;
    return {
      point: Array.from({ length: monthsAhead }, () => Math.max(0, v)),
      low: Array.from({ length: monthsAhead }, () => Math.max(0, v * 0.7)),
      high: Array.from({ length: monthsAhead }, () => Math.max(0, v * 1.35)),
      method: 'flat_monthly_fallback',
    };
  }
  const recent = values.slice(-Math.min(6, n));
  const older = values.slice(0, Math.max(0, n - 6));
  const muR = recent.reduce((s, x) => s + x, 0) / recent.length;
  const muO = older.length ? older.reduce((s, x) => s + x, 0) / older.length : muR;
  const slope = (muR - muO) / Math.max(1, n - 1);
  const damp = 0.72;
  const sig = std(values.slice(-12)) || Math.max(1, muR * 0.15);
  const point = [];
  const low = [];
  const high = [];
  let acc = values[n - 1];
  for (let h = 1; h <= monthsAhead; h++) {
    const step = slope * damp ** (h - 1);
    acc = Math.max(0, acc + step);
    point.push(acc);
    const w = 1.75 * sig * Math.sqrt(1 + 0.15 * h);
    low.push(Math.max(0, acc - w));
    high.push(Math.max(0, acc + w));
  }
  return { point, low, high, method: 'damped_monthly_trend' };
}

/**
 * @param {object} opts
 * @param {{ dates: string[], totals?: {date: string, delivered: number}[] }} opts.timeline — same shape as delivery-timeline API
 * @param {object[]} opts.shiftReports — approved reports with snake_case fields
 * @param {'week'|'month'|'year'} opts.horizon
 */
export function buildDeskForecast({ timeline, shiftReports, horizon }) {
  const dates = Array.isArray(timeline?.dates) ? timeline.dates : [];
  const totals = Array.isArray(timeline?.totals) ? timeline.totals : [];
  const daily = buildDailyDeskSeries(dates, totals, shiftReports);

  const horizonDays = horizon === 'week' ? 7 : horizon === 'month' ? 30 : 0;
  const lastDate = daily.length ? daily[daily.length - 1].date : todayYmd();

  if (horizon === 'year') {
    const monthly = aggregateMonthly(daily);
    const yDel = monthly.map((m) => m.delivered);
    const yProd = monthly.map((m) => m.productivity);
    const fDel = monthlyTrendForecast(yDel, 12);
    const fProd = monthlyTrendForecast(yProd, 12);
    const forecastMonths = [];
    for (let h = 1; h <= 12; h++) {
      const label = addCalendarMonths(lastDate, h).slice(0, 7);
      forecastMonths.push(label);
    }
    return {
      mode: 'year',
      daily,
      monthlyHistory: monthly,
      forecastMonths,
      deliveries: {
        point: fDel.point,
        low: fDel.low,
        high: fDel.high,
        method: fDel.method,
      },
      productivity: {
        point: fProd.point,
        low: fProd.low,
        high: fProd.high,
        method: fProd.method,
      },
      meta: {
        lastHistoricalDate: lastDate,
        trainingDays: daily.length,
        description:
          'Monthly totals: damped trend with widening bands (year-ahead outlook).',
      },
    };
  }

  const yDel = daily.map((d) => d.delivered);
  const yProd = daily.map((d) => d.productivity);
  const fDel = forecastSeriesDaily(yDel, horizonDays);
  const fProd = forecastSeriesDaily(yProd, horizonDays);

  const forecastDates = [];
  for (let h = 1; h <= horizonDays; h++) {
    forecastDates.push(addCalendarDays(lastDate, h));
  }

  return {
    mode: horizon === 'week' ? 'week' : 'month',
    daily,
    forecastDates,
    deliveries: fDel,
    productivity: fProd,
    meta: {
      lastHistoricalDate: lastDate,
      trainingDays: daily.length,
      description:
        'Daily Holt–Winters (level + trend + 7-day seasonality) on approved-shift history; bands from recent one-step residuals.',
    },
  };
}
