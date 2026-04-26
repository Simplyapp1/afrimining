/**
 * Coal road freight study questionnaire (Mogashoa / TUT).
 * Variable codes V1–V47 match the printed instrument. Value codes are numeric for SPSS/Excel.
 */

const LIKERT_SCALE = {
  1: 'Strongly disagree',
  2: 'Disagree',
  3: 'Neither agree nor disagree',
  4: 'Agree',
  5: 'Strongly agree',
};

/** Section B–D: 5-point Likert (1 = strongly disagree … 5 = strongly agree). */
const LIKERT_STATEMENTS = [
  'Prolonged road maintenance activities in Nkangala district significantly disrupt coal freight operations', // V6
  'Truck breakdowns are largely caused by poor road maintenance',
  'Avoidance of tollgates cause long trips between the mine and the power station',
  'Failure to appoint experienced drivers lead to poor driver performance',
  'Thinkers Afrika always quickly respond after reporting truck-related or operations issues (e.g. breakdown)',
  'Thinkers Afrika always comply with safety regulations as prescribed by the government',
  'Poor road conditions often cause accidents',
  'Single-lane road cause traffic congestions',
  'Crime activities significantly affect the safety of coal truck drivers (e.g. cargo theft)',
  'Government efforts to combat crime in the coal transportation industry have been effective',
  'The absence of GPS on the trucks makes it difficult for drivers to plan transportation routes properly',
  'Meeting Thinkers Afrika targets are often impossible due to the driver’s shift cycle limitations',
  'Loading times at coal mines in the Nkangala district significantly affect the punctuality of our coal transport schedules',
  'Unloading times at coal mines in the Nkangala district significantly affect the punctuality of our coal transport schedules',
  'Slow unloading processes lead to long queues at the Eskom power station',
  'Keeping our roads in good condition can help our coal trucks use less fuel',
  'Keeping our roads in good condition can help our coal trucks last longer',
  'Poor road conditions increase coal truck maintenance',
  'Poor road conditions reduce transportation efficiency',
  'Well-maintained roads reduce damage on our coal trucks',
  'Inexperienced drivers are the cause of truck breakdown',
  'Inexperienced drivers are the cause of accidents',
  'Fuel consumption depends on how the driver operates the truck during production',
  'Regular coal truck inspections reduce breakdown',
  'Thinkers Afrika trains drivers on fuel-efficient driving techniques',
  'Traffic congestion negatively affects drivers from meeting their targets',
  'Thinkers Afrika has standby drivers in case of emergency (e.g. sudden illness)',
  'We use live traffic information updates to improve our schedules',
  'Working long hours helps the drivers to meet targets',
  'Meeting targets depends on how the unloading site (Eskom) conducts their operations',
  'Thinkers Afrika uses fuel-efficient practices to reduce fuel consumption',
  'Utilizing advanced route planning software to identify the most efficient routes reduce travel time',
  'Utilizing advanced route planning software to identify the most efficient routes reduce fuel consumption',
  'Investing in road infrastructure (e.g. widening roads, improving road surfaces) reduce travel time',
  'Investing in road infrastructure (e.g. widening roads, improving road surfaces) increase safety',
  'Encouraging the development of dedicated coal transportation corridors to minimize conflict with other traffic will improve company productivity',
  'Implementing intelligent transportation systems (ITS) to manage traffic flow improve company productivity (e.g. truck GPS)',
  'Implementing efficient unloading procedures will minimise turnaround time',
  'Implementing efficient loading procedures will minimize turnaround time',
  'Training drivers will improve operations of Thinkers Afrika (e.g. driving habits, fuel efficiency)',
  'Enforcing strict road safety regulations by the traffic officers will minimize accidents',
  'Enforcing driving working hours reduce fatigue',
];

export const VAR_ORDER = (() => {
  const o = [];
  for (let i = 1; i <= 47; i += 1) o.push(`V${i}`);
  return o;
})();

