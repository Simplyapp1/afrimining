/**
 * AI extraction for uploaded list-style PDF documents.
 * Produces a template schema + extracted rows for Excel generation.
 */

function compactText(input, maxChars = 250000) {
  const text = String(input || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

function buildTemplatePrompt(fileName, text) {
  return `You are an expert data-capture analyst.

Infer a professional Excel capture template for this document text.

Return strict JSON with:
- workbook_title: string
- template_columns: [{ key, header, width, description, example }]
- notes: string[]

Rules:
- 5-20 practical columns.
- key must be snake_case.
- Prioritise student mark-list fields when present (student_number, student_name, assessment_2, assessment_3, mark_percent, exam_mark, final_mark, subject).
- Do not include extracted rows in this response.

File name: ${fileName}

Source text:
${text}`;
}

function defaultStudentTemplateColumns() {
  return [
    { key: 'student_number', header: 'Student Number', width: 18, description: 'Official student number', example: '204093121' },
    { key: 'student_name', header: 'Student Name', width: 28, description: 'Surname and initials/name', example: 'KGOHLOANE, BMM' },
    { key: 'assessment_2', header: 'Assessment 2', width: 14, description: 'Assessment 2 mark where available', example: '7' },
    { key: 'assessment_3', header: 'Assessment 3', width: 14, description: 'Assessment 3 mark where available', example: '' },
    { key: 'mark_percent', header: 'Mark Perc', width: 12, description: 'Percentage mark where present', example: '' },
    { key: 'exam_mark', header: 'Exam Mark', width: 12, description: 'Exam mark where present', example: '' },
    { key: 'final_mark', header: 'Final Mark', width: 12, description: 'Final mark where present', example: '' },
    { key: 'subject', header: 'Subject', width: 14, description: 'Subject code/name', example: 'ADSU19' },
  ];
}

function pickLikelySubject(line) {
  const m = String(line || '').match(/\b([A-Z]{2,}\d{1,})\b/g);
  if (!m?.length) return '';
  return m[m.length - 1] || '';
}

function toCell(raw) {
  const s = String(raw ?? '').replace(/[-\s]+/g, '').trim();
  if (!s) return '';
  const n = Number(s);
  if (Number.isFinite(n)) return String(n);
  return '';
}

function extractStudentMarkRowsFromText(text) {
  const rows = [];
  const lines = String(text || '').split('\n');
  for (const line of lines) {
    const m = line.match(/^\s*(\d{7,12})\s+([^|]+?)\s*\|(.+)$/);
    if (!m) continue;
    const studentNumber = String(m[1] || '').trim();
    const studentName = String(m[2] || '').replace(/\s{2,}/g, ' ').trim();
    const rest = String(m[3] || '');
    const segments = rest.split('|').map((x) => String(x || '').trim());
    const numeric = segments.filter((x) => /^\d{1,3}$/.test(x));
    rows.push({
      student_number: studentNumber,
      student_name: studentName,
      assessment_2: toCell(numeric[0] || ''),
      assessment_3: toCell(numeric[1] || ''),
      mark_percent: toCell(numeric[2] || ''),
      exam_mark: toCell(numeric[3] || ''),
      final_mark: toCell(numeric[4] || ''),
      subject: pickLikelySubject(line),
    });
  }
  return rows;
}

function buildChunkExtractPrompt(fileName, pageFrom, pageTo, text, template_columns) {
  return `You are extracting rows for a structured list-data capture from a document chunk.

Return strict JSON with:
- extracted_rows: [object keyed by the template column keys]

Rules:
- Use ONLY these keys: ${template_columns.map((c) => c.key).join(', ')}.
- Extract as many reliable rows as possible from this chunk.
- If a value is uncertain, use empty string.
- Do not hallucinate rows not present in this chunk.
- Keep literal values from source.

File: ${fileName}
Chunk pages: ${pageFrom}-${pageTo}

Chunk text:
${text}`;
}

function buildPageChunks(pdfPages, maxChars = 22000) {
  const pages = (pdfPages || [])
    .map((p) => ({ num: Number(p?.num || 0), text: compactText(p?.text || '', 80000) }))
    .filter((p) => p.text);
  if (!pages.length) return [];
  const chunks = [];
  let cur = { from: pages[0].num || 1, to: pages[0].num || 1, text: '' };
  for (const p of pages) {
    if ((cur.text + '\n\n' + p.text).length > maxChars && cur.text) {
      chunks.push(cur);
      cur = { from: p.num || cur.to + 1, to: p.num || cur.to + 1, text: p.text };
      continue;
    }
    cur.text = cur.text ? `${cur.text}\n\n${p.text}` : p.text;
    cur.to = p.num || cur.to;
  }
  if (cur.text) chunks.push(cur);
  return chunks;
}

async function callOpenAiJson({ key, model, prompt, maxTokens = 2200 }) {
  const parseJsonFromContent = (content) => {
    const raw = String(content || '').trim();
    if (!raw) throw new Error('Empty AI response');
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch (_) {
      const first = cleaned.indexOf('{');
      const last = cleaned.lastIndexOf('}');
      if (first >= 0 && last > first) {
        try {
          const slice = cleaned.slice(first, last + 1);
          return JSON.parse(slice);
        } catch {
          throw new Error('AI response was not valid JSON.');
        }
      }
      throw new Error('AI response was not valid JSON.');
    }
  };

  const run = async (messages) => {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || res.statusText || 'OpenAI extraction failed';
      throw new Error(msg);
    }
    return data?.choices?.[0]?.message?.content || '{}';
  };

  let content = await run([{ role: 'user', content: prompt }]);
  try {
    return parseJsonFromContent(content);
  } catch {
    // One retry with strict formatting instruction.
    content = await run([
      {
        role: 'system',
        content:
          'Return valid strict JSON only. No markdown fences, no commentary, no leading or trailing text.',
      },
      { role: 'user', content: prompt },
    ]);
    return parseJsonFromContent(content);
  }
}

export async function extractListDataCaptureFromPdfText({ fileName, pdfText, pdfPages = [] }) {
  const key = (process.env.OPENAI_API_KEY || '').trim();
  if (!key) {
    throw new Error('OPENAI_API_KEY is not set. Add it to .env and restart the server.');
  }
  const model = (process.env.OPENAI_RESEARCH_MODEL || 'gpt-4o-mini').trim();
  const compact = compactText(pdfText, 250000);
  if (!compact) throw new Error('The uploaded PDF appears empty or unreadable.');
  let templateJson = null;
  try {
    templateJson = await callOpenAiJson({
      key,
      model,
      prompt: buildTemplatePrompt(fileName, compact),
      maxTokens: 1200,
    });
  } catch {
    templateJson = { workbook_title: 'Student Marks Capture', template_columns: defaultStudentTemplateColumns(), notes: [] };
  }

  const colsIn = Array.isArray(templateJson?.template_columns) ? templateJson.template_columns : [];
  const template_columns = colsIn
    .map((c, idx) => {
      const keyRaw = String(c?.key || c?.header || `column_${idx + 1}`).toLowerCase();
      const keyNorm = keyRaw.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `column_${idx + 1}`;
      return {
        key: keyNorm,
        header: String(c?.header || keyNorm.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())).slice(0, 80),
        width: Math.max(12, Math.min(48, Number(c?.width) || 20)),
        description: String(c?.description || '').slice(0, 300),
        example: String(c?.example || '').slice(0, 120),
      };
    })
    .slice(0, 30);

  if (!template_columns.length) template_columns.push(...defaultStudentTemplateColumns());
  const chunks = buildPageChunks(pdfPages, 22000);
  const chunkSource = chunks.length ? chunks : [{ from: 1, to: 1, text: compact }];
  // Extract chunk rows in small parallel batches to reduce end-to-end latency.
  const extracted_rows = [];
  const batchSize = 3;
  for (let i = 0; i < chunkSource.length; i += batchSize) {
    const batch = chunkSource.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (chunk) => {
        try {
          return await callOpenAiJson({
            key,
            model,
            prompt: buildChunkExtractPrompt(fileName, chunk.from, chunk.to, chunk.text, template_columns),
            maxTokens: 1500,
          });
        } catch {
          return { extracted_rows: extractStudentMarkRowsFromText(chunk.text) };
        }
      })
    );
    for (const chunkJson of batchResults) {
      const rowsIn = Array.isArray(chunkJson?.extracted_rows) ? chunkJson.extracted_rows : [];
      for (const row of rowsIn) {
        const out = {};
        for (const c of template_columns) {
          out[c.key] = row && typeof row === 'object' ? String(row[c.key] ?? '') : '';
        }
        extracted_rows.push(out);
        if (extracted_rows.length >= 5000) break;
      }
      if (extracted_rows.length >= 5000) break;
    }
    if (extracted_rows.length >= 5000) break;
  }
  if (!extracted_rows.length) {
    extracted_rows.push(...extractStudentMarkRowsFromText(compact));
  }
  const notes = Array.isArray(templateJson?.notes) ? templateJson.notes.map((n) => String(n).slice(0, 300)) : [];
  notes.push(`Processed all pages: ${pdfPages.length || chunkSource[chunkSource.length - 1]?.to || 1}`);

  return {
    workbook_title: String(templateJson?.workbook_title || 'List data capture').slice(0, 120),
    template_columns,
    extracted_rows,
    notes,
    model,
  };
}
