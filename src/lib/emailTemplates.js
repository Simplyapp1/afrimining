/**
 * HTML email templates for notifications.
 * Shared Simplyapp frame (table-based, widely compatible HTML) for all transactional mail.
 */

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const SA_FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`;

const ACCENT_HEADER = {
  brand:
    'background:linear-gradient(135deg,#020617 0%,#0f172a 48%,#075985 100%);border-bottom:3px solid #f59e0b;',
  rose:
    'background:linear-gradient(135deg,#450a0a 0%,#991b1b 42%,#dc2626 100%);border-bottom:3px solid #fecaca;',
  amber:
    'background:linear-gradient(135deg,#422006 0%,#b45309 45%,#ea580c 100%);border-bottom:3px solid #fde68a;',
  emerald:
    'background:linear-gradient(135deg,#022c22 0%,#047857 45%,#10b981 100%);border-bottom:3px solid #6ee7b7;',
};

/**
 * Unified Simplyapp transactional document (outer table, preheader, branded header, body, legal footer).
 */
function simplyappDocumentTable({
  documentTitle,
  preheader = '',
  accent = 'brand',
  variant = 'light',
  heroKicker = 'SIMPLYAPP',
  heroLine1,
  heroLine2 = '',
  bodyInnerHtml,
  footerBlockHtml = '',
}) {
  const outerBg = variant === 'dark' ? '#020617' : '#f1f5f9';
  const cardBg = variant === 'dark' ? '#0f172a' : '#ffffff';
  const textColor = variant === 'dark' ? '#e2e8f0' : '#334155';
  const footerStripBg = variant === 'dark' ? '#020617' : '#f8fafc';
  const footerStripBorder = variant === 'dark' ? '#1e293b' : '#e2e8f0';
  const cardBorder = variant === 'dark' ? '#1e293b' : '#e2e8f0';
  const headerStyle = ACCENT_HEADER[accent] || ACCENT_HEADER.brand;
  const mutedSmall = variant === 'dark' ? '#94a3b8' : '#64748b';
  const mutedTiny = variant === 'dark' ? '#64748b' : '#94a3b8';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(documentTitle)}</title>
</head>
<body style="margin:0;padding:0;background:${outerBg};font-family:${SA_FONT};-webkit-text-size-adjust:100%;">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(preheader || documentTitle)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${outerBg};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;border-radius:16px;overflow:hidden;border:1px solid ${cardBorder};box-shadow:0 16px 48px rgba(15,23,42,0.12);">
          <tr>
            <td style="${headerStyle}padding:22px 28px;">
              <p style="margin:0 0 6px;font-size:10px;font-weight:800;letter-spacing:0.26em;color:rgba(255,255,255,0.58);">${escapeHtml(heroKicker)}</p>
              <p style="margin:0 0 4px;font-size:19px;font-weight:700;line-height:1.25;color:#f8fafc;">${escapeHtml(heroLine1)}</p>
              ${heroLine2 ? `<p style="margin:0;font-size:14px;line-height:1.45;color:rgba(248,250,252,0.88);">${escapeHtml(heroLine2)}</p>` : ''}
            </td>
          </tr>
          <tr>
            <td style="background:${cardBg};color:${textColor};padding:28px 28px 24px;font-size:15px;line-height:1.55;">
              ${bodyInnerHtml}
              ${footerBlockHtml}
            </td>
          </tr>
          <tr>
            <td style="background:${footerStripBg};padding:16px 28px;border-top:1px solid ${footerStripBorder};">
              <p style="margin:0;font-size:11px;color:${mutedSmall};text-align:center;line-height:1.65;">
                You are receiving this because your organisation uses Simplyapp.<br/>
                <span style="color:${mutedTiny};">© ${new Date().getFullYear()} Lean and Maoto Tech Solutions</span>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

const wrap = (content, title, options = {}) => {
  const charcoal = options.charcoal !== false;
  const variant = charcoal ? 'dark' : 'light';
  return simplyappDocumentTable({
    documentTitle: title,
    preheader: options.preheader || title,
    accent: 'brand',
    variant,
    heroKicker: 'SIMPLYAPP',
    heroLine1: 'Simplyapp',
    heroLine2: title,
    bodyInnerHtml: content,
    footerBlockHtml: '',
  });
};

function defaultAppUrlForEmail() {
  return (process.env.FRONTEND_ORIGIN || process.env.APP_URL || '').trim().replace(/\/$/, '');
}

const BORDER_COLOR = '#cbd5e1';
const ROW_STYLE = `padding:10px 12px;border:1px solid ${BORDER_COLOR};vertical-align:top;`;
const LABEL_STYLE = `width:38%;font-weight:bold;color:#0f172a;font-size:13px;${ROW_STYLE}`;
const VALUE_STYLE = `color:#475569;font-size:13px;white-space:pre-wrap;word-break:break-word;${ROW_STYLE}`;

function sectionBar(title) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 12px;border-radius:8px;overflow:hidden;"><tr><td style="background:linear-gradient(90deg,#0f172a,#1e3a5f);color:#fff;padding:10px 14px;font-size:11px;font-weight:800;letter-spacing:0.14em;">${escapeHtml(String(title).toUpperCase())}</td></tr></table>`;
}

