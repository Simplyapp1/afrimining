/**
 * Cross-session comparison, status classification, and delivery-tracking insights
 * for fleet update pastes (typical cadence: every 2–3 hours).
 */

/** @typedef {'completed'|'not_completed'|'pending'} DeliveryConfirmation */

export function normalizeRegistration(reg) {
  return String(reg || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s/g, '')
    .toUpperCase();
}

/** Loose route string for grouping pastes (not exact DB match). */
export function normalizeRouteKey(route) {
  return String(route || '')
    .replace(/\*\*/g, '')
    .replace(/→|->|=>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/**
 * @param {string} pasteRoute e.g. "NTSHOVELO → KELVIN PS"
 * @param {Array<{ id: string, name?: string }>} routes from API
 * @returns {string|null} route id
 */
export function matchRouteFromPaste(pasteRoute, routes) {
  if (!pasteRoute || !routes?.length) return null;
  const key = normalizeRouteKey(pasteRoute);
  if (!key) return null;
  const tokens = key.split(/[\s/]+/).filter((t) => t.length >= 3);
  let best = null;
  let bestScore = 0;
  for (const r of routes) {
    const name = normalizeRouteKey(r.name || '');
    if (!name) continue;
    if (key === name || name.includes(key) || key.includes(name)) {
      return r.id;
    }
    let score = 0;
    for (const t of tokens) {
      if (name.includes(t)) score += t.length;
    }
    if (score > bestScore) {
      bestScore = score;
      best = r.id;
    }
  }
  return bestScore >= 6 ? best : null;
}

/** Heuristic status bucket for queue / transit / completion detection. */
export function classifyStatus(status) {
  const s = String(status || '').toLowerCase();
  if (/offload|complet|delivered|tipped|empty|done|finished/.test(s)) return 'complete';
  if (/queue|queuing|waiting|standing|held|delay|stuck\s*in\s*queue/.test(s)) return 'queue';
  if (/en\s*route|enroute|transit|on\s*route|travelling|traveling/.test(s)) return 'transit';
  if (/loading\s*at|at\s+\w+|mine|plant|depot|weighbridge|silos?/.test(s)) return 'active_site';
  return 'other';
}

function sessionRegs(session) {
  const set = new Set();
  for (const r of session.rows || []) {
    const n = normalizeRegistration(r.registration);
    if (n) set.add(n);
  }
  return set;
}

function sessionRouteKey(session) {
  const rows = session.rows || [];
  const withRoute = rows.find((x) => x.route && String(x.route).trim());
  return normalizeRouteKey((withRoute || rows[0])?.route || '');
}

function lastRowForReg(session, reg) {
  const rows = session.rows || [];
  let last = null;
  for (const r of rows) {
    if (normalizeRegistration(r.registration) === reg) last = r;
  }
  return last;
}

/**
 * @param {Array<{ savedAt: string, rows: object[], id?: string }>} sessions chronological
 * @param {object} opts
 */
export function buildCrossSessionInsights(sessions, opts = {}) {
  const {
    compareWindowHours = 6,
    longQueueHours = 3,
    longTransitHours = 5,
    longHoursOnSite = 8,
  } = opts;

  const insights = [];
  const missing = [];
  const undeclared = [];
  const stale = [];
  const pairSummaries = [];

  const sorted = [...(sessions || [])].sort((a, b) => String(a.savedAt).localeCompare(String(b.savedAt)));
  const windowMs = compareWindowHours * 60 * 60 * 1000;

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const t0 = new Date(prev.savedAt).getTime();
    const t1 = new Date(curr.savedAt).getTime();
    if (Number.isNaN(t0) || Number.isNaN(t1)) continue;
    const dt = t1 - t0;
    if (dt > windowMs) {
      pairSummaries.push({
        prevAt: prev.savedAt,
        currAt: curr.savedAt,
        skipped: true,
        reason: `Gap ${(dt / 3600000).toFixed(1)}h exceeds compare window (${compareWindowHours}h)`,
      });
      continue;
    }

    const rkPrev = sessionRouteKey(prev);
    const rkCurr = sessionRouteKey(curr);
    const routeCompatible = !rkPrev || !rkCurr || rkPrev === rkCurr;

    const A = sessionRegs(prev);
    const B = sessionRegs(curr);

    if (routeCompatible) {
      for (const reg of A) {
        if (!B.has(reg)) {
          missing.push({
            registration: reg,
            lastSeenAt: prev.savedAt,
            missingSince: curr.savedAt,
            routeKey: rkPrev || rkCurr,
          });
        }
      }
      for (const reg of B) {
        if (!A.has(reg)) {
          undeclared.push({
            registration: reg,
            firstSeenAt: curr.savedAt,
            routeKey: rkCurr || rkPrev,
          });
        }
      }
    }

    if (routeCompatible) {
      for (const reg of A) {
        if (!B.has(reg)) continue;
        const r0 = lastRowForReg(prev, reg);
        const r1 = lastRowForReg(curr, reg);
        if (!r0 || !r1) continue;
        const c0 = classifyStatus(r0.status);
        const c1 = classifyStatus(r1.status);
        const h0 = Number(r0.hours) || 0;
        const h1 = Number(r1.hours) || 0;

        if (c1 === 'queue' && h1 >= longQueueHours) {
          stale.push({
            type: 'long_queue',
            registration: reg,
            hours: h1,
            status: r1.status,
            at: curr.savedAt,
          });
        }
        if (c1 === 'transit' && h1 >= longTransitHours) {
          stale.push({
            type: 'long_transit',
            registration: reg,
            hours: h1,
            status: r1.status,
            at: curr.savedAt,
          });
        }
        if ((c1 === 'queue' || c1 === 'transit' || c1 === 'active_site') && h1 > h0 + 1 && h1 >= longHoursOnSite) {
          stale.push({
            type: 'hours_climbing',
            registration: reg,
            hoursPrev: h0,
            hoursCurr: h1,
            status: r1.status,
            at: curr.savedAt,
          });
        }
        if ((c0 === 'queue' || c0 === 'transit') && c1 === c0 && h1 >= h0 + 0.5) {
          stale.push({
            type: 'same_phase_longer',
            registration: reg,
            phase: c1,
            hoursPrev: h0,
            hoursCurr: h1,
            at: curr.savedAt,
          });
        }
      }
    }

    pairSummaries.push({
      prevAt: prev.savedAt,
      currAt: curr.savedAt,
      gapHours: (dt / 3600000).toFixed(2),
      missingCount: [...A].filter((r) => !B.has(r)).length,
      newCount: [...B].filter((r) => !A.has(r)).length,
    });
  }

  const uniq = (arr, keyFn) => {
    const seen = new Set();
    return arr.filter((x) => {
      const k = keyFn(x);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  const missingU = uniq(missing, (x) => `${x.registration}|${x.missingSince}`);
  const undeclaredU = uniq(undeclared, (x) => `${x.registration}|${x.firstSeenAt}`);
  const staleU = uniq(stale, (x) => `${x.type}|${x.registration}|${x.at}`);

  if (sorted.length >= 2) {
    insights.push({
      type: 'neutral',
      text: `Comparing consecutive pastes within ${compareWindowHours}h windows. ${pairSummaries.filter((p) => !p.skipped).length} pair(s) analysed; ${pairSummaries.filter((p) => p.skipped).length} skipped (long gap).`,
    });
  }

  if (missingU.length) {
    insights.push({
      type: 'attention',
      text: `Possible missing from latest paste (${missingU.length}): ${missingU.slice(0, 8).map((m) => m.registration).join(', ')}${missingU.length > 8 ? '…' : ''}. These trucks appeared in an earlier snapshot in the window but not the newest — confirm with the field or next update.`,
    });
  }
  if (undeclaredU.length) {
    insights.push({
      type: 'attention',
      text: `Possible undeclared / new in latest paste (${undeclaredU.length}): ${undeclaredU.slice(0, 8).map((m) => m.registration).join(', ')}${undeclaredU.length > 8 ? '…' : ''}. Not in the immediately previous snapshot — verify enrolment and paperwork.`,
    });
  }
  if (staleU.length) {
    insights.push({
      type: 'attention',
      text: `${staleU.length} flag(s) for long queue, long en-route, or rising “hours” while still in transit/queue/active — review rows highlighted below.`,
    });
  }

  return {
    missing: missingU,
    undeclared: undeclaredU,
    stale: staleU,
    pairSummaries,
    insights,
  };
}

/** localStorage confirmation key for “dropped off latest paste” (not tied to a rowId). */
export function dropConfirmationKey(registration) {
  return `drop:${normalizeRegistration(registration)}`;
}

/**
 * Trucks that appeared in at least one earlier paste but not in the most recent paste.
 * When both the latest paste and the truck’s last paste have a route line, they must match (same as consecutive-pair logic).
 *
 * @param {Array<{ savedAt: string, rows: object[] }>} sessions — typically sliceSessionsForAnalysis(history)
 */
export function buildDroppedFromLatestPaste(sessions) {
  const sorted = [...(sessions || [])].sort((a, b) => String(a.savedAt).localeCompare(String(b.savedAt)));
  if (sorted.length < 2) return [];

  const latest = sorted[sorted.length - 1];
  const latestRegs = sessionRegs(latest);
  const rkLatest = sessionRouteKey(latest);

  const unionBefore = new Set();
  for (let i = 0; i < sorted.length - 1; i++) {
    for (const r of sessionRegs(sorted[i])) {
      unionBefore.add(r);
    }
  }

  const out = [];
  for (const reg of unionBefore) {
    if (latestRegs.has(reg)) continue;

    let lastSeenAt = null;
    let lastRouteKey = '';
    for (let i = sorted.length - 2; i >= 0; i--) {
      if (sessionRegs(sorted[i]).has(reg)) {
        lastSeenAt = sorted[i].savedAt;
        lastRouteKey = sessionRouteKey(sorted[i]);
        break;
      }
    }
    const routeCompatible = !rkLatest || !lastRouteKey || rkLatest === lastRouteKey;
    if (!routeCompatible) continue;

    out.push({
      registration: reg,
      lastSeenAt,
      lastRouteKey,
      latestPasteAt: latest.savedAt,
    });
  }
  return out.sort((a, b) => a.registration.localeCompare(b.registration));
}

/**
 * Unique trucks with a recorded delivery outcome for shift close / archive.
 * Scope = trucks on the latest paste plus trucks that dropped off the latest paste (Step 1 + Step 2).
 * "Not done" = never marked delivery completed (includes explicit "not done" and still unset).
 *
 * @param {Array<{ savedAt: string, rows: object[] }>} sessions — same slice as buildDroppedFromLatestPaste
 * @param {Record<string, string>} confirmations rowId / drop:REG → completed | not_completed | pending
 */
export function buildShiftDeliveryTruckTotals(sessions, confirmations) {
  const sorted = [...(sessions || [])].sort((a, b) => String(a.savedAt).localeCompare(String(b.savedAt)));
  const dropped = buildDroppedFromLatestPaste(sessions);
  const latest = sorted.length ? sorted[sorted.length - 1] : null;

  const droppedRegSet = new Set();
  for (const d of dropped) {
    const reg = normalizeRegistration(d.registration);
    if (reg) droppedRegSet.add(reg);
  }

  const latestRowByReg = new Map();
  if (latest?.rows?.length) {
    for (const r of latest.rows) {
      const reg = normalizeRegistration(r.registration);
      if (!reg) continue;
      latestRowByReg.set(reg, r);
    }
  }

  const scopeRegs = new Set([...droppedRegSet, ...latestRowByReg.keys()]);

  let trucksCompletedDelivery = 0;
  let trucksOutcomePending = 0;

  for (const reg of scopeRegs) {
    let v = 'pending';
    if (droppedRegSet.has(reg)) {
      v = confirmations[dropConfirmationKey(reg)] || 'pending';
    } else {
      const r = latestRowByReg.get(reg);
      const rowId = r?.rowId;
      v = rowId ? confirmations[rowId] || 'pending' : 'pending';
    }
    if (v === 'completed') {
      trucksCompletedDelivery += 1;
    } else if (v === 'pending') {
      trucksOutcomePending += 1;
    }
  }

  const trucksNotDone = scopeRegs.size - trucksCompletedDelivery;

  return {
    trucksCompletedDelivery,
    trucksNotDone,
    trucksOutcomePending,
  };
}

/**
 * @param {Set<string>|string[]} enrolledRegs normalized registrations on selected route
 */
export function enrollmentForRow(registration, enrolledSet) {
  if (!enrolledSet || enrolledSet.size === 0) return 'unknown';
  const r = normalizeRegistration(registration);
  return enrolledSet.has(r) ? 'matched' : 'not_on_route';
}
