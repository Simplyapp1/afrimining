import { jsPDF } from 'jspdf';

const MARGIN = 18;
const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_MARGIN = 20;
const FONT = 'helvetica';
const FONT_SIZE_BODY = 9;
const FONT_SIZE_TABLE = 8;
const FONT_SIZE_TITLE = 14;
const FONT_SIZE_SUBTITLE = 11;

const BLACK = [0, 0, 0];
const TABLE_BORDER = [60, 60, 60];
const TEXT_DARK = [33, 33, 33];
const TEXT_MUTED = [80, 80, 80];

const BAR_HEIGHT = 6;
const ROW_HEIGHT = 6;
const CELL_PAD = 1.5;
const LINE_HEIGHT = 4;
const SECTION_GAP = 6;

function checkNewPage(doc, yRef, needSpace = 35) {
  const minY = PAGE_HEIGHT - FOOTER_MARGIN - (needSpace || 25);
  if (yRef.current > minY) {
    doc.addPage();
    yRef.current = MARGIN;
  }
}

function wrap(doc, text, maxW) {
  if (!text) return [];
  const w = Math.max(4, (maxW || CONTENT_WIDTH) - 1);
  return doc.splitTextToSize(String(text).trim(), w);
}

function setTableFont(doc, bold = false) {
  doc.setFont(FONT, bold ? 'bold' : 'normal');
  doc.setFontSize(FONT_SIZE_TABLE);
  doc.setTextColor(...(bold ? BLACK : TEXT_DARK));
}

