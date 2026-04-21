/** Client-side formatting for work schedule entries (matches server workScheduleTimes.js). */

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
  const start = sqlTimeToHHmm(workStartRaw);
  const end = sqlTimeToHHmm(workEndRaw);
  if (!start || !end) {
    if (st === 'night') return '18:00 – 06:00';
    return '06:00 – 18:00';
  }
  return `${start} – ${end}`;
}

export function scheduleTimeBandKey(entry) {
  if (!entry) return '';
  return `${formatEntryTimeRange(entry.shift_type, entry.work_start_time, entry.work_end_time)}|${isOvernightBand(sqlTimeToHHmm(entry.work_start_time), sqlTimeToHHmm(entry.work_end_time)) ? '1' : '0'}`;
}