/** Recruitment / candidate-facing label (Simplyapp brand strip). */
function recruitmentBadge(label) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;"><tr><td align="center">
    <span style="display:inline-block;background:linear-gradient(135deg,#0f172a,#075985);color:#fff;padding:10px 22px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:0.18em;border:1px solid rgba(245,158,11,0.5);">${escapeHtml(String(label).toUpperCase())}</span>
  </td></tr></table>`;
}

function keyValueRow(label, value) {
  if (value == null || value === '') value = '—';
  return `<tr><td style="${LABEL_STYLE}">${escapeHtml(String(label))}</td><td style="${VALUE_STYLE}">${escapeHtml(String(value))}</td></tr>`;
}

function keyValueTable(rows) {
  const body = rows.map(([label, value]) => keyValueRow(label, value)).join('');
  return `<table style="width:100%;border-collapse:collapse;margin:0 0 16px;border:1px solid ${BORDER_COLOR};"><tbody>${body}</tbody></table>`;
}

/** Full breakdown report for CC + Rector – shift report style: section bars + key-value tables. */
export function breakdownReportHtml(data) {
  const {
    driverName,
    truckRegistration,
    routeName,
    reportedAt,
    location,
    type,
    title,
    description,
    severity,
    actionsTaken,
    incidentId,
    contractorName,
    tenantName,
  } = data;

  const incidentDetails = [
    ['Reference ID', incidentId],
    ['Company (contractor)', contractorName || tenantName || '—'],
    ['Type', type],
    ['Title', title],
    ['Severity', severity],
    ['Reported at', reportedAt],
    ['Location', location],
    ['Route', routeName],
    ['Driver', driverName],
    ['Truck', truckRegistration],
  ].filter(([, v]) => v != null && v !== '');

  const content = `
    <div style="margin-bottom:20px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-radius:10px;overflow:hidden;margin:0 0 10px;"><tr><td style="background:linear-gradient(135deg,#020617,#075985);color:#fff;padding:14px 18px;text-align:center;font-size:16px;font-weight:800;letter-spacing:0.12em;">BREAKDOWN REPORT</td></tr></table>
      <p style="margin:0 0 16px;color:#64748b;font-size:13px;text-align:center;">External driver report · Simplyapp</p>
    </div>

    ${sectionBar('Incident details')}
    ${keyValueTable(incidentDetails)}

    ${(description || actionsTaken) ? `
    ${sectionBar('Description & actions')}
    ${keyValueTable([
      ...(description ? [['Description', description]] : []),
      ...(actionsTaken ? [['Actions taken', actionsTaken]] : []),
    ].filter(Boolean))}
    ` : ''}

    <div style="margin-top:20px;padding:12px;background:#f5f5f5;border:1px solid ${BORDER_COLOR};font-size:12px;color:#505050;">
      <strong>Attachments</strong> (loading slip, seals, picture of problem) are stored in the system. Log in to Command Centre or Contractor to view and manage this incident.
    </div>
  `;
  return wrap(content, 'Breakdown reported', { charcoal: false });
}

/** Confirmation to driver who reported breakdown + how to resolve. */
export function breakdownConfirmationToDriverHtml(driverName) {
  const content = `
    <h1 style="margin:0 0 16px;font-size:20px;color:#2d3748;">Breakdown reported successfully</h1>
    <p style="margin:0 0 16px;">Hi ${escapeHtml(driverName || 'there')},</p>
    <p style="margin:0 0 16px;">Your breakdown report has been received and logged. Command Centre and route managers have been notified.</p>
    <h2 style="margin:24px 0 12px;font-size:16px;color:#2d3748;">When the truck is fixed</h2>
    <p style="margin:0 0 8px;">To resolve this breakdown in the system:</p>
    <ol style="margin:0 0 16px;padding-left:20px;">
      <li>Log in to the <strong>Contractor</strong> portal with your company account.</li>
      <li>Go to <strong>Incidents / breakdowns</strong> (or the relevant section where incidents are listed).</li>
      <li>Find this breakdown and open it.</li>
      <li>Use the <strong>Resolve</strong> or <strong>Mark as resolved</strong> option and upload the offloading slip if required.</li>
    </ol>
    <p style="margin:0;color:#718096;font-size:14px;">If you need help, contact your fleet manager or Command Centre.</p>
  `;
  return wrap(content, 'Breakdown reported successfully', { charcoal: false });
}

/** Notification to CC + Rector: new fleet or driver addition (single or list). Use contractorName for the company; tenantName as fallback. */
export function newFleetDriverNotificationHtml({ type, tenantName, contractorName, list, action = 'added' }) {
  const label = type === 'truck' ? 'Fleet' : 'Driver';
  const companyName = (contractorName && String(contractorName).trim()) || (tenantName && String(tenantName).trim()) || 'Unknown';
  const listHtml = Array.isArray(list) && list.length > 0
    ? `<ul style="margin:8px 0 0;padding-left:20px;">${list.map((item) => `<li>${escapeHtml(String(item))}</li>`).join('')}</ul>`
    : '<p style="margin:8px 0 0;">—</p>';
  const content = `
    <h1 style="margin:0 0 16px;font-size:20px;color:#2d3748;">New ${label} ${action}</h1>
    <p style="margin:0 0 12px;">Contractor company <strong>${escapeHtml(companyName)}</strong>${tenantName && contractorName && String(tenantName) !== String(contractorName) ? ` (tenant: ${escapeHtml(tenantName)})` : ''} has ${action} the following ${type === 'truck' ? 'fleet registration(s)' : 'driver(s)'}:</p>
    ${listHtml}
    <p style="margin:16px 0 0;color:#718096;font-size:14px;">Review in Command Centre → Fleet & driver applications.</p>
  `;
  return wrap(content, `New ${label} ${action}`, { charcoal: false });
}

/** Confirmation to contractor who added fleet/driver. contractorName optional (company name). */
export function newFleetDriverConfirmationHtml({ type, list, action = 'added', contractorName }) {
  const label = type === 'truck' ? 'Fleet' : 'Driver';
  const listHtml = Array.isArray(list) && list.length > 0
    ? `<ul style="margin:8px 0 0;padding-left:20px;">${list.map((item) => `<li>${escapeHtml(String(item))}</li>`).join('')}</ul>`
    : '';
  const companyLine = (contractorName && String(contractorName).trim()) ? `<p style="margin:0 0 12px;">Company: <strong>${escapeHtml(contractorName)}</strong></p>` : '';
  const content = `
    <h1 style="margin:0 0 16px;font-size:20px;color:#2d3748;">${label} ${action} successfully</h1>
    <p style="margin:0 0 12px;">Your ${type === 'truck' ? 'fleet' : 'driver'} addition has been recorded and sent to Command Centre for review.</p>
    ${companyLine}
    ${listHtml ? `<p style="margin:12px 0 0;"><strong>${label}(s):</strong></p>${listHtml}` : ''}
    <p style="margin:16px 0 0;color:#718096;font-size:14px;">Once approved, you can enroll ${type === 'truck' ? 'the truck' : 'the driver'} on the route.</p>
  `;
  return wrap(content, `${label} ${action} successfully`, { charcoal: false });
}

/** Breakdown resolved: notify rector, driver, contractor. contractorName = company (contractor) name. */
export function breakdownResolvedHtml(data) {
  const { ref, title, driverName, truckRegistration, routeName, resolutionNote, resolvedAt, contractorName } = data;
  const rows = [
    ['Reference', ref],
    ['Title', title],
    ['Company (contractor)', contractorName],
    ['Driver', driverName],
    ['Truck', truckRegistration],
    ['Route', routeName],
    ['Resolved at', resolvedAt],
    ['Resolution note', resolutionNote],
  ].filter(([, v]) => v != null && v !== '');
  const content = `
    <h1 style="margin:0 0 16px;font-size:20px;color:#2d3748;">Breakdown resolved</h1>
    <p style="margin:0 0 16px;">The following breakdown has been marked as resolved in Command Centre.</p>
    ${sectionBar('Resolution details')}
    ${keyValueTable(rows)}
    <p style="margin:16px 0 0;color:#718096;font-size:14px;">You can view and download the full report from Command Centre or the Contractor portal.</p>
  `;
  return wrap(content, 'Breakdown resolved', { charcoal: false });
}

/** Trucks enrolled on route: notify Access Management users. */
export function trucksEnrolledOnRouteHtml({ tenantName, routeName, registrations, appUrl }) {
  const listHtml = Array.isArray(registrations) && registrations.length > 0
    ? `<ul style="margin:8px 0 0;padding-left:20px;">${registrations.map((r) => `<li>${escapeHtml(String(r))}</li>`).join('')}</ul>`
    : '<p style="margin:8px 0 0;">—</p>';
  const link = appUrl ? `<p style="margin:16px 0 0;"><a href="${escapeHtml(appUrl)}" style="color:#3182ce;">Open Access Management</a></p>` : '';
  const content = `
    <h1 style="margin:0 0 16px;font-size:20px;color:#2d3748;">Trucks enrolled on route</h1>
    <p style="margin:0 0 12px;">Contractor <strong>${escapeHtml(tenantName || 'Unknown')}</strong> has enrolled the following truck(s) on route <strong>${escapeHtml(routeName || 'Unknown')}</strong>:</p>
    ${listHtml}
    <p style="margin:16px 0 0;color:#718096;font-size:14px;">You can view and manage routes in Access Management.</p>
    ${link}
  `;
  return wrap(content, 'Trucks enrolled on route', { charcoal: false });
}

/** Application approved: truck/driver can now be enrolled on route. contractorName = company name. */
export function applicationApprovedHtml({ entityType, entityLabel, tenantName, contractorName }) {
  const label = entityType === 'truck' ? 'Truck' : 'Driver';
  const companyName = (contractorName && String(contractorName).trim()) || (tenantName && String(tenantName).trim()) || 'your company';
  const content = `
    <h1 style="margin:0 0 16px;font-size:20px;color:#2d3748;">${label} approved</h1>
    <p style="margin:0 0 12px;">Good news — the application for <strong>${escapeHtml(entityLabel || label)}</strong> (company: <strong>${escapeHtml(companyName)}</strong>) has been approved.</p>
    <p style="margin:0 0 12px;">You can now enroll this ${entityType === 'truck' ? 'truck' : 'driver'} on the route in the Contractor portal.</p>
    <p style="margin:16px 0 0;color:#718096;font-size:14px;">Log in to the Contractor section and complete route enrollment for this ${entityType === 'truck' ? 'vehicle' : 'driver'}.</p>
  `;
  return wrap(content, `${label} approved`, { charcoal: false });
}

/** Bulk applications approved: one email listing all approved items with contractor names. */
export function applicationBulkApprovedHtml({ items }) {
  if (!Array.isArray(items) || items.length === 0) {
    return wrap('<p>No items.</p>', 'Applications approved', { charcoal: false });
  }
  const listHtml = items.map((item) => {
    const label = (item.entityType === 'truck' ? 'Truck' : 'Driver') + ': ' + escapeHtml(item.entityLabel || '—');
    const company = (item.contractorName && String(item.contractorName).trim()) ? ` (${escapeHtml(item.contractorName)})` : '';
    return `<li>${label}${company}</li>`;
  }).join('');
  const content = `
    <h1 style="margin:0 0 16px;font-size:20px;color:#2d3748;">Applications approved</h1>
    <p style="margin:0 0 12px;">The following have been approved. You can now enroll them on the route in the Contractor portal.</p>
    <ul style="margin:12px 0 0;padding-left:20px;">${listHtml}</ul>
    <p style="margin:16px 0 0;color:#718096;font-size:14px;">Log in to the Contractor section and complete route enrollment for each.</p>
  `;
  return wrap(content, 'Applications approved', { charcoal: false });
}

/** Application approved – for rector awareness (notification only). */
export function applicationApprovedToRectorHtml({ entityType, entityLabel, tenantName, contractorName }) {
  const label = entityType === 'truck' ? 'Truck' : 'Driver';
  const companyName = (contractorName && String(contractorName).trim()) || (tenantName && String(tenantName).trim()) || '—';
  const content = `
    <h1 style="margin:0 0 16px;font-size:20px;color:#e2e8f0;">${label} approved (for your awareness)</h1>
    <p style="margin:0 0 12px;">Command Centre has approved the application for <strong>${escapeHtml(entityLabel || label)}</strong> (company: <strong>${escapeHtml(companyName)}</strong>).</p>
    <p style="margin:0 0 12px;">They can now enroll this ${entityType === 'truck' ? 'truck' : 'driver'} on the route in the Contractor portal.</p>
  `;
  return wrap(content, `${label} approved`, { charcoal: true });
}

/** Bulk applications approved – for rector awareness (notification only). */
export function applicationBulkApprovedToRectorHtml({ items }) {
  if (!Array.isArray(items) || items.length === 0) {
    return wrap('<p>No items.</p>', 'Applications approved', { charcoal: true });
  }
  const listHtml = items.map((item) => {
    const label = (item.entityType === 'truck' ? 'Truck' : 'Driver') + ': ' + escapeHtml(item.entityLabel || '—');
    const company = (item.contractorName && String(item.contractorName).trim()) ? ` (${escapeHtml(item.contractorName)})` : '';
    return `<li>${label}${company}</li>`;
  }).join('');
  const content = `
    <h1 style="margin:0 0 16px;font-size:20px;color:#e2e8f0;">Applications approved (for your awareness)</h1>
    <p style="margin:0 0 12px;">Command Centre has approved the following. They can now be enrolled on the route in the Contractor portal.</p>
    <ul style="margin:12px 0 0;padding-left:20px;">${listHtml}</ul>
  `;
  return wrap(content, 'Applications approved', { charcoal: true });
}

/** Truck suspended (Command Centre): to contractor – grey template, with instructions to lift suspension. */
export function truckSuspendedToContractorHtml({ truckRegistration, tenantName, reason, isPermanent, suspensionEndsAt, appUrl }) {
  const reasonText = reason || 'Suspended from Command Centre (Fleet and driver compliance).';
  const durationText = isPermanent
    ? 'The suspension is permanent until reinstated by Command Centre.'
    : (suspensionEndsAt ? `The suspension is in effect until ${escapeHtml(String(suspensionEndsAt))}.` : 'The suspension is time-limited. Contact Command Centre for the exact end date.');
  const content = `
    <h1 style="margin:0 0 16px;font-size:20px;color:#e2e8f0;">Truck suspended</h1>
    <p style="margin:0 0 12px;">Your truck <strong>${escapeHtml(truckRegistration || 'Unknown')}</strong> (${escapeHtml(tenantName || 'contractor')}) has been suspended by Command Centre.</p>
    <p style="margin:0 0 12px;"><strong>Reason:</strong> ${escapeHtml(reasonText)}</p>
    <p style="margin:0 0 12px;">${durationText}</p>
    <p style="margin:16px 0 8px;font-weight:bold;color:#e2e8f0;">This truck has been removed from all route enrollments and will not appear on list distribution until reinstated.</p>
    ${sectionBar('How to lift the suspension')}
    <p style="margin:8px 0 0;">To have the suspension lifted (reinstatement):</p>
    <ol style="margin:8px 0 0;padding-left:20px;">
      <li>Address the reason for suspension (compliance, documentation, or other requirements).</li>
      <li>Contact Command Centre or your route rector to request reinstatement.</li>
      <li>Command Centre will reinstate the truck when the matter is resolved; you will receive an email when the truck is reinstated.</li>
    </ol>
    <p style="margin:16px 0 0;color:#a0aec0;font-size:14px;">You can view suspension status in the Contractor portal under Suspensions and appeals.</p>
    ${appUrl ? `<p style="margin:12px 0 0;"><a href="${escapeHtml(appUrl)}" style="color:#63b3ed;">Open Contractor portal</a></p>` : ''}
  `;
  return wrap(content, 'Truck suspended', { charcoal: true });
}

/** Truck suspended: to rector (and CC) – grey template, rector-relevant. */
export function truckSuspendedToRectorHtml({ truckRegistration, tenantName, reason, isPermanent, suspensionEndsAt }) {
  const reasonText = reason || 'Suspended from Command Centre.';
  const content = `
    <h1 style="margin:0 0 16px;font-size:20px;color:#e2e8f0;">Truck suspended (for your awareness)</h1>
    <p style="margin:0 0 12px;">Command Centre has suspended truck <strong>${escapeHtml(truckRegistration || 'Unknown')}</strong> for contractor <strong>${escapeHtml(tenantName || 'Unknown')}</strong>.</p>
    <p style="margin:0 0 12px;"><strong>Reason:</strong> ${escapeHtml(reasonText)}</p>
    <p style="margin:0 0 12px;">The truck has been removed from all route enrollments and will not appear on list distribution until reinstatement.</p>
    <p style="margin:16px 0 0;color:#a0aec0;font-size:14px;">You may be contacted by the contractor to request reinstatement. Reinstatement is done via Command Centre or Access Management.</p>
  `;
  return wrap(content, 'Truck suspended', { charcoal: true });
}

/** Truck reinstated: to contractor – grey template. */
export function truckReinstatedToContractorHtml({ truckRegistration, tenantName, appUrl }) {
  const content = `
    <h1 style="margin:0 0 16px;font-size:20px;color:#e2e8f0;">Truck reinstated</h1>
    <p style="margin:0 0 12px;">Your truck <strong>${escapeHtml(truckRegistration || 'Unknown')}</strong> (${escapeHtml(tenantName || 'contractor')}) has been reinstated.</p>
    <p style="margin:0 0 12px;">It is no longer suspended and can be enrolled on routes again in the Contractor portal (Fleet and driver enrollment).</p>
    <p style="margin:16px 0 0;color:#a0aec0;font-size:14px;">Re-enroll the truck on the required route(s) to include it in list distribution.</p>
    ${appUrl ? `<p style="margin:12px 0 0;"><a href="${escapeHtml(appUrl)}" style="color:#63b3ed;">Open Contractor portal</a></p>` : ''}
  `;
  return wrap(content, 'Truck reinstated', { charcoal: true });
}

/** Truck reinstated: to rector – grey template, rector-relevant. */
export function truckReinstatedToRectorHtml({ truckRegistration, tenantName }) {
  const content = `
    <h1 style="margin:0 0 16px;font-size:20px;color:#e2e8f0;">Truck reinstated (for your awareness)</h1>
    <p style="margin:0 0 12px;">Truck <strong>${escapeHtml(truckRegistration || 'Unknown')}</strong> for contractor <strong>${escapeHtml(tenantName || 'Unknown')}</strong> has been reinstated.</p>
    <p style="margin:0 0 12px;">The contractor can now re-enroll this truck on routes; it will appear on list distribution once enrolled.</p>
  `;
  return wrap(content, 'Truck reinstated', { charcoal: true });
}

/** Reinstatement emails — Simplyapp emerald accent (shared shell). */
function reinstatementEmailLayout(title, subtitle, innerContent) {
  const footerBlockHtml = `
    <div style="border-top:1px solid #a7f3d0;margin-top:24px;padding-top:20px;">
      <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#047857;">Simplyapp · Fleet & logistics</p>
      <p style="margin:0;font-size:13px;color:#64748b;">Access Management & route rectors</p>
    </div>`;
  return simplyappDocumentTable({
    documentTitle: `Reinstatement — ${title}`,
    preheader: `${title} · ${subtitle}`,
    accent: 'emerald',
    variant: 'light',
    heroLine1: 'Reinstatement',
    heroLine2: `${title} · ${subtitle}`,
    bodyInnerHtml: innerContent,
    footerBlockHtml,
  });
}

/** Reinstated (truck or driver): to contractor – green modern template. */
export function reinstatedToContractorHtml({ entityType, entityLabel, tenantName, appUrl }) {
  const isTruck = entityType === 'truck';
  const content = `
    <p style="margin: 0 0 16px 0; font-size: 15px; color: #334155; line-height: 1.5;">Your ${isTruck ? 'truck' : 'driver'} <strong>${escapeHtml(entityLabel || 'Unknown')}</strong> (${escapeHtml(tenantName || 'contractor')}) has been reinstated.</p>
    <p style="margin: 0 0 16px 0; font-size: 15px; color: #334155; line-height: 1.5;">The suspension has been lifted. You can ${isTruck ? 're-enroll this truck on routes in Fleet and driver enrollment' : 're-enroll this driver on routes'} in the Contractor portal.</p>
    ${appUrl ? `<p style="margin: 16px 0 0;"><a href="${escapeHtml(appUrl)}" style="color: #059669; font-weight: 600; text-decoration: none;">Open Contractor portal →</a></p>` : ''}
  `;
  return reinstatementEmailLayout('Reinstated', isTruck ? 'Truck' : 'Driver', content);
}

/** Reinstated (truck or driver): to rector – green modern, rector-relevant. */
export function reinstatedToRectorHtml({ entityType, entityLabel, tenantName }) {
  const isTruck = entityType === 'truck';
  const content = `
    <p style="margin: 0 0 16px 0; font-size: 15px; color: #334155; line-height: 1.5;">${isTruck ? 'Truck' : 'Driver'} <strong>${escapeHtml(entityLabel || 'Unknown')}</strong> for contractor <strong>${escapeHtml(tenantName || 'Unknown')}</strong> has been reinstated by Access Management.</p>
    <p style="margin: 0 0 0; font-size: 15px; color: #334155; line-height: 1.5;">The contractor can now re-enroll this ${isTruck ? 'truck' : 'driver'} on routes; it will appear on list distribution once enrolled.</p>
  `;
  return reinstatementEmailLayout('Reinstated (for your awareness)', isTruck ? 'Truck' : 'Driver', content);
}

/** Reinstated (truck or driver): to access management – green modern, confirmation. */
export function reinstatedToAccessManagementHtml({ entityType, entityLabel, tenantName, reinstatedBy }) {
  const isTruck = entityType === 'truck';
  const content = `
    <p style="margin: 0 0 16px 0; font-size: 15px; color: #334155; line-height: 1.5;">The reinstatement request for ${isTruck ? 'truck' : 'driver'} <strong>${escapeHtml(entityLabel || 'Unknown')}</strong> (${escapeHtml(tenantName || 'Unknown')}) has been approved.</p>
    <p style="margin: 0 0 0; font-size: 15px; color: #334155; line-height: 1.5;">${reinstatedBy ? `Reinstated by ${escapeHtml(reinstatedBy)}.` : 'Status updated to reinstated.'} The contractor and rector have been notified.</p>
  `;
  return reinstatementEmailLayout('Reinstatement approved', isTruck ? 'Truck' : 'Driver', content);
}

const TASK_ROW_STYLE = `padding:10px 12px;border:1px solid #fecaca;vertical-align:top;`;
const TASK_LABEL_STYLE = `width:38%;font-weight:bold;color:#1f2937;font-size:13px;${TASK_ROW_STYLE}`;
const TASK_VALUE_STYLE = `color:#374151;font-size:13px;white-space:pre-wrap;word-break:break-word;${TASK_ROW_STYLE}`;