export const VARIABLE_DEFS = {
  V1: {
    section: 'A',
    questionNo: 1,
    label: 'Current age (age group)',
    type: 'ordinal',
    min: 1,
    max: 4,
    valueLabels: {
      1: '19 years or younger',
      2: 'Between 20 and 30 years',
      3: 'Between 31 and 40 years',
      4: '41 years or above',
    },
  },
  V2: {
    section: 'A',
    questionNo: 2,
    label: 'Gender',
    type: 'ordinal',
    min: 1,
    max: 4,
    valueLabels: {
      1: 'Female',
      2: 'Male',
      3: 'Other',
      4: 'Prefer not to indicate',
    },
  },
  V3: {
    section: 'A',
    questionNo: 3,
    label: 'Primary position in road freight industry',
    type: 'ordinal',
    min: 1,
    max: 4,
    valueLabels: {
      1: 'Truck driver',
      2: 'Assistant truck driver',
      3: 'Truck driver supervisor',
      4: 'Truck driver trainee',
    },
  },
  V4: {
    section: 'A',
    questionNo: 4,
    label: 'Highest vehicle permit',
    type: 'ordinal',
    min: 1,
    max: 16,
    valueLabels: {
      1: 'Driving Licence (EC)',
      2: 'Driving Licence (EC) plus PrDP',
      3: 'Driving Licence (EB)',
      4: 'Driving Licence (EB) plus PrDP',
      5: 'Driving Licence (EC1)',
      6: 'Driving Licence (EC1) plus PrDP',
      7: 'Driving Licence (C)',
      8: 'Driving Licence (C) plus PrDP',
      9: 'Driving Licence (C1)',
      10: 'Driving Licence (C1) plus PrDP',
      11: 'Driving Licence (B)',
      12: 'Driving License (B) plus PrDP',
      13: 'Driving License (A)',
      14: 'Driving License (A) plus PrDP',
      15: 'Driving License (A1)',
      16: 'Driving License (A1) plus PrDP',
    },
  },
  V5: {
    section: 'A',
    questionNo: 5,
    label: 'Term of employment experience (coal road freight)',
    type: 'ordinal',
    min: 1,
    max: 6,
    valueLabels: {
      1: 'Less than 1 year',
      2: '1–5 years',
      3: '6–10 years',
      4: '11–15 years',
      5: '16–20 years',
      6: '21 or more years',
    },
  },
};

for (let i = 0; i < LIKERT_STATEMENTS.length; i += 1) {
  const qn = i + 6;
  const code = `V${qn}`;
  const section = qn <= 15 ? 'B' : qn <= 35 ? 'C' : 'D';
  VARIABLE_DEFS[code] = {
    section,
    questionNo: qn,
    label: LIKERT_STATEMENTS[i],
    type: 'likert_5',
    min: 1,
    max: 5,
    valueLabels: { ...LIKERT_SCALE },
  };
}

export function getVarMeta(code) {
  return VARIABLE_DEFS[String(code || '').toUpperCase()] || null;
}

/**
 * Coerce and validate a single value; returns integer or null if invalid/out of range.
 */
export function normalizeVarValue(code, raw) {
  const meta = getVarMeta(code);
  if (!meta) return null;
  if (raw == null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || Number.isNaN(n)) return null;
  const x = Math.round(n);
  if (x < meta.min || x > meta.max) return null;
  return x;
}

export function validateAllValues(obj) {
  const out = {};
  const missing = [];
  for (const code of VAR_ORDER) {
    const v = obj?.[code] ?? obj?.[code.toLowerCase()];
    const n = normalizeVarValue(code, v);
    if (n == null) missing.push(code);
    else out[code] = n;
  }
  return { values: out, missing, invalid: [], isComplete: missing.length === 0 };
}

export function buildCodebookRows() {
  const rows = [];
  for (const code of VAR_ORDER) {
    const m = VARIABLE_DEFS[code];
    const vl = m.valueLabels
      ? Object.entries(m.valueLabels)
          .map(([k, lab]) => `${k}=${lab}`)
          .join('; ')
      : '';
    rows.push({
      variable: code,
      section: m.section,
      question_no: m.questionNo,
      label: m.label,
      type: m.type,
      min: m.min,
      max: m.max,
      value_labels: vl,
    });
  }
  return rows;
}
