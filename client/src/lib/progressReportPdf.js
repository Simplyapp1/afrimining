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

const BLACK = [0, 0, 0];
const TABLE_BORDER = [60, 60, 60];
const TEXT_DARK = [33, 33, 33];
const TEXT_MUTED = [80, 80, 80];
const BRAND = [180, 50, 50];

const BAR_HEIGHT = 6;
const ROW_HEIGHT = 5.5;
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

/** Draw a single line justified (space distributed between words). Last line of paragraph typically left-aligned. */
function drawJustifiedLine(doc, line, x, y, maxW) {
  const words = line.trim().split(/\s+/);
  if (words.length === 0) return;
  if (words.length === 1) {
    doc.text(line, x, y);
    return;
  }
  const totalWordWidth = words.reduce((sum, w) => sum + doc.getTextWidth(w), 0);
  const spaceWidth = doc.getTextWidth(' ');
  const totalSpaces = words.length - 1;
  const extraPerSpace = (maxW - totalWordWidth - totalSpaces * spaceWidth) / totalSpaces;
  let xPos = x;
  words.forEach((word, i) => {
    doc.text(word, xPos, y);
    xPos += doc.getTextWidth(word);
    if (i < words.length - 1) xPos += spaceWidth + extraPerSpace;
  });
}

const BULLET_INDENT = 5;

/** Draw body text: paragraphs justified. Lines starting with -, •, *, or "1." "2." get bullet/number + indent. */
function drawJustifiedBody(doc, yRef, text, maxW) {
  const lineGap = LINE_HEIGHT + 0.5;
  const paragraphGap = 4;
  const x = MARGIN;
  const width = maxW || CONTENT_WIDTH;
  const bulletWidth = BULLET_INDENT;

  const blocks = String(text || '')
    .split(/\n\n+/)
    .map((b) => b.trim())
    .filter(Boolean);

  blocks.forEach((block, blockIdx) => {
    const rawLines = block.split(/\n/).map((l) => l.trim()).filter(Boolean);
    rawLines.forEach((rawLine, lineIdx) => {
      const bulletMatch = rawLine.match(/^([-*•]|\d+\.)\s+(.*)$/);
      const isBullet = bulletMatch && /^[-*•]$/.test(bulletMatch[1]);
      const isNumber = bulletMatch && /^\d+\.$/.test(bulletMatch[1]);

      if (isBullet || isNumber) {
        const bullet = isNumber ? bulletMatch[1] : '•';
        const rest = (bulletMatch[2] || '').trim();
        doc.text(bullet, x, yRef.current);
        const restLines = rest ? doc.splitTextToSize(rest, width - bulletWidth) : [];
        if (restLines.length === 0) {
          yRef.current += lineGap;
        }
        restLines.forEach((line, i) => {
          checkNewPage(doc, yRef, lineGap + 2);
          const y = yRef.current;
          const isLast = i === restLines.length - 1;
          if (isLast) {
            doc.text(line, x + bulletWidth, y);
          } else {
            drawJustifiedLine(doc, line, x + bulletWidth, y, width - bulletWidth);
          }
          yRef.current += lineGap;
        });
        if (restLines.length > 0) yRef.current += paragraphGap * 0.5;
      } else {
        const lines = doc.splitTextToSize(rawLine, width);
        lines.forEach((line, i) => {
          checkNewPage(doc, yRef, lineGap + 2);
          const y = yRef.current;
          const isLast = i === lines.length - 1;
          if (isLast) {
            doc.text(line, x, y);
          } else {
            drawJustifiedLine(doc, line, x, y, width);
          }
          yRef.current += lineGap;
        });
        yRef.current += paragraphGap * 0.5;
      }
    });
    yRef.current += paragraphGap;
  });
  if (blocks.length > 0) yRef.current -= paragraphGap * 0.5;
}

/** Draw plain paragraphs: all text justified (last line of each para left-aligned for appearance). */
function drawJustifiedParagraphs(doc, yRef, text, maxW, opts = {}) {
  const indent = opts.indent || 0;
  const lineGap = LINE_HEIGHT + 0.5;
  const paragraphGap = opts.paragraphGap != null ? opts.paragraphGap : 4;
  const x = MARGIN + indent;
  const width = (maxW || CONTENT_WIDTH) - indent;

  const paragraphs = String(text || '')
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  paragraphs.forEach((para, paraIdx) => {
    const lines = doc.splitTextToSize(para.replace(/\n/g, ' '), width);
    lines.forEach((line, lineIdx) => {
      checkNewPage(doc, yRef, lineGap + 2);
      const y = yRef.current;
      const isLast = lineIdx === lines.length - 1;
      if (isLast) {
        doc.text(line, x, y);
      } else {
        drawJustifiedLine(doc, line, x, y, width);
      }
      yRef.current += lineGap;
    });
    yRef.current += paragraphGap;
  });
  if (paragraphs.length > 0) yRef.current -= paragraphGap;
}

function cols(...widths) {
  const sum = widths.reduce((a, b) => a + b, 0);
  if (widths.length === 0) return [CONTENT_WIDTH];
  const diff = CONTENT_WIDTH - sum;
  return widths.map((w, i) => (i === widths.length - 1 ? w + diff : w));
}