function taskKeyValueRow(label, value) {
  if (value == null || value === '') value = '—';
  return `<tr><td style="${TASK_LABEL_STYLE}">${escapeHtml(String(label))}</td><td style="${TASK_VALUE_STYLE}">${escapeHtml(String(value))}</td></tr>`;
}

function taskKeyValueTable(rows) {
  const body = rows.map(([label, value]) => taskKeyValueRow(label, value)).join('');
  return `<table style="width:100%;border-collapse:collapse;margin:0 0 16px;border:1px solid #fecaca;"><tbody>${body}</tbody></table>`;
}

function taskSectionBar(title) {
  return `<div style="background: linear-gradient(90deg, #991b1b, #b91c1c); color:#fff; padding:8px 12px; margin:0 0 12px; font-size:12px; font-weight:bold; letter-spacing:0.05em; border-radius:6px;">${escapeHtml(title)}</div>`;
}

/** Tasks, security, and urgent notices — Simplyapp rose accent (shared shell). */
function taskEmailLayout(subtitle, innerContent, section = 'Tasks') {
  const footerBlockHtml = `
    <div style="border-top:1px solid #fecaca;margin-top:24px;padding-top:20px;">
      <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#b91c1c;">Monitoring team</p>
      <p style="margin:0;font-size:13px;color:#64748b;">For further inquiries: <a href="mailto:vincent@thinkersafrika.co.za" style="color:#dc2626;text-decoration:none;">vincent@thinkersafrika.co.za</a></p>
    </div>`;
  return simplyappDocumentTable({
    documentTitle: `${section} — ${subtitle}`,
    preheader: `${section} · ${subtitle}`,
    accent: 'rose',
    variant: 'light',
    heroLine1: section,
    heroLine2: subtitle,
    bodyInnerHtml: innerContent,
    footerBlockHtml,
  });
}

