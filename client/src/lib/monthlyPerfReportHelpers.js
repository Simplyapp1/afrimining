/**
 * Monthly performance report section format:
 * - New: { heading, subsections: [ { subheading, blocks: [ { type: 'text', text } | { type: 'image', base64, alt? } | { type: 'table', rows: string[][] } ] } ] }
 * - Legacy: { heading, body } (converted to one subsection with one text block)
 */

export function normalizeSectionForForm(sec) {
  if (!sec) return { heading: '', subsections: [{ subheading: '', blocks: [{ type: 'text', text: '' }] }] };
  if (Array.isArray(sec.subsections) && sec.subsections.length > 0) {
    return {
      heading: sec.heading ?? '',
      subsections: sec.subsections.map((sub) => ({
        subheading: sub.subheading ?? '',
        blocks: Array.isArray(sub.blocks) && sub.blocks.length
          ? sub.blocks.map((b) => {
              if (b.type === 'image') return { type: 'image', base64: b.base64 ?? '', alt: b.alt ?? '' };
              if (b.type === 'table') return { type: 'table', rows: Array.isArray(b.rows) ? b.rows.map((r) => [...(r || [])]) : [['']] };
              return { type: 'text', text: (b.text ?? '').toString() };
            })
          : [{ type: 'text', text: '' }],
      })),
    };
  }
  const body = (sec.body ?? '').toString();
  return {
    heading: sec.heading ?? '',
    subsections: [{ subheading: '', blocks: [{ type: 'text', text: body }] }],
  };
}

export function normalizeSectionsForForm(sections) {
  if (!Array.isArray(sections) || sections.length === 0) return [{ heading: '', subsections: [{ subheading: '', blocks: [{ type: 'text', text: '' }] }] }];
  return sections.map(normalizeSectionForForm);
}

/** Serialize form sections for API (always new format). */
export function serializeSectionsForApi(formSections) {
  return formSections.map((s) => ({
    heading: (s.heading || '').toString().trim(),
    subsections: (s.subsections || []).map((sub) => ({
      subheading: (sub.subheading || '').toString().trim(),
      blocks: (sub.blocks || []).map((b) => {
        if (b.type === 'image') return { type: 'image', base64: b.base64 || '', alt: (b.alt || '').toString().trim() };
        if (b.type === 'table') return { type: 'table', rows: Array.isArray(b.rows) ? b.rows.map((r) => (Array.isArray(r) ? r : []).map((c) => String(c ?? ''))) : [] };
        return { type: 'text', text: (b.text || '').toString().trim() };
      }),
    })),
  }));
}

/** Parse clipboard or file text as TSV/CSV (Excel paste or CSV file). Returns array of rows (string[]). */
export function parseTsvFromClipboard(text) {
  if (!text || typeof text !== 'string') return [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) return [];
  const firstLine = lines[0];
  const useTab = firstLine.includes('\t');
  const delim = useTab ? '\t' : ',';
  return lines.map((line) => line.split(delim).map((c) => (c ?? '').replace(/^"|"$/g, '').trim()));
}

/** Map TSV rows to key_metrics (metric, value, commentary). */
export function tsvToKeyMetrics(rows) {
  return rows.map((row) => ({ metric: row[0] ?? '', value: row[1] ?? '', commentary: row[2] ?? '' }));
}

/** Map TSV rows to breakdowns (date, time, route, truck_reg, description, company). */
export function tsvToBreakdowns(rows) {
  return rows.map((row) => ({
    date: row[0] ?? '',
    time: row[1] ?? '',
    route: row[2] ?? '',
    truck_reg: row[3] ?? '',
    description: row[4] ?? '',
    company: row[5] ?? '',
  }));
}

/** Map TSV rows to fleet_performance (haulier, trips, pct_trips, tonnage, pct_tonnage, avg_t_per_trip, trucks_deployed). */
export function tsvToFleetPerformance(rows) {
  return rows.map((row) => ({
    haulier: row[0] ?? '',
    trips: row[1] ?? '',
    pct_trips: row[2] ?? '',
    tonnage: row[3] ?? '',
    pct_tonnage: row[4] ?? '',
    avg_t_per_trip: row[5] ?? '',
    trucks_deployed: row[6] ?? '',
  }));
}
