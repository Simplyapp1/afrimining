import { Router } from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';
import ExcelJS from 'exceljs';
import { query } from '../db.js';
import { requireAuth, loadUser, requirePageAccess } from '../middleware/auth.js';
import {
  VAR_ORDER,
  VARIABLE_DEFS,
  validateAllValues,
  normalizeVarValue,
  buildCodebookRows,
} from '../lib/researchQuestionnaireSchema.js';
import { extractQuestionnaireFromImages, needsClarificationFromStoredPayload } from '../lib/researchVisionExtract.js';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..', '..');
const uploadRoot = path.join(projectRoot, 'uploads', 'research');

function get(row, key) {
  if (!row) return undefined;
  const lower = key.toLowerCase();
  const entry = Object.entries(row).find(([k]) => k && String(k).toLowerCase() === lower);
  return entry ? entry[1] : undefined;
}

async function ensureUploadDir(sub) {
  const dir = path.join(uploadRoot, sub);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function relUploadPath(absPath) {
  const rel = path.relative(projectRoot, absPath);
  return rel.split(path.sep).join('/');
}

/** Last scan payload: current envelope, or legacy flat / `{ values, needs_clarification }` / extraction raw JSON. */
function parseScanEnvelope(rawStr) {
  if (rawStr == null || rawStr === '') return { needs: [] };
  try {
    const o = typeof rawStr === 'string' ? JSON.parse(rawStr) : rawStr;
    if (!o || typeof o !== 'object') return { needs: [] };
    return { needs: needsClarificationFromStoredPayload(o) };
  } catch {
    return { needs: [] };
  }
}

/** Only show items the user still has to fix (not yet saved in DB). */
function activeClarifications(needs, valuesMap) {
  const list = Array.isArray(needs) ? needs : [];
  return list.filter((n) => {
    if (!n || !n.code) return false;
    const code = String(n.code).toUpperCase();
    return valuesMap[code] == null;
  });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 12 },
});

router.use(requireAuth, loadUser, requirePageAccess('research'));

/** Variable definitions for UI (no secrets). */
router.get('/schema', (req, res) => {
  res.json({
    variables: VAR_ORDER.map((code) => ({
      code,
      ...VARIABLE_DEFS[code],
    })),
    scanHint:
      'Use the in-app camera or add images from your device; queue pages in order (consent, Section A, B, C, D). In-app capture stays in the browser until you run the reader — it is not saved to your gallery. The reader never guesses: unclear marks stay empty and you are asked to enter the answer from the paper. Set OPENAI_API_KEY for AI assist; you must review every field before marking complete.',
  });
});

router.get('/participants', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant required.' });
    const r = await query(
      `SELECT p.id, p.participant_code, p.status, p.notes, p.created_at, p.updated_at, p.completed_at, p.last_scan_at,
              (SELECT COUNT(*) FROM research_participant_values v WHERE v.participant_id = p.id AND v.value_int IS NOT NULL) AS filled_count
       FROM research_participants p
       WHERE p.tenant_id = @tenantId
       ORDER BY p.created_at DESC`,
      { tenantId }
    );
    const rows = (r.recordset || []).map((row) => ({
      id: get(row, 'id'),
      participant_code: get(row, 'participant_code'),
      status: get(row, 'status'),
      notes: get(row, 'notes'),
      created_at: get(row, 'created_at'),
      updated_at: get(row, 'updated_at'),
      completed_at: get(row, 'completed_at'),
      last_scan_at: get(row, 'last_scan_at'),
      filled_count: get(row, 'filled_count'),
      total_vars: VAR_ORDER.length,
      is_complete: get(row, 'status') === 'complete',
    }));
    res.json({ participants: rows });
  } catch (e) {
    next(e);
  }
});