/** Shared task email template: same layout as task creation (assigned). Subtitle + first paragraph + Task details table + link. */
function taskNotificationHtml(subtitle, firstParagraphHtml, taskTitle, dueDate, taskId, appUrl) {
  const dueStr = dueDate ? new Date(dueDate).toLocaleDateString() : (dueDate === null || dueDate === undefined ? 'Not set' : '—');
  const content = `
    ${firstParagraphHtml}
    ${taskSectionBar('Task details')}
    ${taskKeyValueTable([
      ['Title', taskTitle],
      ['Due date', dueStr],
    ])}
    <p style="margin: 16px 0 0;"><a href="${escapeHtml((appUrl || '') + '/tasks-tracker?open=' + (taskId || ''))}" style="color: #2563eb; font-weight: 600; text-decoration: none;">Open task in Tasks Tracker →</a></p>
  `;
  return taskEmailLayout(subtitle, content);
}

/** Task assigned: notify assignee(s) – same template as task creation. */
export function taskAssignedHtml({ taskTitle, assignerName, dueDate, taskId, appUrl }) {
  const firstParagraph = `<p style="margin: 0 0 16px 0; font-size: 15px; color: #334155; line-height: 1.5;"><strong>${escapeHtml(assignerName || 'A colleague')}</strong> has assigned you a task.</p>`;
  return taskNotificationHtml('Task assigned to you', firstParagraph, taskTitle, dueDate, taskId, appUrl);
}

/** Task completed: notify person who assigned (creator). */
export function taskCompletedHtml({ taskTitle, completedByName, completedAt, taskId, appUrl }) {
  const content = `
    <p style="margin: 0 0 16px 0; font-size: 15px; color: #334155; line-height: 1.5;">A task you created or assigned has been marked complete.</p>
    ${taskSectionBar('Details')}
    ${taskKeyValueTable([
      ['Task', taskTitle],
      ['Completed by', completedByName],
      ['Completed at', completedAt],
    ])}
    <p style="margin: 16px 0 0;"><a href="${escapeHtml((appUrl || '') + '/tasks-tracker?open=' + (taskId || ''))}" style="color: #2563eb; font-weight: 600; text-decoration: none;">View in Tasks Tracker →</a></p>
  `;
  return taskEmailLayout('Task completed', content);
}

/** Task overdue: same template as task creation (assigned), with overdue message. */
export function taskOverdueHtml({ taskTitle, dueDate, taskId, appUrl }) {
  const firstParagraph = `<p style="margin: 0 0 16px 0; font-size: 15px; color: #334155; line-height: 1.5;">This task is <strong style="color: #b45309;">overdue</strong>. Please complete it or update the due date.</p>`;
  return taskNotificationHtml('Task overdue', firstParagraph, taskTitle, dueDate, taskId, appUrl);
}

/** Reminder fired (hourly / daily / one-off). */
export function taskReminderDueHtml({ taskTitle, note, remindAt, taskId, appUrl }) {
  const when = remindAt ? new Date(remindAt).toLocaleString() : '—';
  const noteHtml = note ? `<p style="margin: 0 0 12px 0; font-size: 14px; color: #475569;"><strong>Note:</strong> ${escapeHtml(String(note))}</p>` : '';
  const firstParagraph = `<p style="margin: 0 0 16px 0; font-size: 15px; color: #334155; line-height: 1.5;">This is a scheduled reminder for your task.</p>${noteHtml}`;
  const content = `
    ${firstParagraph}
    ${taskSectionBar('Reminder')}
    ${taskKeyValueTable([
      ['Task', taskTitle],
      ['Remind at', when],
    ])}
    <p style="margin: 16px 0 0;"><a href="${escapeHtml((appUrl || '') + '/tasks-tracker?open=' + (taskId || ''))}" style="color: #2563eb; font-weight: 600; text-decoration: none;">Open in Tasks Tracker →</a></p>
  `;
  return taskEmailLayout('Task reminder', content);
}

/** New comment on a task (notify creator + assignees except author when visibility is team-wide). */
export function taskNewCommentHtml({ taskTitle, authorName, excerpt, visibilityLabel, taskId, appUrl }) {
  const firstParagraph = `<p style="margin: 0 0 16px 0; font-size: 15px; color: #334155; line-height: 1.5;"><strong>${escapeHtml(authorName || 'Someone')}</strong> added a note${visibilityLabel ? ` <span style="color:#64748b;">(${escapeHtml(visibilityLabel)})</span>` : ''}.</p>`;
  const ex = excerpt ? `<p style="margin: 0 0 12px 0; padding: 12px; background: #f1f5f9; border-radius: 8px; font-size: 14px; color: #334155;">${escapeHtml(excerpt)}</p>` : '';
  const content = `
    ${firstParagraph}
    ${ex}
    ${taskSectionBar('Task')}
    ${taskKeyValueTable([['Title', taskTitle]])}
    <p style="margin: 16px 0 0;"><a href="${escapeHtml((appUrl || '') + '/tasks-tracker?open=' + (taskId || ''))}" style="color: #2563eb; font-weight: 600; text-decoration: none;">Open in Tasks Tracker →</a></p>
  `;
  return taskEmailLayout('New task note', content);
}

/** Task updated (generic notify for major field changes). */
export function taskUpdatedNotifyHtml({ taskTitle, summaryLines, taskId, appUrl }) {
  const rows = (summaryLines || []).map(([k, v]) => [k, v]);
  const content = `
    <p style="margin: 0 0 16px 0; font-size: 15px; color: #334155; line-height: 1.5;">A task you follow has been updated.</p>
    ${taskSectionBar('Changes')}
    ${taskKeyValueTable([['Task', taskTitle], ...rows])}
    <p style="margin: 16px 0 0;"><a href="${escapeHtml((appUrl || '') + '/tasks-tracker?open=' + (taskId || ''))}" style="color: #2563eb; font-weight: 600; text-decoration: none;">Open in Tasks Tracker →</a></p>
  `;
  return taskEmailLayout('Task updated', content);
}

/** Work schedule created: notify the employee. Same red template as task emails (Tasks · subtitle, Task details bar, table, link). */
export function scheduleCreatedHtml({ scheduleTitle, periodStart, periodEnd, createdByName, appUrl }) {
  const startStr = periodStart ? new Date(periodStart + 'T12:00:00').toLocaleDateString() : '—';
  const endStr = periodEnd ? new Date(periodEnd + 'T12:00:00').toLocaleDateString() : '—';
  const firstParagraph = `<p style="margin: 0 0 16px 0; font-size: 15px; color: #334155; line-height: 1.5;">Your work schedule has been created${createdByName ? ` by <strong>${escapeHtml(createdByName)}</strong>` : ''}.</p>`;
  const content = `
    ${firstParagraph}
    ${taskSectionBar('Task details')}
    ${taskKeyValueTable([
      ['Title', scheduleTitle],
      ['Period start', startStr],
      ['Period end', endStr],
    ])}
    <p style="margin: 16px 0 0;"><a href="${escapeHtml((appUrl || '') + '/profile')}" style="color: #dc2626; font-weight: 600; text-decoration: none;">View schedule in Profile →</a></p>
  `;
  return taskEmailLayout('Schedule created', content);
}

/** Leave applied: notify management (same red template as tasks). */
export function leaveAppliedHtml({ applicantName, leaveType, startDate, endDate, daysRequested, reason, appUrl }) {
  const startStr = startDate ? new Date(startDate + 'T12:00:00').toLocaleDateString() : '—';
  const endStr = endDate ? new Date(endDate + 'T12:00:00').toLocaleDateString() : '—';
  const firstParagraph = `<p style="margin: 0 0 16px 0; font-size: 15px; color: #334155; line-height: 1.5;"><strong>${escapeHtml(applicantName || 'An employee')}</strong> has submitted a leave application for your review.</p>`;
  const rows = [
    ['Applicant', applicantName],
    ['Leave type', leaveType],
    ['Start date', startStr],
    ['End date', endStr],
    ['Days requested', String(daysRequested ?? '—')],
    ...(reason ? [['Reason', reason]] : []),
  ];
  const content = `
    ${firstParagraph}
    ${taskSectionBar('Task details')}
    ${taskKeyValueTable(rows)}
    <p style="margin: 16px 0 0;"><a href="${escapeHtml((appUrl || '') + '/management')}" style="color: #dc2626; font-weight: 600; text-decoration: none;">Review in Management →</a></p>
  `;
  return taskEmailLayout('Leave application submitted', content);
}