function setBodyFont(doc) {
  doc.setFont(FONT, 'normal');
  doc.setFontSize(FONT_SIZE_BODY);
  doc.setTextColor(...TEXT_MUTED);
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
 * Generate project progress report PDF.
 * @param {Object} report - Progress report from API
 * @param {Object} options - Optional: { logoDataUrl }
 */
export function generateProgressReportPdf(report, options = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const yRef = { current: MARGIN };
  const logoDataUrl = options.logoDataUrl;
  const logoFormat = logoDataUrl && /data:image\/jpe?g/i.test(logoDataUrl) ? 'JPEG' : 'PNG';

  const logoSize = 24;
  let headerY = 8;
  if (logoDataUrl) {
    try {
      const logoX = MARGIN + CONTENT_WIDTH / 2 - logoSize / 2;
      doc.addImage(logoDataUrl, logoFormat, logoX, 6, logoSize, logoSize, undefined, 'FAST');
      headerY = 6 + logoSize + 4;
    } catch (_) {}
  }

  const docTypeText = 'Thinkers Afrika Progress Report Document';
  doc.setFont(FONT, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(docTypeText, MARGIN + CONTENT_WIDTH / 2 - doc.getTextWidth(docTypeText) / 2, headerY);
  headerY += 6;

  doc.setFont(FONT, 'bold');
  doc.setFontSize(FONT_SIZE_TITLE);
  doc.setTextColor(...BLACK);
  const titleText = (report.title || 'Project Progress Report').slice(0, 80);
  const titleLines = wrap(doc, titleText, CONTENT_WIDTH);
  titleLines.forEach((line, i) => {
    doc.text(line, MARGIN + CONTENT_WIDTH / 2 - doc.getTextWidth(line) / 2, headerY + i * 5);
  });
  let y = headerY + titleLines.length * 5 + 2;

  doc.setFont(FONT, 'normal');
  doc.setFontSize(FONT_SIZE_BODY);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(formatDate(report.report_date), MARGIN + CONTENT_WIDTH / 2 - doc.getTextWidth(formatDate(report.report_date)) / 2, y);
  y += 4;
  if (report.reporting_status) {
    doc.text(report.reporting_status, MARGIN + CONTENT_WIDTH / 2 - doc.getTextWidth(report.reporting_status) / 2, y);
    y += 4;
  }
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, MARGIN + CONTENT_WIDTH, y);
  yRef.current = y + 10;

  if (report.narrative_updates) {
    sectionBar(doc, yRef, 'Executive Summary');
    setBodyFont(doc);
    drawJustifiedBody(doc, yRef, report.narrative_updates, CONTENT_WIDTH);
    yRef.current += SECTION_GAP;
  }

  const phases = Array.isArray(report.phases) ? report.phases : [];
  if (phases.length > 0) {
    sectionBar(doc, yRef, 'Project phases');
    phases.forEach((p, i) => {
      checkNewPage(doc, yRef, 14);
      doc.setFont(FONT, 'bold');
      doc.setFontSize(FONT_SIZE_BODY);
      doc.setTextColor(...TEXT_DARK);
      doc.text(`${i + 1}. ${p.name || `Phase ${i + 1}`}`, MARGIN, yRef.current);
      yRef.current += 5;
      if (p.description) {
        setBodyFont(doc);
        drawJustifiedParagraphs(doc, yRef, p.description, CONTENT_WIDTH - 4, { indent: 4, paragraphGap: 3 });
        yRef.current += 2;
      }
      yRef.current += 4;
    });
    yRef.current += SECTION_GAP;
  }

  const contractorStatus = Array.isArray(report.contractor_status) ? report.contractor_status : [];
  if (contractorStatus.length > 0) {
    sectionBar(doc, yRef, 'Integration status per company');
    const headers = ['Haulier / Company', 'Oper. total', 'Integrated 1', 'Date 1', 'Integrated 2', 'Date 2', '% Increase', 'Notes'];
    const rows = contractorStatus.map((c) => [
      c.contractor_name || c.haulier || '—',
      c.operational_total ?? '—',
      c.integrated_count_1 != null ? String(c.integrated_count_1) : '—',
      c.integrated_date_1 || '—',
      c.integrated_count_2 != null ? String(c.integrated_count_2) : '—',
      c.integrated_date_2 || '—',
      c.percent_increase != null ? `${c.percent_increase}%` : '—',
      (c.narrative || c.note || '—').trim() || '—', // full notes – no truncation; row height auto-expands
    ]);
    const cw = cols(28, 16, 16, 16, 16, 16, 16, 50); // wider Notes column so more text fits per line
    drawTable(doc, yRef, headers, rows, cw);
  }

  if (report.conclusion_text) {
    sectionBar(doc, yRef, 'Conclusion');
    setBodyFont(doc);
    drawJustifiedParagraphs(doc, yRef, report.conclusion_text, CONTENT_WIDTH);
  }

  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFont(FONT, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(
      `Project Progress Report · ${formatDate(report.report_date)} · Page ${p} of ${pageCount}`,
      MARGIN,
      PAGE_HEIGHT - 8
    );
    const footerRight = 'Thinkers Afrika';
    doc.text(footerRight, MARGIN + CONTENT_WIDTH - doc.getTextWidth(footerRight), PAGE_HEIGHT - 8);
  }

  return doc;
}