router.post('/participants', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant required.' });
    const notes = (req.body?.notes && String(req.body.notes).trim().slice(0, 2000)) || null;
    let code = `R-${randomBytes(4).toString('hex').toUpperCase()}`;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const ins = await query(
          `INSERT INTO research_participants (tenant_id, created_by, participant_code, notes)
           OUTPUT INSERTED.id, INSERTED.participant_code, INSERTED.status, INSERTED.created_at
           VALUES (@tenantId, @userId, @code, @notes)`,
          { tenantId, userId: req.user.id, code, notes }
        );
        const row = ins.recordset?.[0];
        return res.status(201).json({
          id: get(row, 'id'),
          participant_code: get(row, 'participant_code'),
          status: get(row, 'status'),
          created_at: get(row, 'created_at'),
        });
      } catch (err) {
        if (String(err?.message || '').includes('UQ_research_participant_code')) {
          code = `R-${randomBytes(4).toString('hex').toUpperCase()}`;
          continue;
        }
        throw err;
      }
    }
    return res.status(500).json({ error: 'Could not allocate participant code.' });
  } catch (e) {
    next(e);
  }
});

async function loadParticipant(tenantId, id) {
  const r = await query(
    `SELECT * FROM research_participants WHERE id = @id AND tenant_id = @tenantId`,
    { id, tenantId }
  );
  return r.recordset?.[0] || null;
}

async function loadValuesMap(participantId) {
  const r = await query(
    `SELECT var_name, value_int FROM research_participant_values WHERE participant_id = @pid`,
    { pid: participantId }
  );
  const map = {};
  for (const row of r.recordset || []) {
    const vn = get(row, 'var_name');
    const vi = get(row, 'value_int');
    if (vn != null && vi != null) map[String(vn).toUpperCase()] = vi;
  }
  return map;
}

router.get('/participants/:id', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const row = await loadParticipant(tenantId, req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found.' });
    const values = await loadValuesMap(get(row, 'id'));
    const img = await query(
      `SELECT id, file_path, sort_order, created_at FROM research_participant_images WHERE participant_id = @pid ORDER BY sort_order, created_at`,
      { pid: get(row, 'id') }
    );
    const validation = validateAllValues(values);
    const env = parseScanEnvelope(get(row, 'last_scan_response'));
    const needs_clarification = activeClarifications(env.needs, values);
    res.json({
      id: get(row, 'id'),
      participant_code: get(row, 'participant_code'),
      status: get(row, 'status'),
      notes: get(row, 'notes'),
      created_at: get(row, 'created_at'),
      updated_at: get(row, 'updated_at'),
      completed_at: get(row, 'completed_at'),
      last_scan_at: get(row, 'last_scan_at'),
      last_scan_model: get(row, 'last_scan_model'),
      values,
      needs_clarification,
      missing_codes: validation.missing,
      filled_count: VAR_ORDER.length - validation.missing.length,
      total_vars: VAR_ORDER.length,
      images: (img.recordset || []).map((i) => ({
        id: get(i, 'id'),
        file_path: get(i, 'file_path'),
        sort_order: get(i, 'sort_order'),
        created_at: get(i, 'created_at'),
      })),
    });
  } catch (e) {
    next(e);
  }
});

async function upsertValues(participantId, valuesObj) {
  for (const code of VAR_ORDER) {
    if (!Object.prototype.hasOwnProperty.call(valuesObj, code)) continue;
    const n = normalizeVarValue(code, valuesObj[code]);
    if (n == null) continue;
    const upd = await query(
      `UPDATE research_participant_values SET value_int = @val, updated_at = SYSUTCDATETIME()
       WHERE participant_id = @pid AND var_name = @vn`,
      { pid: participantId, vn: code, val: n }
    );
    const ra = upd.rowsAffected;
    const affected = Array.isArray(ra) ? ra[0] : ra;
    if (!affected) {
      await query(
        `INSERT INTO research_participant_values (participant_id, var_name, value_int) VALUES (@pid, @vn, @val)`,
        { pid: participantId, vn: code, val: n }
      );
    }
  }
}