/** Leave approved or declined: notify applicant (same red template as tasks). */
export function leaveReviewedHtml({ status, leaveType, startDate, endDate, reviewedByName, reviewNotes, appUrl }) {
  const startStr = startDate ? new Date(startDate + 'T12:00:00').toLocaleDateString() : '—';
  const endStr = endDate ? new Date(endDate + 'T12:00:00').toLocaleDateString() : '—';
  const isApproved = status === 'approved';
  const firstParagraph = `<p style="margin: 0 0 16px 0; font-size: 15px; color: #334155; line-height: 1.5;">Your leave application has been <strong style="color: ${isApproved ? '#15803d' : '#b91c1c'};">${isApproved ? 'approved' : 'declined'}</strong>${reviewedByName ? ` by <strong>${escapeHtml(reviewedByName)}</strong>` : ''}.</p>`;
  const rows = [
    ['Leave type', leaveType],
    ['Start date', startStr],
    ['End date', endStr],
    ['Status', isApproved ? 'Approved' : 'Declined'],
    ...(reviewNotes ? [['Notes', reviewNotes]] : []),
  ];
  const content = `
    ${firstParagraph}
    ${taskSectionBar('Task details')}
    ${taskKeyValueTable(rows)}
    <p style="margin: 16px 0 0;"><a href="${escapeHtml((appUrl || '') + '/profile')}" style="color: #dc2626; font-weight: 600; text-decoration: none;">View in Profile →</a></p>
  `;
  return taskEmailLayout(isApproved ? 'Leave approved' : 'Leave declined', content);
}

/** Warning issued: notify the employee (same red template as tasks). */
export function warningIssuedHtml({ warningType, description, issuedByName, appUrl }) {
  const firstParagraph = `<p style="margin: 0 0 16px 0; font-size: 15px; color: #334155; line-height: 1.5;">A disciplinary warning has been issued to you${issuedByName ? ` by <strong>${escapeHtml(issuedByName)}</strong>` : ''}.</p>`;
  const rows = [
    ['Type', warningType],
    ...(description ? [['Description', description]] : []),
  ];
  const content = `
    ${firstParagraph}
    ${taskSectionBar('Task details')}
    ${taskKeyValueTable(rows)}
    <p style="margin: 16px 0 0;"><a href="${escapeHtml((appUrl || '') + '/profile')}" style="color: #dc2626; font-weight: 600; text-decoration: none;">View in Profile →</a></p>
  `;
  return taskEmailLayout('Warning issued', content);
}

/** Reward issued: notify the employee (same red template as tasks). */
export function rewardIssuedHtml({ rewardType, description, issuedByName, appUrl }) {
  const firstParagraph = `<p style="margin: 0 0 16px 0; font-size: 15px; color: #334155; line-height: 1.5;">You have received a reward${issuedByName ? ` from <strong>${escapeHtml(issuedByName)}</strong>` : ''}.</p>`;
  const rows = [
    ['Type', rewardType],
    ...(description ? [['Description', description]] : []),
  ];
  const content = `
    ${firstParagraph}
    ${taskSectionBar('Task details')}
    ${taskKeyValueTable(rows)}
    <p style="margin: 16px 0 0;"><a href="${escapeHtml((appUrl || '') + '/profile')}" style="color: #dc2626; font-weight: 600; text-decoration: none;">View in Profile →</a></p>
  `;
  return taskEmailLayout('Reward issued', content);
}

function shiftLabelForEmail(shiftTypeOrLabel) {
  const s = String(shiftTypeOrLabel || '').trim();
  if (!s) return '—';
  if (s.includes('–') || s.includes('—')) return s;
  const t = s.toLowerCase();
  if (t === 'night') return 'Night';
  if (t === 'custom') return 'Custom hours';
  return 'Day';
}