function sectionBar(doc, yRef, title) {
  checkNewPage(doc, yRef, BAR_HEIGHT + 14);
  const y = yRef.current;
  doc.setFillColor(...BLACK);
  doc.rect(MARGIN, y, CONTENT_WIDTH, BAR_HEIGHT, 'F');
  doc.setFont(FONT, 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(title.toUpperCase(), MARGIN + 2, y + 4.2);
  yRef.current = y + BAR_HEIGHT + 4;
}

function cols(...widths) {
  const sum = widths.reduce((a, b) => a + b, 0);
  if (widths.length === 0) return [CONTENT_WIDTH];
  const diff = CONTENT_WIDTH - sum;
  return widths.map((w, i) => (i === widths.length - 1 ? w + diff : w));
}

function drawTable(doc, yRef, headers, rows, colWidths) {
  const tableWidth = CONTENT_WIDTH;
  const startX = MARGIN;
  let y = yRef.current;

  checkNewPage(doc, yRef, ROW_HEIGHT * 3 + 18);
  y = yRef.current;
  doc.setDrawColor(...TABLE_BORDER);
  doc.setLineWidth(0.4);
  setTableFont(doc, true);
  doc.rect(startX, y, tableWidth, ROW_HEIGHT, 'S');
  let x = startX;
  headers.forEach((h, i) => {
    if (i > 0) doc.line(x, y, x, y + ROW_HEIGHT);
    const lines = wrap(doc, h, colWidths[i] - CELL_PAD * 2);
    doc.text(lines[0] || h, x + CELL_PAD, y + 3.8);
    x += colWidths[i];
  });
  doc.line(startX + tableWidth, y, startX + tableWidth, y + ROW_HEIGHT);
  y += ROW_HEIGHT;

  setTableFont(doc, false);

  rows.forEach((row) => {
    const cellLines = row.map((cell, colIdx) => {
      const cellW = Math.max(6, colWidths[colIdx] - CELL_PAD * 2);
      return wrap(doc, cell != null ? String(cell) : '—', cellW);
    });
    const maxLines = Math.max(1, ...cellLines.map((arr) => arr.length));
    const rowH = Math.max(ROW_HEIGHT, maxLines * LINE_HEIGHT + CELL_PAD * 2);
    yRef.current = y;
    checkNewPage(doc, yRef, rowH + 5);
    y = yRef.current;
    doc.rect(startX, y, tableWidth, rowH, 'S');
    x = startX;
    row.forEach((cell, colIdx) => {
      if (colIdx > 0) doc.line(x, y, x, y + rowH);
      const lines = cellLines[colIdx] || [];
      lines.forEach((line, i) => doc.text(line, x + CELL_PAD, y + CELL_PAD + (i + 1) * LINE_HEIGHT));
      x += colWidths[colIdx];
    });
    doc.line(startX + tableWidth, y, startX + tableWidth, y + rowH);
    y += rowH;
  });

  yRef.current = y + SECTION_GAP;
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

/**
 * Generate action plan / project timelines PDF.
 * Logo at top, "Simplyapp Progress Report Document" under logo, then title, project name, date, document ID, confidentiality, action plan table.
 * @param {Object} plan - Action plan from API { title, project_name, document_date, document_id, items: [{ phase, start_date, action_description, participants, due_date, status }] }
 * @param {Object} options - Optional: { logoDataUrl }
 */
export function generateActionPlanPdf(plan, options = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const yRef = { current: MARGIN };
  const logoDataUrl = options.logoDataUrl;
  const logoFormat = logoDataUrl && /data:image\/jpe?g/i.test(logoDataUrl) ? 'JPEG' : 'PNG';

  const logoSize = 26;
  let headerY = 8;
  if (logoDataUrl) {
    try {
      const logoX = MARGIN + CONTENT_WIDTH / 2 - logoSize / 2;
      doc.addImage(logoDataUrl, logoFormat, logoX, 6, logoSize, logoSize, undefined, 'FAST');
      headerY = 6 + logoSize + 5;
    } catch (_) {}
  }

  doc.setFont(FONT, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_MUTED);
  const docTypeText = 'Simplyapp Progress Report Document';
  doc.text(docTypeText, MARGIN + CONTENT_WIDTH / 2 - doc.getTextWidth(docTypeText) / 2, headerY);
  headerY += 7;

  doc.setFont(FONT, 'bold');
  doc.setFontSize(FONT_SIZE_TITLE);
  doc.setTextColor(...BLACK);
  const titleText = (plan.title || 'Action Plan').slice(0, 80);
  const titleLines = wrap(doc, titleText, CONTENT_WIDTH);
  titleLines.forEach((line, i) => {
    doc.text(line, MARGIN + CONTENT_WIDTH / 2 - doc.getTextWidth(line) / 2, headerY + i * 5);
  });
  let y = headerY + titleLines.length * 5 + 3;

  if (plan.project_name) {
    doc.setFont(FONT, 'bold');
    doc.setFontSize(FONT_SIZE_SUBTITLE);
    doc.setTextColor(...TEXT_DARK);
    const projLines = wrap(doc, plan.project_name.slice(0, 100), CONTENT_WIDTH);
    projLines.forEach((line, i) => {
      doc.text(line, MARGIN + CONTENT_WIDTH / 2 - doc.getTextWidth(line) / 2, y + i * 5);
    });
    y += projLines.length * 5 + 2;
  }

  doc.setFont(FONT, 'normal');
  doc.setFontSize(FONT_SIZE_BODY);
  doc.setTextColor(...TEXT_MUTED);
  const dateStr = formatDate(plan.document_date);
  doc.text(dateStr, MARGIN + CONTENT_WIDTH / 2 - doc.getTextWidth(dateStr) / 2, y);
  y += 4;
  if (plan.document_id) {
    doc.text(`Document ID: ${plan.document_id}`, MARGIN + CONTENT_WIDTH / 2 - doc.getTextWidth(`Document ID: ${plan.document_id}`) / 2, y);
    y += 5;
  }
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, MARGIN + CONTENT_WIDTH, y);
  yRef.current = y + 8;

  doc.setFont(FONT, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_MUTED);
  const confidential = 'This document is the exclusive property of Simplyapp (Pty) Ltd. and contains confidential information. It may not be reproduced, shared, or disclosed without express written consent.';
  const confLines = wrap(doc, confidential, CONTENT_WIDTH);
  confLines.forEach((line) => {
    doc.text(line, MARGIN, yRef.current);
    yRef.current += 4;
  });
  yRef.current += 6;

  const items = Array.isArray(plan.items) ? plan.items : [];
  if (items.length > 0) {
    sectionBar(doc, yRef, 'Action plan structure');
    const headers = ['Phase', 'Start date', 'Action type/description', 'Participants', 'Due date', 'Action status'];
    const rows = items.map((it) => [
      (it.phase ?? '—').toString(),
      it.start_date ? formatDate(it.start_date) : '—',
      (it.action_description ?? '—').toString().trim().slice(0, 120),
      (it.participants ?? '—').toString().trim().slice(0, 40),
      it.due_date ? formatDate(it.due_date) : '—',
      (it.status ?? 'not started').toString(),
    ]);
    const cw = cols(12, 22, 55, 35, 22, 28);
    drawTable(doc, yRef, headers, rows, cw);
  }

  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFont(FONT, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(
      `Action Plan · ${formatDate(plan.document_date)} · Page ${p} of ${pageCount}`,
      MARGIN,
      PAGE_HEIGHT - 8
    );
    const footerRight = 'Simplyapp';
    doc.text(footerRight, MARGIN + CONTENT_WIDTH - doc.getTextWidth(footerRight), PAGE_HEIGHT - 8);
  }

  return doc;
}
