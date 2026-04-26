import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { research as researchApi, downloadAttachmentWithAuth } from './api';
import { useSecondaryNavHidden } from './lib/useSecondaryNavHidden.js';

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
  const [exportDraft, setExportDraft] = useState(false);
  const fileInputRef = useRef(null);
  /** Queued page images (camera captures or files) — only in memory until you run the reader. */
  const [pendingScans, setPendingScans] = useState([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const pendingScansRef = useRef([]);
  pendingScansRef.current = pendingScans;

  useEffect(() => {
    return () => {
      pendingScansRef.current.forEach(revokeScanPreview);
    };
  }, []);

  useEffect(() => {
    setCameraOpen(false);
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
    };
  }, [cameraOpen]);

  const loadList = useCallback(async () => {
    const d = await researchApi.listParticipants();
    setParticipants(d.participants || []);
    return d.participants || [];
  }, []);

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

  const runScanWithFiles = async (files) => {
    if (!selectedId || !files?.length) return;
    setError('');
    setBusy(true);
    try {
      const fd = new FormData();
      for (const f of files) fd.append('images', f);
      const r = await researchApi.scanParticipant(selectedId, fd);
      setLocalValues((prev) => ({ ...prev, ...(r.values || {}) }));
      await loadDetail(selectedId);
      await loadList();
      if (r.all_fields_captured) {
        setError('');
      }
    } catch (e) {
      setError(e.message || 'Scan failed');
    } finally {
      setBusy(false);
    }
  };

  const onRunReaderFromQueue = async () => {
    const files = pendingScans.map((p) => p.file);
    if (!files.length) return;
    await runScanWithFiles(files);
    setPendingScans((prev) => {
      prev.forEach(revokeScanPreview);
      return [];
    });
  };

  const captureVideoFrameToQueue = () => {
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
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `page_${Date.now()}.jpg`, { type: 'image/jpeg' });
        setPendingScans((prev) => [...prev, scanQueueEntryFromFile(file)]);
        setCameraError('');
      },
      'image/jpeg',
      0.9
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

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
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
          </div>
          {cameraError ? (
            <div className="px-3 py-2 text-sm text-amber-100 bg-amber-950/90">{cameraError}</div>
          ) : null}
          <div className="flex flex-wrap items-center justify-center gap-3 px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-surface-950">
            <button
              type="button"
              className="rounded-full h-16 w-16 border-4 border-white bg-white/20 hover:bg-white/30 disabled:opacity-40"
              disabled={busy || !!cameraError}
              onClick={captureVideoFrameToQueue}
              aria-label="Capture this page"
            />
            <p className="text-xs text-surface-300 max-w-[200px]">
              Each tap adds a page to your queue. Close when done, then run the reader from the form.
            </p>
          </div>
        </div>
      ) : null}
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-50">Research — questionnaire capture</h1>
        <p className="text-sm text-surface-600 dark:text-surface-400 max-w-3xl">
          Chapter 4 data entry for the coal road freight study (V1–V47). Use the in-app camera (live preview, tap capture — nothing
          is saved to your camera roll) or add files from your device. AI assist for “Run reader” needs{' '}
          <code className="text-xs bg-surface-100 dark:bg-surface-800 px-1 rounded">OPENAI_API_KEY</code> in the server{' '}
          <code className="text-xs bg-surface-100 dark:bg-surface-800 px-1 rounded">.env</code> and a server restart; without it, fill
          V1–V47 manually. With AI on, anything not clearly readable stays empty and you are prompted field-by-field — the app does
          not guess. Review every value against the paper before marking complete. Export a wide-format Excel workbook (Data +
          Codebook) for analysis.
        </p>
      </header>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}

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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-950 p-4">
          <h2 className="text-sm font-semibold text-surface-800 dark:text-surface-200 mb-3">Participants</h2>
          <ul className="space-y-1 max-h-[480px] overflow-y-auto">
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

        <div className="lg:col-span-2 space-y-4">
          {!selectedId ? (
            <p className="text-surface-600 dark:text-surface-400 text-sm">Select a participant or create a new one.</p>
          ) : (
            <>
              <div className="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-950 p-4 space-y-3">
                <div className="flex flex-wrap justify-between gap-2 items-start">
                  <div>
                    <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-50">{detail?.participant_code}</h2>
                    <p className="text-sm text-surface-500">
                      Status: <strong>{detail?.status}</strong>
                      {detail?.last_scan_at ? ` · Last scan ${formatDt(detail.last_scan_at)}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={btnDanger()} disabled={busy || isComplete} onClick={onDelete}>
                      Delete
                    </button>
                  </div>
                </div>

                {displayClarifyList.length > 0 && !isComplete ? (
                  <div className="rounded-lg border border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
                    <p className="font-semibold mb-2">Please clarify from the paper (reader did not infer these)</p>
                    <ul className="list-disc pl-5 space-y-1 max-h-48 overflow-y-auto">
                      {displayClarifyList.map((item) => (
                        <li key={item.code}>
                          <strong>{item.code}</strong>
                          {item.reason ? ` — ${item.reason}` : ''}
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
                          <button type="button" className={btnSecondary()} disabled={busy || isComplete} onClick={clearPendingScans}>
                            Clear queue
                          </button>
                          <button
                            type="button"
                            className={btnPrimary()}
                            disabled={busy || isComplete}
                            onClick={onRunReaderFromQueue}
                          >
                            Run reader on queued pages
                          </button>
                        </div>
                      </div>
                      <div className="flex gap-2 overflow-x-auto pb-1">
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

              {['A', 'B', 'C', 'D'].map((sec) =>
                (bySection[sec] || []).length ? (
                  <div
                    key={sec}
                    className="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-950 p-4"
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
    </div>
  );
}