function dateLabelForEmail(date) {
  if (!date) return '—';
  const d = typeof date === 'string' && date.length === 10 ? new Date(date + 'T12:00:00') : new Date(date);
  if (Number.isNaN(d.getTime())) return String(date);
  return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

/** Shift swap requested: notify selected colleague to review in Profile. */
export function shiftSwapRequestedHtml({ requesterName, requesterDate, requesterShift, yourDate, yourShift, message, appUrl }) {
  const content = `
    <p style="margin: 0 0 16px 0; font-size: 15px; color: #334155; line-height: 1.5;">
      <strong>${escapeHtml(requesterName || 'A colleague')}</strong> requested to swap shifts with you.
    </p>
    ${taskSectionBar('Swap request details')}
    ${taskKeyValueTable([
      ['Requested by', requesterName || '—'],
      ['Their shift', `${dateLabelForEmail(requesterDate)} · ${shiftLabelForEmail(requesterShift)}`],
      ['Your shift', `${dateLabelForEmail(yourDate)} · ${shiftLabelForEmail(yourShift)}`],
      ...(message ? [['Message', message]] : []),
    ])}
    <p style="margin: 16px 0 0;">
      <a href="${escapeHtml((appUrl || '') + '/profile')}" style="color: #dc2626; font-weight: 600; text-decoration: none;">Review in Profile →</a>
    </p>
  `;
  return taskEmailLayout('Shift swap request', content, 'Work schedule');
}

/** Shift swap peer-approved: notify management to approve/decline in Management page. */
export function shiftSwapPendingManagementHtml({ requesterName, counterpartyName, requesterDate, requesterShift, counterpartyDate, counterpartyShift, appUrl }) {
  const content = `
    <p style="margin: 0 0 16px 0; font-size: 15px; color: #334155; line-height: 1.5;">
      A shift swap has been accepted by the colleague and is waiting for management approval.
    </p>
    ${taskSectionBar('Swap request details')}
    ${taskKeyValueTable([
      ['Requester', requesterName || '—'],
      ['Colleague', counterpartyName || '—'],
      ['Requester gives', `${dateLabelForEmail(requesterDate)} · ${shiftLabelForEmail(requesterShift)}`],
      ['Colleague gives', `${dateLabelForEmail(counterpartyDate)} · ${shiftLabelForEmail(counterpartyShift)}`],
    ])}
    <p style="margin: 16px 0 0;">
      <a href="${escapeHtml((appUrl || '') + '/management')}" style="color: #dc2626; font-weight: 600; text-decoration: none;">Approve in Management →</a>
    </p>
  `;
  return taskEmailLayout('Shift swap awaiting management approval', content, 'Work schedule');
}

/** Shift swap approved by management: notify both employees that schedule is updated. */
export function shiftSwapApprovedHtml({ counterpartyName, yourOldDate, yourOldShift, yourNewDate, yourNewShift, appUrl }) {
  const content = `
    <p style="margin: 0 0 16px 0; font-size: 15px; color: #334155; line-height: 1.5;">
      Your shift swap with <strong>${escapeHtml(counterpartyName || 'your colleague')}</strong> has been approved by management and your schedule is now updated.
    </p>
    ${taskSectionBar('Updated schedule')}
    ${taskKeyValueTable([
      ['Previous shift', `${dateLabelForEmail(yourOldDate)} · ${shiftLabelForEmail(yourOldShift)}`],
      ['New shift', `${dateLabelForEmail(yourNewDate)} · ${shiftLabelForEmail(yourNewShift)}`],
    ])}
    <p style="margin: 16px 0 0;">
      <a href="${escapeHtml((appUrl || '') + '/profile')}" style="color: #dc2626; font-weight: 600; text-decoration: none;">View updated schedule →</a>
    </p>
  `;
  return taskEmailLayout('Shift swap approved', content, 'Work schedule');
}

/** Colleague declined the swap: notify requester. */
export function shiftSwapPeerDeclinedHtml({ counterpartyName, requesterDate, requesterShift, counterpartyDate, counterpartyShift, peerNotes, appUrl }) {
  const content = `
    <p style="margin: 0 0 16px 0; font-size: 15px; color: #334155; line-height: 1.5;">
      <strong>${escapeHtml(counterpartyName || 'Your colleague')}</strong> declined your shift swap request. Your schedule is unchanged.
    </p>
    ${taskSectionBar('Request details')}
    ${taskKeyValueTable([
      ['Your shift offered', `${dateLabelForEmail(requesterDate)} · ${shiftLabelForEmail(requesterShift)}`],
      ['Their shift', `${dateLabelForEmail(counterpartyDate)} · ${shiftLabelForEmail(counterpartyShift)}`],
      ...(peerNotes ? [['Colleague note', peerNotes]] : []),
    ])}
    <p style="margin: 16px 0 0;">
      <a href="${escapeHtml((appUrl || '') + '/profile')}" style="color: #dc2626; font-weight: 600; text-decoration: none;">View schedule in Profile →</a>
    </p>
  `;
  return taskEmailLayout('Shift swap declined', content, 'Work schedule');
}

/** Management declined the swap: notify requester and colleague (same body; both schedules unchanged). */
export function shiftSwapManagementDeclinedHtml({ otherPartyName, requesterDate, requesterShift, counterpartyDate, counterpartyShift, managementNotes, appUrl }) {
  const content = `
    <p style="margin: 0 0 16px 0; font-size: 15px; color: #334155; line-height: 1.5;">
      Management has declined the shift swap between you and <strong>${escapeHtml(otherPartyName || 'your colleague')}</strong>. No changes were made to either schedule.
    </p>
    ${taskSectionBar('Request details')}
    ${taskKeyValueTable([
      ['Requester shift', `${dateLabelForEmail(requesterDate)} · ${shiftLabelForEmail(requesterShift)}`],
      ['Colleague shift', `${dateLabelForEmail(counterpartyDate)} · ${shiftLabelForEmail(counterpartyShift)}`],
      ...(managementNotes ? [['Management note', managementNotes]] : []),
    ])}
    <p style="margin: 16px 0 0;">
      <a href="${escapeHtml((appUrl || '') + '/profile')}" style="color: #dc2626; font-weight: 600; text-decoration: none;">View schedule in Profile →</a>
    </p>
  `;
  return taskEmailLayout('Shift swap not approved', content, 'Work schedule');
}

/** Command Centre reminder due: notify owner at reminder time. */
export function commandCentreReminderHtml({ noteText, reminderAt, appUrl }) {
  const reminderLabel = reminderAt ? new Date(reminderAt).toLocaleString() : 'Now';
  const content = `
    <p style="margin: 0 0 16px 0; font-size: 15px; color: #334155; line-height: 1.5;">
      This is your reminder from <strong>Command Centre · Notes & reminders</strong>.
    </p>
    ${taskSectionBar('Reminder details')}
    ${taskKeyValueTable([
      ['When', reminderLabel],
      ['Note', noteText || '—'],
    ])}
    <p style="margin: 16px 0 0;">
      <a href="${escapeHtml((appUrl || '') + '/command-centre')}" style="color: #dc2626; font-weight: 600; text-decoration: none;">Open Command Centre →</a>
    </p>
  `;
  return taskEmailLayout('Reminder due', content, 'Notes & reminders');
}

// —— Gold template for super admin notifications (new user / new tenant) ——
const GOLD_ROW_STYLE = `padding:10px 12px;border:1px solid #fde68a;vertical-align:top;`;
const GOLD_LABEL_STYLE = `width:38%;font-weight:bold;color:#1f2937;font-size:13px;${GOLD_ROW_STYLE}`;
const GOLD_VALUE_STYLE = `color:#374151;font-size:13px;white-space:pre-wrap;word-break:break-word;${GOLD_ROW_STYLE}`;

function goldKeyValueRow(label, value) {
  if (value == null || value === '') value = '—';
  return `<tr><td style="${GOLD_LABEL_STYLE}">${escapeHtml(String(label))}</td><td style="${GOLD_VALUE_STYLE}">${escapeHtml(String(value))}</td></tr>`;
}

function goldKeyValueTable(rows) {
  const body = rows.map(([label, value]) => goldKeyValueRow(label, value)).join('');
  return `<table style="width:100%;border-collapse:collapse;margin:0 0 16px;border:1px solid #fde68a;"><tbody>${body}</tbody></table>`;
}

function goldSectionBar(title) {
  return `<div style="background: linear-gradient(90deg, #b45309, #d97706); color:#fff; padding:8px 12px; margin:0 0 12px; font-size:12px; font-weight:bold; letter-spacing:0.05em; border-radius:6px;">${escapeHtml(title)}</div>`;
}

/** Super-admin notices — Simplyapp amber accent (shared shell). */
function goldEmailLayout(subtitle, innerContent, section = 'User management') {
  const footerBlockHtml = `
    <div style="border-top:1px solid #fde68a;margin-top:24px;padding-top:20px;">
      <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#b45309;">Monitoring team</p>
      <p style="margin:0;font-size:13px;color:#64748b;">For further inquiries: <a href="mailto:vincent@thinkersafrika.co.za" style="color:#d97706;text-decoration:none;">vincent@thinkersafrika.co.za</a></p>
    </div>`;
  return simplyappDocumentTable({
    documentTitle: `${section} — ${subtitle}`,
    preheader: `${section} · ${subtitle}`,
    accent: 'amber',
    variant: 'light',
    heroLine1: section,
    heroLine2: subtitle,
    bodyInnerHtml: innerContent,
    footerBlockHtml,
  });
}

/** New user created: notify super admin (gold template). */
export function newUserCreatedHtml({ createdByName, userEmail, userFullName, userRole, tenantName, appUrl }) {
  const firstParagraph = `<p style="margin: 0 0 16px 0; font-size: 15px; color: #334155; line-height: 1.5;">A new user has been created${createdByName ? ` by <strong>${escapeHtml(createdByName)}</strong>` : ''}.</p>`;
  const rows = [
    ['Email', userEmail],
    ['Full name', userFullName || '—'],
    ['Role', userRole || '—'],
    ['Tenant', tenantName || '—'],
  ];
  const content = `
    ${firstParagraph}
    ${goldSectionBar('User details')}
    ${goldKeyValueTable(rows)}
    <p style="margin: 16px 0 0;"><a href="${escapeHtml((appUrl || '') + '/users')}" style="color: #d97706; font-weight: 600; text-decoration: none;">View in User management →</a></p>
  `;
  return goldEmailLayout('New user created', content);
}

/** New tenant created: notify super admin (gold template). */
export function newTenantCreatedHtml({ createdByName, tenantName, tenantSlug, tenantPlan, appUrl }) {
  const firstParagraph = `<p style="margin: 0 0 16px 0; font-size: 15px; color: #334155; line-height: 1.5;">A new tenant has been created${createdByName ? ` by <strong>${escapeHtml(createdByName)}</strong>` : ''}.</p>`;
  const rows = [
    ['Name', tenantName],
    ['Slug', tenantSlug || '—'],
    ['Plan', tenantPlan || '—'],
  ];
  const content = `
    ${firstParagraph}
    ${goldSectionBar('Tenant details')}
    ${goldKeyValueTable(rows)}
    <p style="margin: 16px 0 0;"><a href="${escapeHtml((appUrl || '') + '/tenants')}" style="color: #d97706; font-weight: 600; text-decoration: none;">View in Tenants →</a></p>
  `;
  return goldEmailLayout('New tenant created', content, 'Tenant management');
}

/** Password reset: link + code (red task-style template). */
export function passwordResetHtml({ resetLink, code, appUrl }) {
  const firstParagraph = `<p style="margin: 0 0 16px 0; font-size: 15px; color: #334155; line-height: 1.5;">You requested a password reset. Use the link below and enter this code when prompted:</p>`;
  const content = `
    ${firstParagraph}
    ${taskSectionBar('Reset code')}
    <p style="margin: 0 0 16px 0; font-size: 20px; font-weight: 700; letter-spacing: 0.2em; color: #1e40af; font-family: monospace;">${escapeHtml(code)}</p>
    <p style="margin: 16px 0 0; font-size: 14px; color: #64748b;">This code expires in 1 hour. If you did not request this, you can ignore this email.</p>
    <p style="margin: 16px 0 0;"><a href="${escapeHtml(resetLink)}" style="color: #dc2626; font-weight: 600; text-decoration: none;">Reset password →</a></p>
  `;
  return taskEmailLayout('Password reset', content);
}

/** Shift report override request: Access Management receives code to give to requester (red template). */
export function shiftReportOverrideRequestHtml({ requesterName, requesterEmail, reportRoute, reportDate, code, appUrl }) {
  const firstParagraph = `<p style="margin: 0 0 16px 0; font-size: 15px; color: #334155; line-height: 1.5;">A shift report approver has requested an <strong>override code</strong> to change their approval decision. Please provide the code below to the requester.</p>`;
  const rows = [
    ['Requester', [requesterName, requesterEmail].filter(Boolean).join(' · ') || '—'],
    ['Shift report', [reportRoute, reportDate].filter(Boolean).join(' — ') || '—'],
  ];
  const content = `
    ${firstParagraph}
    ${taskSectionBar('Override request')}
    ${taskKeyValueTable(rows)}
    <p style="margin: 12px 0 4px; font-size: 12px; font-weight: 600; color: #64748b;">OVERRIDE CODE (share with requester)</p>
    <p style="margin: 0 0 16px; font-size: 22px; font-weight: 700; color: #b91c1c; font-family: monospace; white-space: nowrap;">${escapeHtml(code)}</p>
    <p style="margin: 16px 0 0; font-size: 14px; color: #64748b;">Share this code with <strong>${escapeHtml(requesterName || requesterEmail || 'the requester')}</strong> so they can complete their action in Command Centre → Requests.</p>
    <p style="margin: 16px 0 0;"><a href="${escapeHtml((appUrl || '') + '/command-centre')}" style="color: #dc2626; font-weight: 600; text-decoration: none;">Command Centre →</a></p>
  `;
  return taskEmailLayout('Override code requested', content, 'Command Centre');
}

/** Override code sent to the requester so they receive it directly (red template). */
export function shiftReportOverrideCodeToRequesterHtml({ reportRoute, reportDate, code, appUrl }) {
  const firstParagraph = `<p style="margin: 0 0 16px 0; font-size: 15px; color: #334155; line-height: 1.5;">You requested an <strong>override code</strong> to change your approval decision on a shift report. Use the code below in Command Centre → Requests.</p>`;
  const rows = [
    ['Shift report', [reportRoute, reportDate].filter(Boolean).join(' — ') || '—'],
  ];
  const content = `
    ${firstParagraph}
    ${taskSectionBar('Your override code')}
    ${taskKeyValueTable(rows)}
    <p style="margin: 12px 0 4px; font-size: 12px; font-weight: 600; color: #64748b;">OVERRIDE CODE</p>
    <p style="margin: 0 0 16px; font-size: 22px; font-weight: 700; color: #b91c1c; font-family: monospace; white-space: nowrap;">${escapeHtml(code)}</p>
    <p style="margin: 16px 0 0; font-size: 14px; color: #64748b;">Enter the six digits (numbers only) in the override field, then choose Approve, Reject, or Provisional approval.</p>
    <p style="margin: 16px 0 0;"><a href="${escapeHtml((appUrl || '') + '/command-centre')}" style="color: #dc2626; font-weight: 600; text-decoration: none;">Command Centre →</a></p>
  `;
  return taskEmailLayout('Your override code', content, 'Command Centre');
}

/** Account approved: login details (same style as forgot password). */
export function accountApprovedHtml({ loginUrl, email, temporaryPassword, appUrl }) {
  const firstParagraph = `<p style="margin: 0 0 16px 0; font-size: 15px; color: #334155; line-height: 1.5;">Your sign-up request has been approved. You can now sign in with the details below. Please change your password after your first login.</p>`;
  const rows = [
    ['Email (username)', email || ''],
    ['Temporary password', temporaryPassword || ''],
  ];
  const content = `
    ${firstParagraph}
    ${taskSectionBar('Login details')}
    ${taskKeyValueTable(rows)}
    <p style="margin: 16px 0 0;"><a href="${escapeHtml(loginUrl || (appUrl || '') + '/login')}" style="color: #dc2626; font-weight: 600; text-decoration: none;">Sign in →</a></p>
  `;
  return taskEmailLayout('Account approved', content);
}

/** Safe format for report date (ISO date string or Date) – never show "Invalid Date". */
function formatReportDate(value) {
  if (value == null || value === '') return '—';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '—';
    return value.toLocaleDateString(undefined, { dateStyle: 'long' });
  }
  const s = String(value).trim();
  if (!s) return '—';
  const d = s.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T12:00:00') : new Date(s);
  if (Number.isNaN(d.getTime())) return s; // fallback to raw string
  return d.toLocaleDateString(undefined, { dateStyle: 'long' });
}