router.patch('/participants/:id', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const row = await loadParticipant(tenantId, req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found.' });
    const pid = get(row, 'id');
    const body = req.body || {};
    if (body.notes !== undefined) {
      const notes = body.notes == null ? null : String(body.notes).trim().slice(0, 2000);
      await query(`UPDATE research_participants SET notes = @notes, updated_at = SYSUTCDATETIME() WHERE id = @id`, {
        id: pid,
        notes,
      });
    }
    if (body.values && typeof body.values === 'object') {
      await upsertValues(pid, body.values);
      await query(`UPDATE research_participants SET updated_at = SYSUTCDATETIME() WHERE id = @id`, { id: pid });
    }
    if (body.status === 'complete') {
      if (body.values && typeof body.values === 'object') {
        await upsertValues(pid, body.values);
      }
      const merged = await loadValuesMap(pid);
      const validation = validateAllValues(merged);
      if (!validation.isComplete) {
        return res.status(400).json({
          error: 'Cannot mark complete until all V1–V47 have valid values.',
          missing_codes: validation.missing,
        });
      }
      await query(
        `UPDATE research_participants SET status = N'complete', completed_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME() WHERE id = @id`,
        { id: pid }
      );
    } else if (body.status === 'draft') {
      await query(
        `UPDATE research_participants SET status = N'draft', completed_at = NULL, updated_at = SYSUTCDATETIME() WHERE id = @id`,
        { id: pid }
      );
    }
    const values = await loadValuesMap(pid);
    const validation = validateAllValues(values);
    const prow = await loadParticipant(tenantId, pid);
    const env = parseScanEnvelope(get(prow, 'last_scan_response'));
    const needs_clarification = activeClarifications(env.needs, values);
    res.json({
      ok: true,
      values,
      needs_clarification,
      missing_codes: validation.missing,
      filled_count: VAR_ORDER.length - validation.missing.length,
      status: get(prow, 'status'),
    });
  } catch (e) {
    next(e);
  }
});

router.post('/participants/:id/scan', upload.array('images', 12), async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const row = await loadParticipant(tenantId, req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found.' });
    if (get(row, 'status') === 'complete') {
      return res.status(400).json({ error: 'This participant is already marked complete. Start a new participant to scan another questionnaire.' });
    }
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: 'Attach one or more images (field name: images).' });

    const pid = get(row, 'id');
    const dir = await ensureUploadDir(pid);
    const existing = await query(
      `SELECT ISNULL(MAX(sort_order), -1) AS mx FROM research_participant_images WHERE participant_id = @pid`,
      { pid }
    );
    let sortBase = (existing.recordset?.[0]?.mx ?? existing.recordset?.[0]?.MX ?? -1) + 1;

    const imagePayload = [];
    for (let i = 0; i < files.length; i += 1) {
      const f = files[i];
      const ext = (f.mimetype && f.mimetype.includes('png')) ? 'png' : 'jpg';
      const fname = `scan_${sortBase + i}.${ext}`;
      const abs = path.join(dir, fname);
      await fs.writeFile(abs, f.buffer);
      const rel = relUploadPath(abs);
      await query(
        `INSERT INTO research_participant_images (participant_id, sort_order, file_path, mime_type)
         VALUES (@pid, @so, @fp, @mt)`,
        { pid, so: sortBase + i, fp: rel, mt: f.mimetype || null }
      );
      imagePayload.push({
        mime: f.mimetype || 'image/jpeg',
        base64: f.buffer.toString('base64'),
      });
    }

    const model = (process.env.OPENAI_RESEARCH_MODEL || 'gpt-4o-mini').trim();
    const extracted = await extractQuestionnaireFromImages(imagePayload);

    if (extracted.parseError && Object.keys(extracted.values).length === 0) {
      return res.status(extracted.parseError.includes('OPENAI_API_KEY') ? 503 : 422).json({
        error: extracted.parseError,
        hint: extracted.parseError.includes('OPENAI_API_KEY')
          ? 'Put OPENAI_API_KEY in .env at the project root, restart the server, and try again. Or skip AI: fill V1–V47 manually and Save draft.'
          : undefined,
      });
    }

    await upsertValues(pid, extracted.values);
    const envelope = {
      needs_clarification: extracted.needsClarification || [],
      applied_values: extracted.values,
      scanned_at: new Date().toISOString(),
    };
    const responseJson = JSON.stringify(envelope).slice(0, 380000);
    await query(
      `UPDATE research_participants
       SET last_scan_at = SYSUTCDATETIME(), last_scan_model = @model, last_scan_response = @resp, updated_at = SYSUTCDATETIME()
       WHERE id = @id`,
      { id: pid, model, resp: responseJson }
    );

    const values = await loadValuesMap(pid);
    const validation = validateAllValues(values);
    const needs_clarification = activeClarifications(extracted.needsClarification || [], values);
    res.json({
      ok: true,
      model,
      parseWarning: extracted.parseError,
      values,
      needs_clarification,
      missing_codes: validation.missing,
      filled_count: VAR_ORDER.length - validation.missing.length,
      total_vars: VAR_ORDER.length,
      all_fields_captured: validation.isComplete,
      ready_for_new_participant: validation.isComplete,
      reader_never_guesses:
        'Any field the reader could not see clearly was left empty and listed below. Enter the correct code from the paper before marking complete.',
    });
  } catch (e) {
    next(e);
  }
});

