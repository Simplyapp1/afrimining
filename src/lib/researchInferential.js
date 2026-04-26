/**
 * Inferential / psychometric helpers for research questionnaire (Likert blocks).
 * Conservative: listwise deletion per scale; flags small samples.
 */

import { VAR_ORDER, VARIABLE_DEFS, normalizeVarValue } from './researchQuestionnaireSchema.js';

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function sampleVar(arr, m) {
  if (arr.length < 2) return 0;
  return arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1);
}

function pearsonCorr(x, y) {
  const n = x.length;
  if (n < 2 || y.length !== n) return null;
  const mx = mean(x);
  const my = mean(y);
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const den = Math.sqrt(dx2 * dy2);
  if (den < 1e-12) return null;
  const r = num / den;
  return Math.min(1, Math.max(-1, r));
}

/** Rows: participants × items; all values present. */
export function cronbachAlphaFromMatrix(rows) {
  const n = rows.length;
  const k = rows[0]?.length || 0;
  if (n < 2 || k < 2) {
    return {
      alpha: null,
      n_listwise: n,
      k,
      note: 'Need at least 2 participants and 2 items with complete data on this scale.',
    };
  }
  const itemVars = [];
  for (let j = 0; j < k; j += 1) {
    const col = rows.map((r) => r[j]);
    const m = mean(col);
    itemVars.push(sampleVar(col, m));
  }
  const sumScores = rows.map((r) => r.reduce((a, b) => a + b, 0));
  const mTot = mean(sumScores);
  const varTot = sampleVar(sumScores, mTot);
  if (varTot < 1e-12) {
    return { alpha: null, n_listwise: n, k, note: 'Zero variance on total score — cannot compute α.' };
  }
  const sumItemVar = itemVars.reduce((a, b) => a + b, 0);
  const alpha = (k / (k - 1)) * (1 - sumItemVar / varTot);
  return {
    alpha: Math.round(alpha * 1000) / 1000,
    n_listwise: n,
    k,
    sum_item_variances: Math.round(sumItemVar * 1000) / 1000,
    total_variance: Math.round(varTot * 1000) / 1000,
    note: null,
  };
}

function listwiseLikertRows(byPart, participantIds, itemCodes) {
  const rows = [];
  for (const pid of participantIds) {
    const rec = byPart.get(pid);
    if (!rec) continue;
    const row = [];
    let ok = true;
    for (const code of itemCodes) {
      const v = normalizeVarValue(code, rec[code]);
      if (v == null) {
        ok = false;
        break;
      }
      row.push(v);
    }
    if (ok) rows.push(row);
  }
  return rows;
}

function correlationMatrix(rows) {
  const n = rows.length;
  const k = rows[0].length;
  const means = [];
  const stds = [];
  for (let j = 0; j < k; j += 1) {
    const col = rows.map((r) => r[j]);
    const m = mean(col);
    const sd = Math.sqrt(sampleVar(col, m));
    means.push(m);
    stds.push(sd < 1e-12 ? 1 : sd);
  }
  const R = Array.from({ length: k }, () => Array(k).fill(0));
  for (let i = 0; i < k; i += 1) {
    for (let j = i; j < k; j += 1) {
      let s = 0;
      for (let r = 0; r < n; r += 1) {
        s += ((rows[r][i] - means[i]) / stds[i]) * ((rows[r][j] - means[j]) / stds[j]);
      }
      const c = s / (n - 1);
      R[i][j] = R[j][i] = Math.min(1, Math.max(-1, c));
    }
  }
  return R;
}

/** Cholesky L with R = L Lᵀ; returns null if not positive definite. */
function choleskyL(R) {
  const n = R.length;
  const L = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j <= i; j += 1) {
      let s = R[i][j];
      for (let k = 0; k < j; k += 1) s -= L[i][k] * L[j][k];
      if (i === j) {
        if (s <= 1e-12) return null;
        L[i][j] = Math.sqrt(s);
      } else {
        L[i][j] = s / L[j][j];
      }
    }
  }
  return L;
}

function logDetSPD(R) {
  const L = choleskyL(R);
  if (!L) return null;
  let s = 0;
  for (let i = 0; i < L.length; i += 1) s += Math.log(L[i][i]);
  return 2 * s;
}

function matVec(A, v) {
  return A.map((row) => row.reduce((s, aij, j) => s + aij * v[j], 0));
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += a[i] * b[i];
  return s;
}

function normalizeInPlace(v) {
  const nrm = Math.sqrt(dot(v, v));
  if (nrm < 1e-12) return false;
  for (let i = 0; i < v.length; i += 1) v[i] /= nrm;
  return true;
}