/** Progress report shared via email: report title, date, sender, custom message, PDF attached. */
export function progressReportSharedHtml({ reportTitle, reportDate, reportingStatus, senderName, message, appUrl }) {
  const dateStr = formatReportDate(reportDate);
  const base = (appUrl || defaultAppUrlForEmail() || '').trim().replace(/\/$/, '');
  const rectorHref = base ? `${base}/rector` : '';
  const intro = `<p style="margin: 0 0 16px 0; font-size: 15px; color: #334155; line-height: 1.6;">${senderName ? `<strong>${escapeHtml(senderName)}</strong> has shared a progress report with you.` : 'A progress report has been shared with you.'}</p>`;
  const customMsg = message && String(message).trim()
    ? `<div style="margin: 0 0 16px 0; padding: 12px 16px; background: #f8fafc; border-left: 4px solid #0ea5e9; border-radius: 0 6px 6px 0;"><p style="margin: 0; font-size: 14px; color: #475569; line-height: 1.5; white-space: pre-wrap;">${escapeHtml(message)}</p></div>`
    : '';
  const openLink = rectorHref
    ? `<a href="${escapeHtml(rectorHref)}" style="color: #dc2626; font-weight: 600; text-decoration: none;">Open Progress reports in Simplyapp →</a>`
    : '<span style="color:#64748b;font-size:14px;">Open Progress reports in Simplyapp from your usual app link.</span>';
  const content = `
    ${intro}
    ${customMsg}
    ${taskSectionBar('Report details')}
    ${taskKeyValueTable([
      ['Report title', reportTitle || 'Progress report'],
      ['Report date', dateStr],
      ...(reportingStatus ? [['Reporting status', reportingStatus]] : []),
    ])}
    <p style="margin: 16px 0 0; font-size: 14px; color: #64748b;">The full report is attached as a PDF. You can also view it in the app.</p>
    <p style="margin: 16px 0 0;">${openLink}</p>
  `;
  return taskEmailLayout('Progress report shared', content, 'Progress reports');
}

/** Action plan shared via email: plan title, project name, document date, sender, custom message, PDF attached. */
export function actionPlanSharedHtml({ planTitle, projectName, documentDate, documentId, senderName, message, appUrl }) {
  const dateStr = formatReportDate(documentDate);
  const base = (appUrl || defaultAppUrlForEmail() || '').trim().replace(/\/$/, '');
  const rectorHref = base ? `${base}/rector` : '';
  const intro = `<p style="margin: 0 0 16px 0; font-size: 15px; color: #334155; line-height: 1.6;">${senderName ? `<strong>${escapeHtml(senderName)}</strong> has shared an action plan with you.` : 'An action plan has been shared with you.'}</p>`;
  const customMsg = message && String(message).trim()
    ? `<div style="margin: 0 0 16px 0; padding: 12px 16px; background: #f8fafc; border-left: 4px solid #0ea5e9; border-radius: 0 6px 6px 0;"><p style="margin: 0; font-size: 14px; color: #475569; line-height: 1.5; white-space: pre-wrap;">${escapeHtml(message)}</p></div>`
    : '';
  const details = [
    ['Title', planTitle || 'Action Plan'],
    ['Project', projectName || '—'],
    ['Document date', dateStr],
    ...(documentId ? [['Document ID', documentId]] : []),
  ];
  const openLink = rectorHref
    ? `<a href="${escapeHtml(rectorHref)}" style="color: #dc2626; font-weight: 600; text-decoration: none;">Open Action plans in Simplyapp →</a>`
    : '<span style="color:#64748b;font-size:14px;">Open Action plans in Simplyapp from your usual app link.</span>';
  const content = `
    ${intro}
    ${customMsg}
    ${taskSectionBar('Action plan details')}
    ${taskKeyValueTable(details)}
    <p style="margin: 16px 0 0; font-size: 14px; color: #64748b;">The full action plan is attached as a PDF. You can also view it in the app under View Project timelines and action plan.</p>
    <p style="margin: 16px 0 0;">${openLink}</p>
  `;
  return taskEmailLayout('Action plan shared', content, 'Action plans');
}

// ——— Recruitment emails (Simplyapp shell + branded callouts) ———

/** Panel member added: invite to Recruitment Panel. */
export function recruitmentPanelInviteHtml(fullName) {
  const name = escapeHtml(fullName || 'Panel member');
  const content = `
    ${recruitmentBadge('Recruitment')}
    <h1 style="margin:0 0 16px;font-size:22px;color:#0f172a;font-weight:700;">You're on the panel</h1>
    <p style="margin:0 0 16px;">Hello ${name},</p>
    <p style="margin:0 0 16px;">You have been added to the <strong>Recruitment Panel</strong>. You can now participate in interview grading and evaluations from the Recruitment section of the app.</p>
    <p style="margin:24px 0 0;padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #0284c7;border-radius:0 10px 10px 0;color:#334155;font-size:14px;line-height:1.55;">Log in to Simplyapp and go to <strong>Recruitment → Panel</strong> to view and grade candidates.</p>
    <p style="margin:20px 0 0;color:#64748b;font-size:14px;">Best regards,<br/>Recruitment Team</p>
  `;
  return wrap(content, 'Added to Recruitment Panel', { charcoal: false });
}

/** Interview invite to applicant. */
export function recruitmentInterviewInviteHtml({ name, vacancyTitle, interviewDate, interviewLocation, interviewNotes }) {
  const n = escapeHtml(name || 'Applicant');
  const role = escapeHtml(vacancyTitle || 'the role');
  const parts = [];
  if (interviewDate) parts.push(`<strong>Date & time:</strong> ${escapeHtml(interviewDate)}`);
  if (interviewLocation) parts.push(`<strong>Location:</strong> ${escapeHtml(interviewLocation)}`);
  const detailsBlock = parts.length ? `<div style="margin:16px 0;padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #0284c7;border-radius:0 10px 10px 0;color:#334155;line-height:1.55;">${parts.join('<br/>')}</div>` : '';
  const notesBlock = (interviewNotes && String(interviewNotes).trim()) ? `<p style="margin:16px 0 0;">${escapeHtml(String(interviewNotes).trim())}</p>` : '';
  const content = `
    ${recruitmentBadge('Interview invitation')}
    <h1 style="margin:0 0 16px;font-size:22px;color:#0f172a;font-weight:700;">You're invited for an interview</h1>
    <p style="margin:0 0 16px;">Hello ${n},</p>
    <p style="margin:0 0 16px;">You are invited for an interview for the position: <strong>${role}</strong>.</p>
    ${detailsBlock}
    ${notesBlock}
    <p style="margin:24px 0 0;color:#64748b;font-size:14px;">Best regards,<br/>Recruitment Team</p>
  `;
  return wrap(content, 'Interview invitation', { charcoal: false });
}

