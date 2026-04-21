/**
 * Work schedule entries: wall-clock start/end (TIME) + legacy shift_type (day/night/custom).
 */

export function sqlTimeToHHmm(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'string') {
    const m = v.match(/(\d{1,2}):(\d{2})/);
    if (m) return `${String(m[1]).padStart(2, '0')}:${m[2]}`;
    return v.slice(0, 5);
  }
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${String(v.getUTCHours()).padStart(2, '0')}:${String(v.getUTCMinutes()).padStart(2, '0')}`;
  }
  return String(v).slice(0, 5);
}

/** True when the band crosses midnight on work_date (end strictly before start on the clock). */
export function isOvernightBand(startHHmm, endHHmm) {
  if (!startHHmm || !endHHmm) return false;
  const [sh, sm] = startHHmm.split(':').map((x) => parseInt(x, 10));
  const [eh, em] = endHHmm.split(':').map((x) => parseInt(x, 10));
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return false;
  const a = sh * 60 + sm;
  const b = eh * 60 + em;
  return b < a;
}

export function formatEntryTimeRange(shiftType, workStartRaw, workEndRaw) {
  const st = String(shiftType || 'day').toLowerCase();
  let start = sqlTimeToHHmm(workStartRaw);
  let end = sqlTimeToHHmm(workEndRaw);
  if (!start || !end) {
    if (st === 'night') return '18:00 – 06:00';
    return '06:00 – 18:00';
  }
  return `${start} – ${end}`;
}

export function scheduleTimeBandKey(shiftType, workStartRaw, workEndRaw) {
  const range = formatEntryTimeRange(shiftType, workStartRaw, workEndRaw);
  const overnight = isOvernightBand(sqlTimeToHHmm(workStartRaw), sqlTimeToHHmm(workEndRaw));
  return `${range}|${overnight ? '1' : '0'}`;
}

const padTime = (s) => {
  const m = String(s).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const h = String(Math.min(23, parseInt(m[1], 10))).padStart(2, '0');
  const mi = String(Math.min(59, parseInt(m[2], 10))).padStart(2, '0');
  const se = m[3] != null ? String(Math.min(59, parseInt(m[3], 10))).padStart(2, '0') : '00';
  return `${h}:${mi}:${se}`;
};

/**
 * Resolve API body for insert: returns { shiftType, workStart, workEnd } as HH:mm:ss for SQL Server TIME.
 */
export function resolveScheduleEntryTimes(body) {
  const wsIn = body?.work_start_time != null ? String(body.work_start_time).trim() : '';
  const weIn = body?.work_end_time != null ? String(body.work_end_time).trim() : '';
  if (wsIn && weIn) {
    const ws = padTime(wsIn);
    const we = padTime(weIn);
    if (!ws || !we) throw new Error('Invalid work_start_time or work_end_time');
    let shiftType = 'custom';
    if (ws === '06:00:00' && we === '18:00:00') shiftType = 'day';
    else if (ws === '18:00:00' && we === '06:00:00') shiftType = 'night';
    return { shiftType, workStart: ws, workEnd: we };
  }
  const st = String(body?.shift_type || 'day').toLowerCase();
  if (st === 'night') return { shiftType: 'night', workStart: '18:00:00', workEnd: '06:00:00' };
  if (st === 'day') return { shiftType: 'day', workStart: '06:00:00', workEnd: '18:00:00' };
  throw new Error('Provide shift_type day or night, or work_start_time and work_end_time (HH:mm)');
}
