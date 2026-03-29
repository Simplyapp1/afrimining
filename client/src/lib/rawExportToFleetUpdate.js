import { normalizeRegistration } from './truckUpdateInsights.js';

/** Canonical key for matching paste ↔ fleet (spaces stripped, hyphens/underscores removed, uppercased). */
export function registrationKeyForLookup(reg) {
  return normalizeRegistration(reg).replace(/[-_/]/g, '');
}

/** Normalize a pasted line: unicode dashes, tabs, collapsed spaces, compatibility chars. */
function normalizeRawExportLine(line) {
  return String(line || '')
    .normalize('NFKC')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\t/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Registration at start of export lines: optional spaces/hyphens inside the plate (e.g. DK16 PTZN → DK16PTZN).
 * Spaced form must be tried before a plain contiguous run, or "DK16 PTZN" would match only "DK16".
 */
const REGISTRATION_FIRST_SEGMENT =
  '((?:[A-Za-z0-9](?:[A-Za-z0-9\\s\\-]{0,22}[A-Za-z0-9])|[A-Za-z0-9]{2,24}))';

function normalizeRegistrationFromExportSegment(seg) {
  return String(seg || '')
    .replace(/[\s\-_/]/g, '')
    .toUpperCase();
}

/** SQL Server / JSON may use different casings for column names. */
function pickRow(row, ...keys) {
  if (!row) return null;
  for (const k of keys) {
    if (k && row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') return row[k];
  }
  const first = keys[0];
  if (!first) return null;
  const lower = first.toLowerCase().replace(/_/g, '');
  for (const [key, val] of Object.entries(row)) {
    if (
      key &&
      key.toLowerCase().replace(/_/g, '') === lower &&
      val !== undefined &&
      val !== null &&
      String(val).trim() !== ''
    ) {
      return val;
    }
  }
  return null;
}

function labelFromTruckRow(t) {
  if (!t) return '';
  const co = String(
    pickRow(t, 'contractor_company_name', 'contractorCompanyName', 'contractor_name', 'company_name') || ''
  ).trim();
  if (co) return co;
  const main = String(pickRow(t, 'main_contractor', 'mainContractor', 'Main_Contractor') || '').trim();
  const sub = String(pickRow(t, 'sub_contractor', 'subContractor', 'Sub_Contractor') || '').trim();
  return main || sub || '';
}

/**
 * Right-hand side of route name for status text ("Offloading at …", "Enroute to …").
 * @param {string} routeName e.g. "NTSHOVELO -> KELVIN PS"
 * @returns {string}
 */
export function destinationFromRouteName(routeName) {
  const s = String(routeName || '')
    .replace(/\*/g, '')
    .trim();
  const parts = s.split(/\s*(?:→|->|=>)\s*/i);
  if (parts.length >= 2) {
    return parts[parts.length - 1]
      .replace(/\([^)]*\)/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  const toSplit = s.split(/\s+To\s+/i);
  if (toSplit.length >= 2) {
    return toSplit[toSplit.length - 1]
      .replace(/\([^)]*\)/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return s || 'destination';
}

/**
 * @param {Array<object>} routeTrucks from GET /contractor/routes/:id (enrolled on route)
 * @param {Array<object>} [fleetTrucks] optional full fleet from GET /contractor/trucks — used when route row has no label (lookup by truck_id)
 * @returns {Map<string, string>} normalized reg -> display company (contractor record first, then main/sub free text)
 */
export function buildRegistrationEntityMap(routeTrucks, fleetTrucks) {
  const fleetById = new Map();
  const fleetByReg = new Map();
  for (const ft of fleetTrucks || []) {
    const id = pickRow(ft, 'id', 'Id');
    if (id != null && id !== '') fleetById.set(String(id), ft);
    const rawReg = pickRow(ft, 'registration', 'Registration');
    const fr = registrationKeyForLookup(rawReg);
    if (fr && !fleetByReg.has(fr)) fleetByReg.set(fr, ft);
  }
  const map = new Map();
  function putKeys(regStr, label) {
    if (!label) return;
    const n = normalizeRegistration(regStr);
    const k = registrationKeyForLookup(regStr);
    if (n) map.set(n, label);
    if (k && k !== n) map.set(k, label);
  }
  for (const t of routeTrucks || []) {
    const rawReg = pickRow(t, 'registration', 'Registration');
    const reg = normalizeRegistration(rawReg);
    const regKey = registrationKeyForLookup(rawReg);
    if (!regKey) continue;
    let label = labelFromTruckRow(t);
    if (!label) {
      const tid = pickRow(t, 'truck_id', 'truckId');
      if (tid != null && fleetById.has(String(tid))) {
        label = labelFromTruckRow(fleetById.get(String(tid)));
      }
    }
    if (!label && fleetByReg.has(regKey)) {
      label = labelFromTruckRow(fleetByReg.get(regKey));
    }
    if (label) putKeys(rawReg || reg, label);
  }
  return map;
}

/**
 * Match export-schedule style lines:
 * REG - STATUS - (COMPANY) - Hours: h - Weight|tons: w [- DRIVER]
 * Also: Weight/Tons before Hours (some exports reverse these).
 */
export function parseRawExportTruckLine(line) {
  const clean = normalizeRawExportLine(line);
  if (!clean || /^FLEET\s+UPDATE/i.test(clean)) return null;
  if (/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/i.test(clean)) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return null;
  if ((/→|->|=>/.test(clean) || /\*.*\*/.test(clean)) && !/Hours:\s*[\d.]+/i.test(clean) && !/(?:Weight|Tons|Load):\s*[\d.]+/i.test(clean)) {
    return null;
  }

  const reHoursFirst = new RegExp(
    `^${REGISTRATION_FIRST_SEGMENT}\\s*-\\s*(.+?)\\s*-\\s*\\(([^)]*)\\)\\s*-\\s*Hours:\\s*([\\d.]+)\\s*-\\s*(?:Weight|Tons|Load):\\s*([\\d.]+)(?:\\s*-\\s*(.+))?$`,
    'i'
  );
  const reWeightFirst = new RegExp(
    `^${REGISTRATION_FIRST_SEGMENT}\\s*-\\s*(.+?)\\s*-\\s*\\(([^)]*)\\)\\s*-\\s*(?:Weight|Tons|Load):\\s*([\\d.]+)\\s*-\\s*Hours:\\s*([\\d.]+)(?:\\s*-\\s*(.+))?$`,
    'i'
  );

  let m = clean.match(reHoursFirst);
  let hoursIdx = 4;
  let tonsIdx = 5;
  if (!m) {
    m = clean.match(reWeightFirst);
    if (m) {
      tonsIdx = 4;
      hoursIdx = 5;
    }
  }
  if (!m) {
    const segmented = tryParseRawExportSegmented(clean);
    if (segmented) return segmented;
    const loose = tryParseRawExportLineLoose(clean);
    if (loose) return loose;
    return null;
  }
  const registration = normalizeRegistrationFromExportSegment(m[1]);
  const rawStatus = m[2].trim();
  const contractorFromPaste = m[3].trim();
  const hours = parseFloat(m[hoursIdx]);
  const tons = parseFloat(m[tonsIdx]);
  const driverName = m[6] ? m[6].trim() : '';
  if (Number.isNaN(hours) || Number.isNaN(tons)) return null;
  return { registration, rawStatus, contractorFromPaste, hours, tons, driverName };
}

/**
 * Split the line before the first metric (Hours or Weight/Tons) and parse REG - … segments.
 * Handles: no parentheses around company; Hours before or after Weight; optional "Load" label.
 */
function tryParseRawExportSegmented(clean) {
  const hMatch = clean.match(/Hours:\s*([\d.]+)/i);
  const massMatch = clean.match(/(?:Weight|Tons|Load)\s*:\s*([\d.]+)/i);
  if (!hMatch || !massMatch) return null;
  const hours = parseFloat(hMatch[1]);
  const tons = parseFloat(massMatch[1]);
  if (Number.isNaN(hours) || Number.isNaN(tons)) return null;

  const hi = hMatch.index ?? 0;
  const mi = massMatch.index ?? 0;
  const cut = Math.min(hi, mi);
  let head = clean.slice(0, cut).replace(/\s+-\s*$/,'').trim();
  if (!head) return null;

  const parts = head.split(/\s+-\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  const registration = normalizeRegistrationFromExportSegment(parts[0]);
  if (!/^[A-Z0-9]{3,26}$/.test(registration)) return null;

  let contractorFromPaste = '';
  let rawStatus = '';

  const parenIdx = parts.findIndex((p) => /^\([^)]*\)$/.test(p));
  if (parenIdx >= 1) {
    contractorFromPaste = parts[parenIdx].replace(/^\(|\)$/g, '').trim();
    rawStatus = parts.slice(1, parenIdx).join(' - ').trim() || 'ENROUTE';
  } else if (parts.length >= 3) {
    rawStatus = parts[1];
    contractorFromPaste = parts.slice(2).join(' - ').trim();
  } else {
    rawStatus = parts[1] || 'ENROUTE';
  }

  return { registration, rawStatus, contractorFromPaste, hours, tons, driverName: '' };
}

/** Last resort: find Hours + Weight/Tons and (company); registration = first segment before metrics. */
function tryParseRawExportLineLoose(clean) {
  const h = clean.match(/Hours:\s*([\d.]+)/i);
  const w = clean.match(/(?:Weight|Tons|Load)\s*:\s*([\d.]+)/i);
  if (!h || !w) return null;
  const hours = parseFloat(h[1]);
  const tons = parseFloat(w[1]);
  if (Number.isNaN(hours) || Number.isNaN(tons)) return null;
  const contractorM = clean.match(/\(\s*([^)]{1,120})\s*\)/);
  const contractorFromPaste = contractorM ? contractorM[1].trim() : '';
  const hi = h.index ?? 0;
  const wi = w.index ?? 0;
  const cut = Math.min(hi, wi);
  const beforeMetrics = clean.slice(0, cut).replace(/\s+-\s*$/,'').trim();
  const regM = beforeMetrics.match(new RegExp(`^${REGISTRATION_FIRST_SEGMENT}\\s*-\\s*`, 'i'));
  if (!regM) return null;
  const registration = normalizeRegistrationFromExportSegment(regM[1]);
  if (!/^[A-Z0-9]{3,26}$/.test(registration)) return null;
  let rest = beforeMetrics.slice(regM[0].length).trim();
  const parenIdx = rest.lastIndexOf('(');
  const rawStatus = (parenIdx > 0 ? rest.slice(0, parenIdx) : rest).replace(/\s*-\s*$/, '').trim() || 'ENROUTE';
  return { registration, rawStatus, contractorFromPaste, hours, tons, driverName: '' };
}

function formatStatusForFleetLine(rawStatus, dest) {
  const d = dest || 'destination';
  const u = rawStatus.toUpperCase();
  if (/\bOFFLOAD/.test(u) && /\(D\)/.test(rawStatus)) {
    return `**Offloading at ${d} (D)**`;
  }
  if (/\bOFFLOAD/.test(u)) {
    return `**Offloading at ${d} (D)**`;
  }
  if (/\bEN[\s-]?ROUTE\b/.test(u) || /\bENROUTE\b/.test(u)) {
    return `**Enroute to ${d}**`;
  }
  return `**${rawStatus.trim()}**`;
}

function formatEntityParen(entity) {
  const e = String(entity || '').trim();
  if (!e) return '(—)';
  return `(${e})`;
}

/**
 * Parse optional header from raw paste (day + ISO date).
 * @returns {{ dayName: string, isoDate: string } | null}
 */
export function parseRawExportHeader(lines) {
  let dayName = '';
  let isoDate = '';
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/i.test(t)) {
      dayName = t;
      continue;
    }
    const iso = t.match(/^(\d{4}-\d{2}-\d{2})$/);
    if (iso) {
      isoDate = iso[1];
      continue;
    }
  }
  if (!isoDate && !dayName) return null;
  return { dayName, isoDate };
}

function defaultHeaderNow() {
  const d = new Date();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = days[d.getDay()];
  const isoDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { dayName, isoDate };
}

/**
 * @param {object} opts
 * @param {string} opts.rawText
 * @param {string} opts.routeDisplayName route name for header line (arrow format)
 * @param {Map<string,string>} opts.regToEntity normalized registration -> company label
 * @param {{ dayName?: string, isoDate?: string }} [opts.headerOverride]
 * @returns {{ text: string, warnings: string[], linesConverted: number }}
 */
export function convertRawExportToFleetUpdate(opts) {
  const rawText = String(opts.rawText || '');
  const routeDisplayName = String(opts.routeDisplayName || '').trim() || 'Route A -> Route B';
  const regToEntity = opts.regToEntity instanceof Map ? opts.regToEntity : new Map();
  const lines = rawText.split(/\r?\n/);
  const headerFromPaste = parseRawExportHeader(lines);
  const fallback = defaultHeaderNow();
  const dayName = opts.headerOverride?.dayName || headerFromPaste?.dayName || fallback.dayName;
  const isoDate = opts.headerOverride?.isoDate || headerFromPaste?.isoDate || fallback.isoDate;
  const dest = destinationFromRouteName(routeDisplayName);

  const out = [];
  out.push('FLEET UPDATE/ALLOCATION');
  out.push(dayName);
  out.push(isoDate);
  out.push(routeDisplayName.replace(/\*/g, '').trim());

  const warnings = [];
  let linesConverted = 0;

  for (const line of lines) {
    const row = parseRawExportTruckLine(line);
    if (!row) continue;
    linesConverted += 1;
    const reg = normalizeRegistration(row.registration);
    const regLookup = registrationKeyForLookup(row.registration);
    const enrolled = regToEntity.get(reg) ?? regToEntity.get(regLookup);
    const entityLabel = enrolled || row.contractorFromPaste;
    if (!enrolled && row.contractorFromPaste) {
      warnings.push(`${reg}: not enrolled on selected route — used company from export (${row.contractorFromPaste}).`);
    } else if (!enrolled && !row.contractorFromPaste) {
      warnings.push(`${reg}: not enrolled on selected route — company unknown; paste company if needed.`);
    }
    const entity = formatEntityParen(entityLabel || 'Unknown');
    const statusPart = formatStatusForFleetLine(row.rawStatus, dest);
    const tons = row.tons.toFixed(2);
    const hours = row.hours.toFixed(2);
    out.push(`${reg} - ${entity} - ${statusPart} - Tons: ${tons} - Hours: ${hours}`);
  }

  if (linesConverted === 0) {
    return {
      text: '',
      warnings: ['No truck lines found. Expected lines like: REG - STATUS - (Company) - Hours: 0.0 - Weight: 0.0'],
      linesConverted: 0,
    };
  }

  return { text: `${out.join('\n')}\n`, warnings, linesConverted };
}