/** Panel reminder: interview scheduled – please show up for this applicant's interview. */
export function recruitmentPanelInterviewReminderHtml({ applicantName, vacancyTitle, interviewDate, interviewLocation, interviewNotes }) {
  const name = escapeHtml(applicantName || 'Applicant');
  const role = escapeHtml(vacancyTitle || 'the role');
  const parts = [];
  if (interviewDate) parts.push(`<strong>Date & time:</strong> ${escapeHtml(interviewDate)}`);
  if (interviewLocation) parts.push(`<strong>Location:</strong> ${escapeHtml(interviewLocation)}`);
  const detailsBlock = parts.length ? `<div style="margin:16px 0;padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #0284c7;border-radius:0 10px 10px 0;color:#334155;line-height:1.55;">${parts.join('<br/>')}</div>` : '';
  const notesBlock = (interviewNotes && String(interviewNotes).trim()) ? `<p style="margin:16px 0 0;">${escapeHtml(String(interviewNotes).trim())}</p>` : '';
  const content = `
    ${recruitmentBadge('Panel reminder')}
    <h1 style="margin:0 0 16px;font-size:22px;color:#0f172a;font-weight:700;">Interview scheduled – your presence requested</h1>
    <p style="margin:0 0 16px;">You are requested to attend the interview for <strong>${name}</strong> (position: <strong>${role}</strong>).</p>
    ${detailsBlock}
    ${notesBlock}
    <p style="margin:24px 0 0;color:#64748b;font-size:14px;">Please log in to Simplyapp → Recruitment → Panel to grade this candidate after the interview.</p>
    <p style="margin:12px 0 0;color:#64748b;font-size:14px;">Best regards,<br/>Recruitment Team</p>
  `;
  return wrap(content, 'Panel – interview scheduled', { charcoal: false });
}

/** Screening regret (not moving forward). */
export function recruitmentScreeningRegretHtml({ name, vacancyTitle }) {
  const n = escapeHtml(name || 'Applicant');
  const role = escapeHtml(vacancyTitle || 'the role');
  const content = `
    ${recruitmentBadge('Application update')}
    <h1 style="margin:0 0 16px;font-size:22px;color:#0f172a;font-weight:700;">Update on your application</h1>
    <p style="margin:0 0 16px;">Hello ${n},</p>
    <p style="margin:0 0 16px;">Thank you for your interest in the position: <strong>${role}</strong>. After careful consideration, we have decided to move forward with other candidates at this time.</p>
    <p style="margin:16px 0 0;color:#475569;">We encourage you to apply again in the future. We wish you the best in your job search.</p>
    <p style="margin:24px 0 0;color:#64748b;font-size:14px;">Best regards,<br/>Recruitment Team</p>
  `;
  return wrap(content, 'Application update', { charcoal: false });
}

/** Appointment: congratulations / offer. */
export function recruitmentCongratulationsHtml({ name, vacancyTitle }) {
  const n = escapeHtml(name || 'Candidate');
  const role = escapeHtml(vacancyTitle || 'the role');
  const content = `
    ${recruitmentBadge('Congratulations')}
    <h1 style="margin:0 0 16px;font-size:22px;color:#0f172a;font-weight:700;">We'd like to offer you the position</h1>
    <p style="margin:0 0 16px;">Hello ${n},</p>
    <p style="margin:0 0 16px;">Congratulations! We are pleased to offer you the position of <strong>${role}</strong>.</p>
    <p style="margin:16px 0 0;padding:16px;background:#ecfdf5;border:1px solid #a7f3d0;border-left:4px solid #059669;border-radius:0 10px 10px 0;color:#065f46;line-height:1.55;">Please respond to this email to accept the offer. We look forward to having you on the team.</p>
    <p style="margin:24px 0 0;color:#64748b;font-size:14px;">Best regards,<br/>Recruitment Team</p>
  `;
  return wrap(content, 'Job offer', { charcoal: false });
}

/** Appointment: regret (offer went to another candidate). */
export function recruitmentAppointmentRegretHtml({ name, vacancyTitle }) {
  const n = escapeHtml(name || 'Candidate');
  const role = escapeHtml(vacancyTitle || 'the role');
  const content = `
    ${recruitmentBadge('Application update')}
    <h1 style="margin:0 0 16px;font-size:22px;color:#0f172a;font-weight:700;">Update on your application</h1>
    <p style="margin:0 0 16px;">Hello ${n},</p>
    <p style="margin:0 0 16px;">Thank you for your interest and for participating in our process for <strong>${role}</strong>. After careful consideration, we have decided to offer the position to another candidate.</p>
    <p style="margin:16px 0 0;color:#475569;">We wish you the best in your job search.</p>
    <p style="margin:24px 0 0;color:#64748b;font-size:14px;">Best regards,<br/>Recruitment Team</p>
  `;
  return wrap(content, 'Application update', { charcoal: false });
}

/** Shift clock: break overrun or 12h shift threshold — matches task / schedule red gradient layout. */
export function shiftClockAlertHtml({ title, body }) {
  const inner = `<p style="margin: 0 0 16px 0; font-size: 15px; color: #334155; line-height: 1.5;">${escapeHtml(body)}</p>`;
  return taskEmailLayout(title || 'Shift clock alert', inner, 'Shift clock');
}

/** Employee requested override while away from clock-in GPS anchor — code for management to relay (one-time). */
export function shiftLocationAuthRequestHtml({ employeeName, motivation, actionLabel, code, expiresMinutes }) {
  const name = escapeHtml(employeeName || 'Employee');
  const mot = escapeHtml(motivation || '');
  const act = escapeHtml(actionLabel || 'Shift action');
  const c = escapeHtml(String(code || ''));
  const inner = `
    <p style="margin: 0 0 12px 0; font-size: 15px; color: #334155;">An employee is signing a shift action from a different location than their clock-in point and has asked for authorization.</p>
    <p style="margin: 0 0 8px 0; font-size: 14px; color: #475569;"><strong>Employee:</strong> ${name}</p>
    <p style="margin: 0 0 8px 0; font-size: 14px; color: #475569;"><strong>Requested action:</strong> ${act}</p>
    <p style="margin: 0 0 16px 0; font-size: 14px; color: #475569;"><strong>Motivation:</strong><br/>${mot.replace(/\n/g, '<br/>')}</p>
    <div style="background: #fef3c7; border: 1px solid #fcd34d; border-radius: 10px; padding: 16px 20px; text-align: center; margin: 20px 0;">
      <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: 600; color: #92400e; text-transform: uppercase; letter-spacing: 0.06em;">One-time authorization code</p>
      <p style="margin: 0; font-size: 28px; font-weight: 700; letter-spacing: 0.2em; color: #78350f; font-family: ui-monospace, monospace;">${c}</p>
      <p style="margin: 10px 0 0 0; font-size: 12px; color: #a16207;">Valid about ${expiresMinutes || 30} minutes. Share only if you approve this exception.</p>
    </div>
    <p style="margin: 0; font-size: 13px; color: #64748b;">The employee enters this code in the app to complete the action once. Each new request sends a new code.</p>
  `;
  return taskEmailLayout('Shift location authorization', inner, 'Shift clock');
}

/** Access management – list distribution (single combined attachment). */
export function distributionListEmailHtml(listLabel, routeLabel) {
  const inner = `
    <p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.5;">Please find attached the <strong>${escapeHtml(listLabel)}</strong>${escapeHtml(routeLabel)}.</p>
    <p style="margin:0;font-size:14px;color:#64748b;">Generated from Simplyapp Access management.</p>`;
  const footerBlockHtml = `
    <div style="border-top:1px solid #e2e8f0;margin-top:24px;padding-top:20px;">
      <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#0f172a;">Monitoring team</p>
      <p style="margin:0;font-size:13px;color:#64748b;">For further inquiries: <a href="mailto:vincent@thinkersafrika.co.za" style="color:#0369a1;text-decoration:none;">vincent@thinkersafrika.co.za</a></p>
    </div>`;
  return simplyappDocumentTable({
    documentTitle: 'List distribution – Simplyapp',
    preheader: `Attached ${listLabel}${routeLabel}`,
    accent: 'brand',
    variant: 'light',
    heroLine1: 'Access management',
    heroLine2: 'List distribution',
    bodyInnerHtml: inner,
    footerBlockHtml,
  });
}

/** Per-contractor list attachments – same Simplyapp shell as bulk distribution. */
export function distributionListEmailHtmlPerContractor(entries, titleOverride = null) {
  const title = titleOverride && String(titleOverride).trim() ? String(titleOverride).trim() : 'Simplyapp';
  const listItems = entries.map((e) => `${escapeHtml(e.contractorName)} – ${escapeHtml(e.routeName)}`).join('</li><li>');
  const inner = `
    <p style="margin:0 0 12px;font-size:15px;color:#334155;line-height:1.5;">Please find attached the following lists (one per company enrolled on this route):</p>
    <ul style="margin:0 0 24px;padding-left:20px;font-size:14px;color:#334155;line-height:1.6;"><li>${listItems}</li></ul>
    <p style="margin:0;font-size:14px;color:#64748b;">File names: Route name, Company name, Date and time.</p>`;
  const footerBlockHtml = `
    <div style="border-top:1px solid #e2e8f0;margin-top:24px;padding-top:20px;">
      <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#0f172a;">Monitoring team</p>
      <p style="margin:0;font-size:13px;color:#64748b;">For further inquiries: <a href="mailto:vincent@thinkersafrika.co.za" style="color:#0369a1;text-decoration:none;">vincent@thinkersafrika.co.za</a></p>
    </div>`;
  return simplyappDocumentTable({
    documentTitle: `${title} – List distribution`,
    preheader: 'Per-company fleet / driver lists attached',
    accent: 'brand',
    variant: 'light',
    heroLine1: title,
    heroLine2: 'List distribution (per company)',
    bodyInnerHtml: inner,
    footerBlockHtml,
  });
}
