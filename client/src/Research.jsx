import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { research as researchApi, downloadAttachmentWithAuth } from './api';
import { useSecondaryNavHidden } from './lib/useSecondaryNavHidden.js';
import InfoHint from './components/InfoHint.jsx';

function inputClass() {
  return 'w-full rounded-lg border border-surface-300 bg-white dark:bg-surface-900 px-3 py-2 text-sm text-surface-900 dark:text-surface-100';
}

function btnPrimary() {
  return 'inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50';
}

function btnSecondary() {
  return 'inline-flex items-center justify-center rounded-lg border border-surface-300 bg-white px-4 py-2 text-sm font-medium text-surface-800 hover:bg-surface-50 dark:border-surface-600 dark:bg-surface-900 dark:text-surface-100 dark:hover:bg-surface-800';
}

function btnDanger() {
  return 'inline-flex items-center justify-center rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-surface-900 dark:text-red-300';
}

function formatDt(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

function revokeScanPreview(entry) {
  if (entry?.previewUrl) {
    try {
      URL.revokeObjectURL(entry.previewUrl);
    } catch (_) {
      /* ignore */
    }
  }
}

/** @param {File} file */
function scanQueueEntryFromFile(file) {
  const previewUrl = URL.createObjectURL(file);
  return { id: `${Date.now()}_${Math.random().toString(36).slice(2)}`, file, previewUrl };
}

function analyzeCameraFrame(videoEl, canvasEl) {
  if (!videoEl || !canvasEl || videoEl.videoWidth < 100 || videoEl.videoHeight < 100) return null;
  const w = 320;
  const h = Math.max(180, Math.round((videoEl.videoHeight / videoEl.videoWidth) * w));
  canvasEl.width = w;
  canvasEl.height = h;
  const ctx = canvasEl.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(videoEl, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;
  const lum = new Float32Array(w * h);
  let sum = 0;
  for (let i = 0, p = 0; i < lum.length; i += 1, p += 4) {
    const y = px[p] * 0.2126 + px[p + 1] * 0.7152 + px[p + 2] * 0.0722;
    lum[i] = y;
    sum += y;
  }
  const avg = sum / lum.length;
  let varianceAcc = 0;
  for (let i = 0; i < lum.length; i += 1) {
    const d = lum[i] - avg;
    varianceAcc += d * d;
  }
  const std = Math.sqrt(varianceAcc / lum.length);

  // Simple sharpness proxy from neighboring luminance differences.
  let edgeAcc = 0;
  let edgeCount = 0;
  for (let y = 0; y < h - 1; y += 1) {
    for (let x = 0; x < w - 1; x += 1) {
      const i = y * w + x;
      edgeAcc += Math.abs(lum[i] - lum[i + 1]) + Math.abs(lum[i] - lum[i + w]);
      edgeCount += 2;
    }
  }
  const edge = edgeCount ? edgeAcc / edgeCount : 0;

  /** Centre “+” / crosshair heuristic: strong horizontal AND vertical edges through frame centre. */
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  let hLine = 0;
  let hN = 0;
  for (let x = 1; x < w - 1; x += 1) {
    hLine += Math.abs(lum[cy * w + x] - lum[cy * w + (x - 1)]);
    hN += 1;
  }
  hLine /= Math.max(1, hN);
  let vLine = 0;
  let vN = 0;
  for (let y = 1; y < h - 1; y += 1) {
    vLine += Math.abs(lum[y * w + cx] - lum[(y - 1) * w + cx]);
    vN += 1;
  }
  vLine /= Math.max(1, vN);
  const minAxis = Math.min(hLine, vLine);
  const maxAxis = Math.max(hLine, vLine);
  const axisBalance = maxAxis > 0 ? minAxis / maxAxis : 0;
  const crossLikely = minAxis > 4.2 && axisBalance > 0.32;
  const crossHint = crossLikely
    ? {
        status: 'visible',
        detail:
          'Centre cross detected — alignment mark or printed + is likely visible. You can capture when the page is steady.',
      }
    : {
        status: 'uncertain',
        detail:
          'Centre cross not clear — align the questionnaire + or alignment mark with the on-screen guides before capturing.',
      };

  const issues = [];
  if (avg < 72) issues.push('Too dark — add light or move closer to the light source.');
  if (avg > 210) issues.push('Too bright / glare — reduce direct light or tilt the page to remove reflections.');
  if (std < 26) issues.push('Low contrast — avoid shadows and ensure black marks are clearly visible.');
  if (edge < 14) issues.push('Blurry frame — hold still and keep the page flat/focused.');

  const score = Math.max(0, Math.round(100 - issues.length * 22 - Math.max(0, 16 - edge) * 1.2));
  return {
    score,
    avg,
    std,
    edge,
    status: issues.length ? 'needs_attention' : 'good',
    issues,
    crossHint,
    crossMetrics: { hLine: Math.round(hLine * 100) / 100, vLine: Math.round(vLine * 100) / 100, axisBalance: Math.round(axisBalance * 100) / 100 },
  };
}

function VarSelect({ def, value, onChange, disabled }) {
  const opts = useMemo(() => {
    const vl = def?.valueLabels || {};
    return Object.keys(vl)
      .map((k) => parseInt(k, 10))
      .filter((n) => !Number.isNaN(n))
      .sort((a, b) => a - b)
      .map((n) => ({ value: n, label: `${n} — ${vl[n]}` }));
  }, [def]);

  return (
    <select
      className={inputClass()}
      value={value === '' || value == null ? '' : String(value)}
      disabled={disabled}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === '' ? null : parseInt(v, 10));
      }}
    >
      <option value="">—</option>
      {opts.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function DistributionBars({ counts, min, max }) {
  const entries = [];
  for (let k = min; k <= max; k += 1) entries.push({ k, n: Number(counts[String(k)] || 0) });
  const maxN = Math.max(1, ...entries.map((e) => e.n));
  return (
    <div className="flex gap-1 h-9 items-end min-w-max">
      {entries.map(({ k, n }) => (
        <div key={k} className="flex flex-col items-center w-6 shrink-0">
          <div
            className="w-3 rounded-sm bg-brand-500/85 dark:bg-brand-400/75"
            style={{ height: `${Math.max(n ? 4 : 1, (n / maxN) * 28)}px` }}
            title={`${k}: ${n}`}
          />
          <span className="text-[9px] leading-none text-surface-500 mt-0.5 tabular-nums">{k}</span>
        </div>
      ))}
    </div>
  );
}

function ResearchResultsAnalysis({
  data,
  loading,
  includeDraft,
  setIncludeDraft,
  onRefresh,
  onExport,
  exportBusy,
}) {
  const sectionBlocks = useMemo(() => {
    if (!data?.variables?.length) return [];
    const bySec = { A: [], B: [], C: [], D: [] };
    for (const v of data.variables) {
      const s = v.section || 'A';
      if (bySec[s]) bySec[s].push(v);
    }
    return ['A', 'B', 'C', 'D'].map((sec) => {
      const vars = bySec[sec] || [];
      if (!vars.length) return null;
      const avgRate = vars.reduce((s, x) => s + (x.response_rate_pct || 0), 0) / vars.length;
      const likerts = vars.filter((x) => String(x.scale_type || '').startsWith('likert') && x.mean != null);
      const meanLikert =
        likerts.length > 0
          ? Math.round((likerts.reduce((s, x) => s + x.mean, 0) / likerts.length) * 1000) / 1000
          : null;
      return {
        sec,
        vars,
        avgRate: Math.round(avgRate * 10) / 10,
        meanLikert,
      };
    }).filter(Boolean);
  }, [data]);

  if (loading && !data) {
    return <p className="text-sm text-surface-500">Loading analysis…</p>;
  }

  const n = data?.participants_in_scope ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" className={btnSecondary()} disabled={loading} onClick={onRefresh}>
          Refresh analysis
        </button>
        {loading ? <span className="text-xs text-surface-500 self-center">Updating…</span> : null}
        <label className="inline-flex items-center gap-2 text-sm text-surface-700 dark:text-surface-300 cursor-pointer">
          <input type="checkbox" checked={includeDraft} onChange={(e) => setIncludeDraft(e.target.checked)} />
          Include draft participants
        </label>
        <button type="button" className={btnSecondary()} disabled={exportBusy} onClick={onExport}>
          Download Excel
        </button>
      </div>

      {data?.dataset_note ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
          {data.dataset_note}
        </div>
      ) : null}

      {n === 0 ? null : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-950 p-3">
              <p className="text-xs text-surface-500">In scope</p>
              <p className="text-xl font-bold text-surface-900 dark:text-surface-50 tabular-nums">{n}</p>
              <p className="text-[11px] text-surface-500 mt-1">participants</p>
            </div>
            <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-950 p-3">
              <p className="text-xs text-surface-500">Complete</p>
              <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
                {data.complete_count ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-950 p-3">
              <p className="text-xs text-surface-500">Draft</p>
              <p className="text-xl font-bold text-amber-800 dark:text-amber-200 tabular-nums">{data.draft_count ?? 0}</p>
            </div>
            <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-950 p-3">
              <p className="text-xs text-surface-500">Generated</p>
              <p className="text-sm font-medium text-surface-800 dark:text-surface-200">
                {data.generated_at ? formatDt(data.generated_at) : '—'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {sectionBlocks.map((block) => (
              <div
                key={block.sec}
                className="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-950 p-3 space-y-1"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-surface-500">Section {block.sec}</p>
                <p className="text-sm text-surface-800 dark:text-surface-200">
                  Avg response rate: <strong className="tabular-nums">{block.avgRate}%</strong>
                </p>
                {block.meanLikert != null ? (
                  <p className="text-sm text-surface-800 dark:text-surface-200">
                    Mean (Likert 1–5): <strong className="tabular-nums">{block.meanLikert}</strong>
                  </p>
                ) : (
                  <p className="text-xs text-surface-500">No Likert items in this section.</p>
                )}
              </div>
            ))}
          </div>

          {data.inferential ? (
            <div className="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-950 p-4 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-surface-900 dark:text-surface-100">
                  Reliability (Cronbach&apos;s α) &amp; factor screening
                </h3>
                <p className="text-xs text-surface-500 mt-1 max-w-3xl">
                  α uses listwise-complete cases on each section&apos;s Likert block (B, C, D). Item–total r correlates each item with the
                  section total minus that item. Bartlett and eigenvalues are exploratory only — use SPSS/R for CFA/EFA when reporting.
                </p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {(data.inferential.reliability || []).map((rel) => (
                  <div
                    key={rel.section}
                    className="rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50/50 dark:bg-surface-900/40 p-3 space-y-2"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-surface-500">Section {rel.section}</p>
                    <p className="text-sm text-surface-800 dark:text-surface-200">
                      Cronbach&apos;s α:{' '}
                      <strong className="tabular-nums">{rel.alpha != null ? rel.alpha : '—'}</strong>
                      {rel.n_listwise != null ? (
                        <span className="text-surface-500 font-normal">
                          {' '}
                          (n = {rel.n_listwise} listwise, k = {rel.k})
                        </span>
                      ) : null}
                    </p>
                    {rel.note ? <p className="text-xs text-amber-800 dark:text-amber-200">{rel.note}</p> : null}
                    {rel.items?.length ? (
                      <div className="overflow-x-auto max-h-48 overflow-y-auto">
                        <table className="min-w-full text-xs">
                          <thead>
                            <tr className="text-left text-surface-500 border-b border-surface-200 dark:border-surface-700">
                              <th className="py-1 pr-2">Item</th>
                              <th className="py-1 pr-2 tabular-nums">α if deleted</th>
                              <th className="py-1 tabular-nums">r (item–total)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rel.items.map((it) => (
                              <tr key={it.code} className="border-b border-surface-100 dark:border-surface-800/80">
                                <td className="py-1 pr-2 font-mono font-medium text-brand-600 dark:text-brand-400">{it.code}</td>
                                <td className="py-1 pr-2 tabular-nums">
                                  {it.alpha_if_deleted != null ? it.alpha_if_deleted : '—'}
                                </td>
                                <td className="py-1 tabular-nums">
                                  {it.item_total_correlation != null ? it.item_total_correlation : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
              {data.inferential.exploratory_factor_screening ? (
                <div className="rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50/30 dark:bg-surface-900/30 p-3 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-surface-500">All Likert items (V6–V47)</p>
                  <p className="text-sm text-surface-800 dark:text-surface-200">
                    Listwise n:{' '}
                    <strong className="tabular-nums">{data.inferential.exploratory_factor_screening.n_listwise}</strong>
                    {' · '}
                    Items:{' '}
                    <strong className="tabular-nums">{data.inferential.exploratory_factor_screening.p_items}</strong>
                  </p>
                  {data.inferential.exploratory_factor_screening.bartlett_note ? (
                    <p className="text-xs text-amber-800 dark:text-amber-200">
                      {data.inferential.exploratory_factor_screening.bartlett_note}
                    </p>
                  ) : null}
                  {data.inferential.exploratory_factor_screening.bartlett_chi_sq != null ? (
                    <p className="text-sm text-surface-800 dark:text-surface-200">
                      Bartlett test of sphericity: χ² ≈{' '}
                      <strong className="tabular-nums">{data.inferential.exploratory_factor_screening.bartlett_chi_sq}</strong>
                      {data.inferential.exploratory_factor_screening.bartlett_df != null ? (
                        <>
                          {' '}
                          (df = {data.inferential.exploratory_factor_screening.bartlett_df})
                        </>
                      ) : null}
                    </p>
                  ) : null}
                  {data.inferential.exploratory_factor_screening.eigenvalues_top?.length ? (
                    <div>
                      <p className="text-xs text-surface-500 mb-1">
                        Approximate top eigenvalues of R (scree-style; power method + deflation):
                      </p>
                      <p className="text-xs font-mono text-surface-700 dark:text-surface-300 break-all">
                        {data.inferential.exploratory_factor_screening.eigenvalues_top.join(', ')}
                      </p>
                    </div>
                  ) : null}
                  {data.inferential.exploratory_factor_screening.interpretation ? (
                    <p className="text-xs text-surface-500">{data.inferential.exploratory_factor_screening.interpretation}</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {['A', 'B', 'C', 'D'].map((sec) => {
            const block = sectionBlocks.find((b) => b.sec === sec);
            if (!block) return null;
            return (
              <div
                key={sec}
                className="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-950 overflow-hidden"
              >
                <div className="px-4 py-2 border-b border-surface-200 dark:border-surface-800 bg-surface-50/80 dark:bg-surface-900/50">
                  <h3 className="text-sm font-bold text-surface-900 dark:text-surface-100">Section {sec} — full distribution</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-[720px] w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-surface-500 border-b border-surface-200 dark:border-surface-700">
                        <th className="px-3 py-2 font-medium w-14">Var</th>
                        <th className="px-3 py-2 font-medium min-w-[180px]">Label</th>
                        <th className="px-3 py-2 font-medium tabular-nums">n</th>
                        <th className="px-3 py-2 font-medium tabular-nums">Missing</th>
                        <th className="px-3 py-2 font-medium tabular-nums">Rate %</th>
                        <th className="px-3 py-2 font-medium tabular-nums">Mean</th>
                        <th className="px-3 py-2 font-medium tabular-nums">SD</th>
                        <th className="px-3 py-2 font-medium min-w-[200px]">Distribution (code counts)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {block.vars.map((row) => (
                        <tr
                          key={row.code}
                          className="border-b border-surface-100 dark:border-surface-800/80 align-top hover:bg-surface-50/50 dark:hover:bg-surface-900/30"
                        >
                          <td className="px-3 py-2 font-mono text-xs font-semibold text-brand-600 dark:text-brand-400">
                            {row.code}
                          </td>
                          <td className="px-3 py-2 text-xs text-surface-700 dark:text-surface-300 max-w-xs">{row.label}</td>
                          <td className="px-3 py-2 tabular-nums text-surface-800 dark:text-surface-200">{row.n_valid}</td>
                          <td className="px-3 py-2 tabular-nums text-surface-800 dark:text-surface-200">{row.n_missing}</td>
                          <td className="px-3 py-2 tabular-nums text-surface-800 dark:text-surface-200">{row.response_rate_pct}</td>
                          <td className="px-3 py-2 tabular-nums text-surface-800 dark:text-surface-200">
                            {row.mean != null ? row.mean : '—'}
                          </td>
                          <td className="px-3 py-2 tabular-nums text-surface-800 dark:text-surface-200">
                            {row.std_sample != null ? row.std_sample : '—'}
                          </td>
                          <td className="px-3 py-2">
                            <DistributionBars counts={row.counts} min={row.min} max={row.max} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

export default function Research() {
  const [, setNavHidden] = useSecondaryNavHidden('research');
  useEffect(() => {
    setNavHidden(false);
  }, [setNavHidden]);

  const [schema, setSchema] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [localValues, setLocalValues] = useState({});
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  /** Participant ids currently running the reader API (allows overlap across participants). */
  const [activeScans, setActiveScans] = useState({});
  const [showCaptureFlash, setShowCaptureFlash] = useState(false);
  const [captureLocked, setCaptureLocked] = useState(false);
  const [exportDraft, setExportDraft] = useState(false);
  const [researchTab, setResearchTab] = useState('capture');
  const [listCaptureFile, setListCaptureFile] = useState(null);
  const [listCapturePreviewBusy, setListCapturePreviewBusy] = useState(false);
  const [listCapturePreview, setListCapturePreview] = useState(null);
  const [listCaptureBusy, setListCaptureBusy] = useState(false);
  const [listCaptureNote, setListCaptureNote] = useState('');
  const [analysisData, setAnalysisData] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [analysisIncludeDraft, setAnalysisIncludeDraft] = useState(false);
  const fileInputRef = useRef(null);
  /** Queued page images (camera captures or files) — only in memory until you run the reader. */
  const [pendingScans, setPendingScans] = useState([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [liveQuality, setLiveQuality] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const rowRefs = useRef({});
  const [lastReaderRunAt, setLastReaderRunAt] = useState(null);
  const pendingScansRef = useRef([]);
  pendingScansRef.current = pendingScans;
  const selectedIdRef = useRef(null);
  const activeScansRef = useRef({});
  selectedIdRef.current = selectedId;
  activeScansRef.current = activeScans;

  useEffect(() => {
    return () => {
      pendingScansRef.current.forEach(revokeScanPreview);
    };
  }, []);

  useEffect(() => {
    setLastReaderRunAt(null);
    if (Object.keys(activeScansRef.current).length === 0) {
      setCameraOpen(false);
    }
    setPendingScans((prev) => {
      prev.forEach(revokeScanPreview);
      return [];
    });
  }, [selectedId]);

  useEffect(() => {
    if (!cameraOpen) return undefined;
    let cancelled = false;
    let stream = null;
    setCameraError('');
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        if (!cancelled) setCameraError('This browser does not expose a camera API. Use “Add from files” or try Chrome / Safari on HTTPS.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const el = videoRef.current;
        if (el) {
          el.srcObject = stream;
          el.play().catch(() => {});
        }
      } catch (e) {
        const name = e?.name || '';
        let msg = e?.message || 'Could not open camera.';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          msg = 'Camera permission was denied. Allow camera for this site in the browser address bar, then try again.';
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          msg = 'No camera was found. Connect a camera or use “Add from files”.';
        }
        if (!cancelled) setCameraError(msg);
      }
    })();
    return () => {
      cancelled = true;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      const el = videoRef.current;
      if (el) el.srcObject = null;
      setLiveQuality(null);
    };
  }, [cameraOpen]);

  useEffect(() => {
    if (!cameraOpen) return undefined;
    const tick = () => {
      if (!videoRef.current || !canvasRef.current) return;
      const q = analyzeCameraFrame(videoRef.current, canvasRef.current);
      if (q) setLiveQuality(q);
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [cameraOpen]);

  const loadList = useCallback(async () => {
    const d = await researchApi.listParticipants();
    setParticipants(d.participants || []);
    return d.participants || [];
  }, []);

  const loadAnalysis = useCallback(async () => {
    setAnalysisLoading(true);
    setAnalysisError('');
    try {
      const d = await researchApi.analysis(analysisIncludeDraft);
      setAnalysisData(d);
    } catch (e) {
      setAnalysisError(e.message || 'Failed to load analysis');
      setAnalysisData(null);
    } finally {
      setAnalysisLoading(false);
    }
  }, [analysisIncludeDraft]);

  useEffect(() => {
    if (researchTab !== 'analysis') return;
    loadAnalysis();
  }, [researchTab, loadAnalysis]);

  const loadDetail = useCallback(async (id) => {
    if (!id) {
      setDetail(null);
      setLocalValues({});
      setNotes('');
      return;
    }
    const d = await researchApi.getParticipant(id);
    setDetail(d);
    setLocalValues({ ...(d.values || {}) });
    setNotes(d.notes || '');
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await researchApi.schema();
        if (!cancelled) setSchema(s);
        await loadList();
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load research module');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    (async () => {
      try {
        await loadDetail(selectedId);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load participant');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, loadDetail]);

  const variables = schema?.variables || [];
  const bySection = useMemo(() => {
    const g = { A: [], B: [], C: [], D: [] };
    for (const v of variables) {
      const s = v.section || 'A';
      if (!g[s]) g[s] = [];
      g[s].push(v);
    }
    return g;
  }, [variables]);

  const missingCount = useMemo(() => {
    const need = variables.length;
    let ok = 0;
    for (const v of variables) {
      const x = localValues[v.code];
      if (x != null && x !== '') ok += 1;
    }
    return need - ok;
  }, [variables, localValues]);

  const allCaptured = variables.length > 0 && missingCount === 0;
  const isComplete = detail?.status === 'complete';
  const variableByCode = useMemo(() => {
    const out = {};
    for (const v of variables) out[String(v.code || '').toUpperCase()] = v;
    return out;
  }, [variables]);

  /** Server asked for clarity; hide row prompt once user has picked an answer locally (before save). */
  const displayClarifyList = useMemo(
    () => (detail?.needs_clarification || []).filter((item) => item?.code && localValues[item.code] == null),
    [detail?.needs_clarification, localValues]
  );
  const clarifyReasonByCode = useMemo(() => {
    const m = {};
    for (const item of displayClarifyList) {
      if (item?.code) m[String(item.code).toUpperCase()] = item.reason || '';
    }
    return m;
  }, [displayClarifyList]);
  const clarityBySection = useMemo(() => {
    const groups = {};
    for (const item of displayClarifyList) {
      const code = String(item?.code || '').toUpperCase();
      if (!code) continue;
      const def = variableByCode[code];
      const section = def?.section || '?';
      if (!groups[section]) groups[section] = [];
      groups[section].push({
        code,
        label: def?.label || '',
        reason: item?.reason || 'Could not read this field clearly.',
      });
    }
    return Object.entries(groups).sort(([a], [b]) => String(a).localeCompare(String(b)));
  }, [displayClarifyList, variableByCode]);
  const latestScanReadable = !!detail?.last_scan_at && displayClarifyList.length === 0;

  const activeScanCodes = useMemo(
    () =>
      Object.keys(activeScans).map(
        (id) => participants.find((p) => String(p.id) === String(id))?.participant_code || '…'
      ),
    [activeScans, participants]
  );
  const readerRunningHere = !!(selectedId && activeScans[selectedId]);

  const jumpToField = (code) => {
    const key = String(code || '').toUpperCase();
    const el = rowRefs.current[key];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const onNewParticipant = async () => {
    setError('');
    setBusy(true);
    try {
      const p = await researchApi.createParticipant({});
      await loadList();
      setSelectedId(p.id);
    } catch (e) {
      setError(e.message || 'Could not create participant');
    } finally {
      setBusy(false);
    }
  };

  const onSaveDraft = async () => {
    if (!selectedId) return;
    setError('');
    setBusy(true);
    try {
      await researchApi.patchParticipant(selectedId, { values: localValues, notes });
      await loadDetail(selectedId);
      await loadList();
    } catch (e) {
      setError(e.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const onMarkComplete = async () => {
    if (!selectedId) return;
    setError('');
    setBusy(true);
    try {
      await researchApi.patchParticipant(selectedId, { values: localValues, notes, status: 'complete' });
      await loadDetail(selectedId);
      await loadList();
    } catch (e) {
      setError(e.message || 'Could not complete');
    } finally {
      setBusy(false);
    }
  };

  const runScanWithFiles = async (files, participantId) => {
    const pid = participantId ?? selectedIdRef.current;
    if (!pid || !files?.length) return;
    setError('');
    setActiveScans((s) => ({ ...s, [pid]: true }));
    try {
      const fd = new FormData();
      for (const f of files) fd.append('images', f);
      const r = await researchApi.scanParticipant(pid, fd);
      if (selectedIdRef.current === pid) {
        setLocalValues((prev) => ({ ...prev, ...(r.values || {}) }));
        await loadDetail(pid);
      }
      setLastReaderRunAt(new Date().toISOString());
      await loadList();
      if (r.all_fields_captured && selectedIdRef.current === pid) {
        setError('');
      }
    } catch (e) {
      if (selectedIdRef.current === pid) {
        setError(e.message || 'Scan failed');
      }
    } finally {
      setActiveScans((s) => {
        const n = { ...s };
        delete n[pid];
        return n;
      });
    }
  };

  const onRunReaderFromQueue = async () => {
    const snapshot = [...pendingScansRef.current];
    const files = snapshot.map((p) => p.file);
    const sentIds = new Set(snapshot.map((p) => p.id));
    const pid = selectedIdRef.current;
    if (!files.length || !pid) return;
    try {
      await runScanWithFiles(files, pid);
    } finally {
      setPendingScans((prev) => {
        const removed = prev.filter((p) => sentIds.has(p.id));
        removed.forEach(revokeScanPreview);
        return prev.filter((p) => !sentIds.has(p.id));
      });
    }
  };

  const captureVideoFrameToQueue = () => {
    if (captureLocked) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2 || video.videoWidth < 16) {
      setCameraError('Wait for the camera preview to appear, then capture again.');
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    setCaptureLocked(true);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setCaptureLocked(false);
          return;
        }
        const file = new File([blob], `page_${Date.now()}.jpg`, { type: 'image/jpeg' });
        setPendingScans((prev) => [...prev, scanQueueEntryFromFile(file)]);
        setCameraError('');
        setShowCaptureFlash(true);
        window.setTimeout(() => setShowCaptureFlash(false), 720);
        window.setTimeout(() => setCaptureLocked(false), 420);
      },
      'image/jpeg',
      0.82
    );
  };

  const removePendingScan = (id) => {
    setPendingScans((prev) => {
      const hit = prev.find((p) => p.id === id);
      if (hit) revokeScanPreview(hit);
      return prev.filter((p) => p.id !== id);
    });
  };

  const clearPendingScans = () => {
    setPendingScans((prev) => {
      prev.forEach(revokeScanPreview);
      return [];
    });
  };

  const onDelete = async () => {
    if (!selectedId) return;
    if (!window.confirm('Delete this participant and all captured values?')) return;
    setBusy(true);
    try {
      await researchApi.deleteParticipant(selectedId);
      setSelectedId(null);
      setDetail(null);
      await loadList();
    } catch (e) {
      setError(e.message || 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  const onExport = async () => {
    setError('');
    try {
      const name = `research_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
      await downloadAttachmentWithAuth(researchApi.exportUrl(exportDraft), name);
    } catch (e) {
      setError(e.message || 'Export failed');
    }
  };

  const onExportAnalysis = async () => {
    setError('');
    try {
      const name = `research_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
      await downloadAttachmentWithAuth(researchApi.exportUrl(analysisIncludeDraft), name);
    } catch (e) {
      setError(e.message || 'Export failed');
    }
  };

  const onGenerateListCaptureExcel = async () => {
    if (!listCaptureFile) return;
    setError('');
    setListCaptureBusy(true);
    setListCaptureNote('');
    try {
      const fd = new FormData();
      fd.append('document', listCaptureFile);
      const { blob, filename } = await researchApi.extractListDataCaptureExcel(fd);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || `list_data_capture_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setListCaptureNote('Excel generated successfully. Review extracted rows and template before final use.');
    } catch (e) {
      setError(e.message || 'Could not generate list data capture workbook');
    } finally {
      setListCaptureBusy(false);
    }
  };

  const onPreviewListCapture = async () => {
    if (!listCaptureFile) return;
    setError('');
    setListCaptureNote('');
    setListCapturePreviewBusy(true);
    try {
      const fd = new FormData();
      fd.append('document', listCaptureFile);
      const data = await researchApi.previewListDataCapture(fd);
      setListCapturePreview(data);
    } catch (e) {
      setError(e.message || 'Could not generate list data preview');
    } finally {
      setListCapturePreviewBusy(false);
    }
  };

  return (
    <div className="flex-1 min-w-0 min-h-0 overflow-auto p-4 sm:p-6 scrollbar-thin">
      <div className="w-full max-w-7xl mx-auto space-y-6">
      {cameraOpen ? (
        <div
          className="fixed inset-0 z-[100] flex flex-col bg-black"
          role="dialog"
          aria-modal="true"
          aria-labelledby="research-camera-title"
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2 bg-surface-950 text-white">
            <h2 id="research-camera-title" className="text-sm font-semibold">
              Scan pages — in-app camera
            </h2>
            <button
              type="button"
              className="rounded-lg px-3 py-1.5 text-sm font-medium bg-white/10 hover:bg-white/20"
              onClick={() => setCameraOpen(false)}
            >
              Close
            </button>
          </div>
          <div className="relative flex-1 min-h-0 bg-black">
            <video
              ref={videoRef}
              className="absolute inset-0 h-full w-full object-cover"
              playsInline
              muted
              autoPlay
            />
            <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
            <div className="pointer-events-none absolute inset-x-0 top-1/3 bottom-1/3 border-y-2 border-white/30" aria-hidden="true" />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
              <div className="relative h-20 w-20 sm:h-24 sm:w-24">
                <div className="absolute left-1/2 top-0 bottom-0 w-0.5 -translate-x-1/2 bg-white/55 shadow-sm" />
                <div className="absolute top-1/2 left-0 right-0 h-0.5 -translate-y-1/2 bg-white/55 shadow-sm" />
              </div>
            </div>
            {liveQuality?.crossHint ? (
              <div
                className={`pointer-events-none absolute left-2 top-2 z-10 flex max-w-[min(100%-1rem,220px)] items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold leading-tight shadow-lg ring-1 ring-black/40 ${
                  liveQuality.crossHint.status === 'visible'
                    ? 'bg-emerald-600/95 text-white'
                    : 'bg-amber-600/95 text-white'
                }`}
                aria-live="polite"
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    liveQuality.crossHint.status === 'visible' ? 'bg-white' : 'bg-white/90 animate-pulse'
                  }`}
                />
                {liveQuality.crossHint.status === 'visible'
                  ? 'Centre + detected — OK to capture'
                  : 'Centre + not clear — align with guides'}
              </div>
            ) : null}
            {showCaptureFlash ? (
              <div
                className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/25"
                aria-live="polite"
              >
                <div className="rounded-full bg-emerald-500 p-5 shadow-2xl ring-4 ring-emerald-300/80 animate-[ping_0.6s_ease-out_1]">
                  <svg className="h-14 w-14 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
            ) : null}
          </div>
          {cameraError ? (
            <div className="px-3 py-2 text-sm text-amber-100 bg-amber-950/90">{cameraError}</div>
          ) : null}
          {!cameraError && liveQuality ? (
            <div
              className={`px-3 py-2 text-sm ${
                liveQuality.status === 'good'
                  ? 'text-emerald-100 bg-emerald-950/90'
                  : 'text-amber-100 bg-amber-950/90'
              }`}
            >
              {liveQuality.status === 'good' ? (
                <p>
                  <strong>Camera quality: green.</strong> Lighting and sharpness look good. Capture pages now.
                </p>
              ) : (
                <div className="space-y-1">
                  <p className="font-semibold">
                    Camera quality needs attention ({liveQuality.score}%)
                  </p>
                  <ul className="list-disc pl-5">
                    {liveQuality.issues.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                    <li>Keep the full page inside the guide lines and avoid tilted angles.</li>
                  </ul>
                </div>
              )}
              {liveQuality.crossHint ? (
                <p
                  className={`mt-2 text-xs font-medium ${
                    liveQuality.crossHint.status === 'visible' ? 'text-emerald-200' : 'text-amber-200'
                  }`}
                >
                  <strong>Centre mark:</strong> {liveQuality.crossHint.detail}
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-center gap-3 px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-surface-950">
            <button
              type="button"
              className="rounded-full h-16 w-16 border-4 border-white bg-white/20 hover:bg-white/30 disabled:opacity-40"
              disabled={captureLocked || !!cameraError}
              onClick={captureVideoFrameToQueue}
              aria-label="Capture this page"
            />
            <p className="text-xs text-surface-300 max-w-[200px]">
              Each tap adds one page — a green tick confirms the shot. Wait for the tick before the next capture to avoid duplicates.
            </p>
          </div>
        </div>
      ) : null}
      <header className="space-y-3">
        <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-50">Research</h1>
        <div className="flex gap-0 border-b border-surface-200 dark:border-surface-700 overflow-x-auto">
          <button
            type="button"
            className={`shrink-0 px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
              researchTab === 'capture'
                ? 'border-brand-600 text-brand-700 dark:text-brand-300'
                : 'border-transparent text-surface-600 hover:text-surface-900 dark:text-surface-400 dark:hover:text-surface-100 font-medium'
            }`}
            onClick={() => {
              setResearchTab('capture');
              setError('');
            }}
          >
            Questionnaire capture
          </button>
          <button
            type="button"
            className={`shrink-0 px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
              researchTab === 'analysis'
                ? 'border-brand-600 text-brand-700 dark:text-brand-300'
                : 'border-transparent text-surface-600 hover:text-surface-900 dark:text-surface-400 dark:hover:text-surface-100 font-medium'
            }`}
            onClick={() => {
              setResearchTab('analysis');
              setError('');
            }}
          >
            Results analysis
          </button>
          <button
            type="button"
            className={`shrink-0 px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
              researchTab === 'list_capture'
                ? 'border-brand-600 text-brand-700 dark:text-brand-300'
                : 'border-transparent text-surface-600 hover:text-surface-900 dark:text-surface-400 dark:hover:text-surface-100 font-medium'
            }`}
            onClick={() => {
              setResearchTab('list_capture');
              setError('');
            }}
          >
            List data capture
          </button>
        </div>
        {researchTab === 'capture' ? (
          <div className="flex items-start gap-2 text-sm text-surface-600 dark:text-surface-400">
            <span>Use the info icon for capture and AI guidance.</span>
            <InfoHint
              title="Research capture help"
              text="Chapter 4 data entry for the coal road freight study (V1–V47). Use the in-app camera (live preview, tap capture — nothing is saved to your camera roll) or add files from your device."
              bullets={[
                'AI assist for “Run reader” needs OPENAI_API_KEY in the server .env and a server restart.',
                'Without AI, fill V1–V47 manually.',
                'With AI on, anything not clearly readable stays empty and you are prompted field-by-field — the app does not guess.',
                'Review every value against the paper before marking complete.',
                'Export a wide-format Excel workbook (Data + Codebook) for analysis.',
              ]}
            />
          </div>
        ) : researchTab === 'list_capture' ? (
          <div className="flex items-start gap-2 text-sm text-surface-600 dark:text-surface-400">
            <span>Upload a list-style PDF and generate an AI-assisted professional Excel template + extracted rows.</span>
            <InfoHint
              title="List data capture help"
              text="Use this when you have a document like SPM107V and need a structured Excel workbook. AI infers columns and extracts rows, then generates a polished template for final verification."
              bullets={[
                'Upload one PDF at a time; text-based PDFs work best.',
                'AI extraction needs OPENAI_API_KEY in server .env and a server restart.',
                'The workbook includes Captured Data, Template, Field Guide, and Read_me sheets.',
                'Always review extracted rows for accuracy before publication.',
              ]}
            />
          </div>
        ) : (
          <div className="flex items-start gap-2 text-sm text-surface-600 dark:text-surface-400">
            <span>Descriptive statistics and distributions across all participants in scope.</span>
            <InfoHint
              title="Results analysis help"
              text="This tab summarises captured data: response rates, counts per answer code, means and standard deviations. Use “complete only” for publication-ready stats, or include drafts to monitor fieldwork progress."
              bullets={[
                'Likert items (V6–V47): codes 1 = strongly disagree … 5 = strongly agree.',
                'Section cards show average response rate and mean score across Likert items in that section.',
                'Cronbach’s α, α-if-item-deleted, and item–total correlations use listwise-complete cases per section (B, C, D).',
                'Bartlett’s test and top eigenvalues of R are exploratory (not rotated factor loadings); use SPSS/R for full EFA/CFA.',
                'Download Excel for raw rows and the full codebook.',
              ]}
            />
          </div>
        )}
      </header>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {Object.keys(activeScans).length > 0 ? (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-950 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-100">
          Reader running for{' '}
          <strong>{activeScanCodes.join(', ')}</strong>
          {readerRunningHere ? ' — you can open the camera or queue pages for other participants while this finishes.' : ''}
        </div>
      ) : null}

      {researchTab === 'capture' ? (
        <>
      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" className={btnPrimary()} disabled={busy} onClick={onNewParticipant}>
          New participant
        </button>
        <button type="button" className={btnSecondary()} disabled={busy} onClick={() => loadList()}>
          Refresh list
        </button>
        <label className="inline-flex items-center gap-2 text-sm text-surface-700 dark:text-surface-300 cursor-pointer">
          <input type="checkbox" checked={exportDraft} onChange={(e) => setExportDraft(e.target.checked)} />
          Include draft rows in Excel
        </label>
        <button type="button" className={btnSecondary()} disabled={busy} onClick={onExport}>
          Download Excel
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 sm:gap-6">
        <div className="xl:col-span-4 rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-950 p-4">
          <h2 className="text-sm font-semibold text-surface-800 dark:text-surface-200 mb-3">Participants</h2>
          <ul className="space-y-1 max-h-[300px] sm:max-h-[420px] xl:max-h-[calc(100vh-20rem)] overflow-y-auto">
            {participants.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(p.id);
                    setError('');
                  }}
                  className={`w-full text-left rounded-lg px-3 py-2 text-sm ${
                    selectedId === p.id
                      ? 'bg-brand-500/15 text-brand-700 dark:text-brand-300 border border-brand-400/40'
                      : 'hover:bg-surface-100 dark:hover:bg-surface-900 border border-transparent'
                  }`}
                >
                  <div className="font-medium">{p.participant_code}</div>
                  <div className="text-xs text-surface-500">
                    {p.status} · {p.filled_count}/{p.total_vars} fields · {formatDt(p.created_at)}
                  </div>
                </button>
              </li>
            ))}
          </ul>
          {!participants.length ? <p className="text-sm text-surface-500">No participants yet. Create one to begin.</p> : null}
        </div>

        <div className="xl:col-span-8 space-y-4">
          {!selectedId ? (
            <p className="text-surface-600 dark:text-surface-400 text-sm">Select a participant or create a new one.</p>
          ) : (
            <>
              <div className="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-950 p-3 sm:p-4 space-y-3">
                <div className="flex flex-wrap justify-between gap-2 items-start">
                  <div>
                    <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-50">{detail?.participant_code}</h2>
                    <p className="text-sm text-surface-500">
                      Status: <strong>{detail?.status}</strong>
                      {detail?.last_scan_at ? ` · Last scan ${formatDt(detail.last_scan_at)}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                    <button type="button" className={btnDanger()} disabled={busy || isComplete} onClick={onDelete}>
                      Delete
                    </button>
                  </div>
                </div>

                {displayClarifyList.length > 0 && !isComplete ? (
                  <div className="rounded-lg border border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
                    <p className="font-semibold mb-2">Reader found unclear fields ({displayClarifyList.length})</p>
                    <ul className="list-disc pl-5 space-y-2 max-h-48 overflow-y-auto">
                      {displayClarifyList.map((item) => (
                        <li key={item.code}>
                          <strong>{item.code}</strong>
                          {item.reason ? ` — ${item.reason}` : ''}
                          <button
                            type="button"
                            className="ml-2 text-xs underline underline-offset-2"
                            onClick={() => jumpToField(item.code)}
                          >
                            Go to field
                          </button>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs opacity-90">
                      Fields below are highlighted. Choose the correct answer from the questionnaire, then <strong>Save draft</strong>.
                      Items disappear from this list once a value is saved for that field.
                    </p>
                  </div>
                ) : null}

                {allCaptured && !isComplete ? (
                  <div className="rounded-lg border border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/50 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-100">
                    <strong>All 47 variables captured.</strong> Mark this participant complete to lock the record, then use{' '}
                    <strong>New participant</strong> to scan the next questionnaire.
                  </div>
                ) : null}

                {isComplete ? (
                  <div className="rounded-lg border border-sky-300 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/40 px-4 py-3 text-sm text-sky-900 dark:text-sky-100">
                    This participant is <strong>complete</strong>. Start a <strong>New participant</strong> to capture another paper.
                  </div>
                ) : null}

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-200">Scan pages</h3>
                  <p className="text-xs text-surface-500">
                    Queue every page in order (consent, Section A, B, C, D). The in-app camera keeps photos in the browser only until
                    you run the reader — they are not written to your gallery. Use good lighting; anything unclear is left for you to
                    enter.
                  </p>
                  {detail?.last_scan_at || lastReaderRunAt ? (
                    displayClarifyList.length > 0 ? (
                      <div className="rounded-lg border border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-950 dark:text-amber-100 space-y-2">
                        <p className="font-semibold">
                          Visibility diagnostics: {displayClarifyList.length} field{displayClarifyList.length === 1 ? '' : 's'} not clearly readable.
                        </p>
                        <p className="text-xs opacity-90">
                          Re-scan with better alignment/lighting, or fill these exact fields manually.
                        </p>
                        <div className="space-y-2 max-h-52 overflow-y-auto">
                          {clarityBySection.map(([section, entries]) => (
                            <div key={section}>
                              <p className="text-xs font-semibold uppercase tracking-wide">Section {section}</p>
                              <ul className="list-disc pl-5 mt-1 space-y-1">
                                {entries.map((x) => (
                                  <li key={x.code}>
                                    <strong>{x.code}</strong>
                                    {x.label ? ` (${x.label})` : ''}: {x.reason}
                                    <button
                                      type="button"
                                      className="ml-2 text-xs underline underline-offset-2"
                                      onClick={() => jumpToField(x.code)}
                                    >
                                      Go to field
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : latestScanReadable ? (
                      <div className="rounded-lg border border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/50 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-100">
                        <strong>Visibility diagnostics: green.</strong> The latest scan is clearly readable and no unclear fields were detected.
                      </div>
                    ) : null
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={btnPrimary()}
                      disabled={busy || isComplete}
                      onClick={() => setCameraOpen(true)}
                    >
                      Open in-app camera
                    </button>
                    <button
                      type="button"
                      className={btnSecondary()}
                      disabled={busy || isComplete}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Add from files
                    </button>
                    <input
                      ref={(el) => {
                        fileInputRef.current = el;
                      }}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      disabled={busy || isComplete}
                      onChange={(e) => {
                        const list = e.target.files;
                        if (list?.length) {
                          setPendingScans((prev) => [...prev, ...Array.from(list).map((f) => scanQueueEntryFromFile(f))]);
                        }
                        e.target.value = '';
                      }}
                    />
                  </div>
                  {pendingScans.length > 0 ? (
                    <div className="rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900/60 p-3 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium text-surface-800 dark:text-surface-200">
                          {pendingScans.length} page{pendingScans.length === 1 ? '' : 's'} queued
                        </span>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className={btnSecondary()}
                            disabled={busy || isComplete}
                            onClick={clearPendingScans}
                          >
                            Clear queue
                          </button>
                          <button
                            type="button"
                            className={btnPrimary()}
                            disabled={readerRunningHere || busy || isComplete}
                            onClick={onRunReaderFromQueue}
                          >
                            {readerRunningHere ? 'Reader running…' : 'Run reader on queued pages'}
                          </button>
                        </div>
                      </div>
                      {readerRunningHere ? (
                        <div
                          className="flex items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-2.5 py-2 text-xs text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100"
                          aria-live="polite"
                        >
                          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-sky-600 border-t-transparent dark:border-sky-300 dark:border-t-transparent" />
                          Reader is processing queued pages for this participant...
                        </div>
                      ) : null}
                      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                        {pendingScans.map((entry, idx) => (
                          <div key={entry.id} className="relative shrink-0 w-20">
                            <img
                              src={entry.previewUrl}
                              alt={`Queued page ${idx + 1}`}
                              className="h-24 w-20 object-cover rounded border border-surface-200 dark:border-surface-600"
                            />
                            <button
                              type="button"
                              className="absolute -top-1 -right-1 h-6 w-6 rounded-full bg-red-600 text-white text-xs font-bold leading-6 shadow"
                              onClick={() => removePendingScan(entry.id)}
                              disabled={busy || isComplete}
                              aria-label={`Remove page ${idx + 1}`}
                            >
                              ×
                            </button>
                            <div className="text-center text-[10px] text-surface-500 mt-0.5">{idx + 1}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-surface-500">Queue at least one page, then run the reader.</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-surface-800 dark:text-surface-200">Notes (optional)</label>
                  <textarea
                    className={`${inputClass()} min-h-[72px]`}
                    value={notes}
                    disabled={busy || isComplete}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. batch number, paper condition"
                  />
                </div>

                <div className="sticky bottom-0 z-20 -mx-3 px-3 py-3 bg-white/95 dark:bg-surface-950/95 backdrop-blur border-t border-surface-200 dark:border-surface-800 sm:static sm:z-auto sm:mx-0 sm:px-0 sm:py-0 sm:bg-transparent sm:backdrop-blur-none sm:border-0">
                  <div className="flex flex-wrap gap-2">
                  <button type="button" className={btnSecondary()} disabled={busy || isComplete} onClick={onSaveDraft}>
                    Save draft
                  </button>
                  <button
                    type="button"
                    className={btnPrimary()}
                    disabled={busy || isComplete || !allCaptured}
                    onClick={onMarkComplete}
                  >
                    Mark complete
                  </button>
                  </div>
                </div>
              </div>

              {['A', 'B', 'C', 'D'].map((sec) =>
                (bySection[sec] || []).length ? (
                  <div
                    key={sec}
                    className="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-950 p-3 sm:p-4"
                  >
                    <h3 className="text-sm font-bold text-surface-900 dark:text-surface-100 mb-3 tracking-wide">
                      SECTION {sec}
                    </h3>
                    <div className="space-y-4">
                      {bySection[sec].map((v) => {
                        const ask = clarifyReasonByCode[v.code];
                        return (
                        <div
                          key={v.code}
                          ref={(el) => {
                            if (el) rowRefs.current[String(v.code).toUpperCase()] = el;
                          }}
                          className={`grid grid-cols-1 md:grid-cols-12 gap-2 md:items-start border-b border-surface-100 dark:border-surface-900 pb-3 ${
                            ask ? 'rounded-lg border-2 border-amber-400 bg-amber-50/60 dark:bg-amber-950/25 dark:border-amber-600 p-3 -mx-1' : ''
                          }`}
                        >
                          <div className="md:col-span-3">
                            <div className="text-xs font-semibold text-brand-600 dark:text-brand-400">{v.code}</div>
                            <div className="text-xs text-surface-600 dark:text-surface-400 leading-snug">{v.label}</div>
                            {ask ? (
                              <p className="mt-1 text-xs font-medium text-amber-900 dark:text-amber-200">{ask}</p>
                            ) : null}
                          </div>
                          <div className="md:col-span-9">
                            <VarSelect
                              def={v}
                              value={localValues[v.code]}
                              disabled={busy || isComplete}
                              onChange={(n) => setLocalValues((prev) => ({ ...prev, [v.code]: n }))}
                            />
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null
              )}
            </>
          )}
        </div>
      </div>
        </>
      ) : researchTab === 'list_capture' ? (
        <div className="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-950 p-4 sm:p-5 space-y-4">
          <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-50">List data capture</h2>
          <p className="text-sm text-surface-600 dark:text-surface-400 max-w-3xl">
            Upload a PDF (for example SPM107V). AI will read the document, infer a structured capture layout, and generate a professional
            Excel workbook with data and a clean template for manual continuation.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              accept="application/pdf,.pdf"
              disabled={listCaptureBusy}
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setListCaptureFile(f);
                setListCaptureNote('');
                setListCapturePreview(null);
              }}
              className={inputClass()}
            />
            <button
              type="button"
              className={btnSecondary()}
              disabled={listCapturePreviewBusy || listCaptureBusy || !listCaptureFile}
              onClick={onPreviewListCapture}
            >
              {listCapturePreviewBusy ? 'Previewing…' : 'Preview with AI'}
            </button>
            <button
              type="button"
              className={btnPrimary()}
              disabled={listCaptureBusy || !listCaptureFile}
              onClick={onGenerateListCaptureExcel}
            >
              {listCaptureBusy ? 'Generating workbook…' : 'Generate AI Excel workbook'}
            </button>
          </div>
          {listCaptureFile ? (
            <p className="text-xs text-surface-500">
              Selected file: <strong>{listCaptureFile.name}</strong>
            </p>
          ) : null}
          {listCaptureNote ? (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/50 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-100">
              {listCaptureNote}
            </div>
          ) : null}
          {listCapturePreview ? (
            <div className="space-y-3 rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-50/60 dark:bg-surface-900/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-100">
                  Preview: {listCapturePreview.workbook_title || 'List data capture'}
                </h3>
                <span className="text-xs text-surface-500">
                  Showing first {Math.min(20, Number(listCapturePreview.preview_rows?.length || 0))} of {Number(listCapturePreview.row_count || 0)} extracted rows
                </span>
              </div>
              <div className="overflow-x-auto rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-950">
                <table className="min-w-[760px] w-full text-xs">
                  <thead>
                    <tr className="bg-surface-100 dark:bg-surface-800 text-surface-700 dark:text-surface-200">
                      {(listCapturePreview.columns || []).map((col) => (
                        <th key={col.key} className="px-2 py-2 text-left font-semibold border-b border-surface-200 dark:border-surface-700">
                          {col.header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(listCapturePreview.preview_rows || []).length ? (
                      listCapturePreview.preview_rows.map((row, idx) => (
                        <tr key={idx} className="border-b border-surface-100 dark:border-surface-800">
                          {(listCapturePreview.columns || []).map((col) => (
                            <td key={`${idx}_${col.key}`} className="px-2 py-1.5 text-surface-700 dark:text-surface-300 align-top">
                              {row[col.key] || '—'}
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          className="px-2 py-3 text-surface-500"
                          colSpan={Math.max(1, (listCapturePreview.columns || []).length)}
                        >
                          No rows were confidently extracted from this PDF. You can still download the template workbook.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          {analysisError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              {analysisError}
            </div>
          ) : null}
          <ResearchResultsAnalysis
            data={analysisData}
            loading={analysisLoading}
            includeDraft={analysisIncludeDraft}
            setIncludeDraft={setAnalysisIncludeDraft}
            onRefresh={loadAnalysis}
            onExport={onExportAnalysis}
            exportBusy={busy}
          />
        </>
      )}
      </div>
    </div>
  );
}