router.delete('/participants/:id', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const row = await loadParticipant(tenantId, req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found.' });
    const pid = get(row, 'id');
    const dir = path.join(uploadRoot, pid);
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch (_) {}
    await query(`DELETE FROM research_participants WHERE id = @id`, { id: pid });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.get('/export.xlsx', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant required.' });
    const includeDraft = req.query.include_draft === '1' || req.query.include_draft === 'true';
    const statusFilter = includeDraft ? '' : `AND p.status = N'complete'`;

    const pr = await query(
      `SELECT p.id, p.participant_code, p.status, p.created_at, p.completed_at, p.notes
       FROM research_participants p
       WHERE p.tenant_id = @tenantId ${statusFilter}
       ORDER BY p.created_at`,
      { tenantId }
    );

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Simplyapp — Research capture';
    workbook.created = new Date();
    const dataSheet = workbook.addWorksheet('Data', { views: [{ showGridLines: true }] });
    const codeSheet = workbook.addWorksheet('Codebook', { views: [{ showGridLines: true }] });
    const metaSheet = workbook.addWorksheet('Read_me', { views: [{ showGridLines: true }] });

    const headers = [
      'participant_id',
      'participant_code',
      'record_status',
      'created_utc',
      'completed_utc',
      'notes',
      ...VAR_ORDER,
    ];
    const hRow = dataSheet.addRow(headers);
    hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    hRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    for (let c = 1; c <= headers.length; c += 1) {
      dataSheet.getColumn(c).width = c <= 6 ? 22 : 10;
    }

    for (const row of pr.recordset || []) {
      const pid = get(row, 'id');
      const vals = await loadValuesMap(pid);
      dataSheet.addRow([
        pid,
        get(row, 'participant_code'),
        get(row, 'status'),
        get(row, 'created_at'),
        get(row, 'completed_at'),
        get(row, 'notes') || '',
        ...VAR_ORDER.map((code) => vals[code] ?? ''),
      ]);
    }

    const cbHeaders = ['Variable', 'Section', 'Question', 'Label', 'Min', 'Max', 'Value_labels'];
    const cbRow = codeSheet.addRow(cbHeaders);
    cbRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    cbRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    for (const r of buildCodebookRows()) {
      codeSheet.addRow([r.variable, r.section, r.question_no, r.label, r.min, r.max, r.value_labels]);
    }
    codeSheet.getColumn(1).width = 10;
    codeSheet.getColumn(2).width = 10;
    codeSheet.getColumn(3).width = 10;
    codeSheet.getColumn(4).width = 70;
    codeSheet.getColumn(5).width = 6;
    codeSheet.getColumn(6).width = 6;
    codeSheet.getColumn(7).width = 80;

    metaSheet.getColumn(1).width = 100;
    metaSheet.addRow([
      'Coal road freight questionnaire (Chapter 4). Numeric codes match the printed instrument (V1–V47). Likert: 1=strongly disagree … 5=strongly agree.',
    ]);
    metaSheet.addRow([]);
    metaSheet.addRow([
      `Export generated ${new Date().toISOString()} for tenant ${tenantId}. Rows include ${includeDraft ? 'draft and complete' : 'complete only'} participants.`,
    ]);
    metaSheet.addRow([]);
    metaSheet.addRow([
      'AI extraction uses OpenAI vision when OPENAI_API_KEY is configured. Always verify scanned values before marking a participant complete.',
    ]);

    const buf = await workbook.xlsx.writeBuffer();
    const filename = `research_export_${tenantId.slice(0, 8)}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(buf));
  } catch (e) {
    next(e);
  }
});

export default router;