/** Approximate leading eigenvalues (symmetric) via power iteration + deflation. */
function topEigenvaluesSymmetric(A, m, iters = 200) {
  const n = A.length;
  const M = A.map((row) => row.slice());
  const out = [];
  const take = Math.min(m, n);
  for (let e = 0; e < take; e += 1) {
    const v = Array.from({ length: n }, () => Math.random() - 0.5);
    if (!normalizeInPlace(v)) continue;
    let lambda = 0;
    for (let it = 0; it < iters; it += 1) {
      const Av = matVec(M, v);
      lambda = dot(v, Av);
      for (let i = 0; i < n; i += 1) v[i] = Av[i];
      if (!normalizeInPlace(v)) break;
    }
    out.push(Math.max(0, lambda));
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) M[i][j] -= lambda * v[i] * v[j];
    }
  }
  return out.sort((a, b) => b - a);
}

/**
 * @param {Map<string, object>} byPart participant_id -> { V1: int, ... }
 * @param {string[]} participantIds
 */
export function computeResearchInferential(byPart, participantIds) {
  const likertCodes = VAR_ORDER.filter((c) => VARIABLE_DEFS[c]?.type === 'likert_5');
  const sections = ['B', 'C', 'D'];
  const reliability = sections.map((sec) => {
    const codes = likertCodes.filter((c) => VARIABLE_DEFS[c].section === sec);
    if (codes.length < 2) {
      return {
        section: sec,
        item_codes: codes,
        alpha: null,
        n_listwise: 0,
        k: codes.length,
        items: [],
        note: 'Not enough Likert items in this section.',
      };
    }
    const rows = listwiseLikertRows(byPart, participantIds, codes);
    const base = cronbachAlphaFromMatrix(rows);
    const items = codes.map((code, j) => {
      const colJ = rows.map((r) => r[j]);
      const totalOther = rows.map((r) => r.reduce((s, x, idx) => (idx === j ? s : s + x), 0));
      const rItc = rows.length >= 2 ? pearsonCorr(colJ, totalOther) : null;
      let alphaDel = null;
      if (rows.length >= 2 && codes.length >= 3) {
        const rowsMinus = rows.map((r) => r.filter((_, idx) => idx !== j));
        alphaDel = cronbachAlphaFromMatrix(rowsMinus).alpha;
      }
      return {
        code,
        alpha_if_deleted: alphaDel,
        item_total_correlation: rItc != null ? Math.round(rItc * 1000) / 1000 : null,
      };
    });
    return {
      section: sec,
      item_codes: codes,
      alpha: base.alpha,
      n_listwise: base.n_listwise,
      k: base.k,
      sum_item_variances: base.sum_item_variances,
      total_variance: base.total_variance,
      note: base.note,
      items,
    };
  });

  let exploratory_factor_screening = null;
  if (likertCodes.length >= 3) {
    const allRows = listwiseLikertRows(byPart, participantIds, likertCodes);
    const N = allRows.length;
    const p = likertCodes.length;
    if (N >= 10) {
      const R = correlationMatrix(allRows);
      const logDet = logDetSPD(R);
      let bartlett_chi_sq = null;
      let bartlett_df = null;
      let note = null;
      if (logDet != null && Number.isFinite(logDet)) {
        const chi = -((N - 1) - (2 * p + 5) / 6) * logDet;
        bartlett_chi_sq = Math.max(0, Math.round(chi * 1000) / 1000);
        bartlett_df = (p * (p - 1)) / 2;
      } else {
        note = 'Correlation matrix is not positive definite (common with small N or sparse data). Bartlett statistic omitted.';
      }
      const eigenvalues_top = topEigenvaluesSymmetric(
        R.map((row) => row.slice()),
        Math.min(12, p),
        180
      ).map((x) => Math.round(x * 10000) / 10000);
      exploratory_factor_screening = {
        n_listwise: N,
        p_items: p,
        item_codes: likertCodes,
        bartlett_chi_sq,
        bartlett_df,
        bartlett_note: note,
        eigenvalues_top,
        interpretation:
          'Exploratory: Bartlett tests whether correlations differ from an identity matrix. Eigenvalues are approximate (power method + deflation) for scree-style inspection — not a substitute for CFA in SPSS/R.',
      };
    } else {
      exploratory_factor_screening = {
        n_listwise: N,
        p_items: p,
        item_codes: likertCodes,
        bartlett_chi_sq: null,
        bartlett_df: null,
        bartlett_note: 'Need at least 10 listwise-complete cases for full-sample factor screening.',
        eigenvalues_top: [],
        interpretation: null,
      };
    }
  }

  return { reliability, exploratory_factor_screening };
}
