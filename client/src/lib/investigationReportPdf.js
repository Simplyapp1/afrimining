import { jsPDF } from 'jspdf';

const MARGIN = 20;
const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FONT = 'helvetica';

function wrap(doc, text, maxW) {
  if (!text) return [];
  return doc.splitTextToSize(String(text), maxW || CONTENT_WIDTH);
}

function addWrapped(doc, lines, yRef, lineHeight = 5) {
  let y = yRef.current;
  for (const line of lines || []) {
    if (y > PAGE_HEIGHT - MARGIN - 15) {
      doc.addPage();
      y = MARGIN;
    }
    doc.text(line, MARGIN, y);
    y += lineHeight;
  }
  yRef.current = y + 2;
}

function section(doc, yRef, title, body) {
  if (yRef.current > PAGE_HEIGHT - MARGIN - 20) {
    doc.addPage();
    yRef.current = MARGIN;
  }
  doc.setFont(FONT, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(40, 40, 40);
  doc.text(title, MARGIN, yRef.current);
  yRef.current += 6;
  doc.setFont(FONT, 'normal');
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  addWrapped(doc, wrap(doc, body || '—'), yRef, 5);
  yRef.current += 2;
}

/**
 * Generate investigation report PDF.
 * @param {Object} report - Investigation report from API
 */
export function generateInvestigationReportPdf(report) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const yRef = { current: MARGIN };

  doc.setFillColor(180, 83, 9);
  doc.rect(0, 0, PAGE_WIDTH, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont(FONT, 'bold');
  doc.setFontSize(18);
  doc.text('Investigation Report', MARGIN, 18);
  doc.setFontSize(10);
  doc.setFont(FONT, 'normal');
  const sub = report.case_number || (report.approved_at ? new Date(report.approved_at).toLocaleDateString() : '');
  if (sub) doc.text(sub, PAGE_WIDTH - MARGIN - doc.getTextWidth(sub), 18);
  yRef.current = 36;

  section(doc, yRef, 'Case information', [
    `Case number: ${report.case_number || '—'}`,
    `Type: ${report.type || '—'}`,
    `Status: ${report.status || '—'}`,
    `Priority: ${report.priority || '—'}`,
    `Date occurred: ${report.date_occurred ? new Date(report.date_occurred).toLocaleDateString() : '—'}`,
    `Date reported: ${report.date_reported ? new Date(report.date_reported).toLocaleDateString() : '—'}`,
    `Location: ${report.location || '—'}`,
  ].filter(Boolean).join('\n'));

  section(doc, yRef, 'Investigator', [
    `Name: ${report.investigator_name || '—'}`,
    `Badge: ${report.badge_number || '—'}`,
    `Rank: ${report.rank || '—'}`,
    `Reported by: ${report.reported_by_name || '—'} ${report.reported_by_position ? `(${report.reported_by_position})` : ''}`,
  ].filter(Boolean).join('\n'));

  section(doc, yRef, 'Description', report.description || '—');

  const transactions = Array.isArray(report.transactions) ? report.transactions : [];
  if (transactions.length) {
    section(doc, yRef, 'Transaction details', transactions.map((t) => `${t.ref || '—'} | ${t.date || '—'} | ${t.location || '—'} | ${t.type || '—'} | ${t.truck_reg || '—'} | ${t.tonnage || '—'}`).join('\n'));
  }

  const parties = Array.isArray(report.parties) ? report.parties : [];
  if (parties.length) {
    section(doc, yRef, 'Involved parties', parties.map((p) => `${p.name || '—'} · ${p.role || '—'}\n${p.statement || ''}`).join('\n\n'));
  }

  section(doc, yRef, 'Evidence notes', report.evidence_notes || '—');
  section(doc, yRef, 'Finding summary', report.finding_summary || '—');
  section(doc, yRef, 'Recommendations', Array.isArray(report.recommendations) ? report.recommendations.filter(Boolean).join('\n• ') : '—');
  section(doc, yRef, 'Additional notes', report.additional_notes || '—');

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont(FONT, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`Generated ${new Date().toLocaleString()} · Page ${p} of ${totalPages}`, MARGIN, PAGE_HEIGHT - 10);
  }

  return doc;
}
