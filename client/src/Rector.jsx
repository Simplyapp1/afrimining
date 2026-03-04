import { useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { contractor as contractorApi, commandCentre as ccApi, tenants as tenantsApi } from './api';
import { generateShiftReportPdf } from './lib/shiftReportPdf.js';
import { generateInvestigationReportPdf } from './lib/investigationReportPdf.js';
import { jsPDF } from 'jspdf';

const TABS = [
  { id: 'fleet', label: 'Approved fleet & drivers', icon: 'truck', section: 'Data' },
  { id: 'contractors-details', label: 'Contractors details and features', icon: 'building', section: 'Data' },
  { id: 'incidents', label: 'Breakdowns & incidents', icon: 'alert', section: 'Data' },
  { id: 'suspensions', label: 'Suspensions', icon: 'ban', section: 'Data' },
  { id: 'compliance', label: 'Compliance inspections', icon: 'shield', section: 'Data' },
  { id: 'shift-reports', label: 'Shift reports', icon: 'file', section: 'Reports' },
  { id: 'investigation-reports', label: 'Investigation reports', icon: 'search', section: 'Reports' },
];
const SECTIONS = [...new Set(TABS.map((t) => t.section))];
const INCIDENT_TYPES = ['breakdown', 'accident', 'load_spill', 'delay', 'other'];

function TabIcon({ name, className }) {
  const c = className || 'w-5 h-5';
  const path = (d) => <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={d} />;
  switch (name) {
    case 'truck':
      return <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor">{path('M8 17h8m0 0a2 2 0 104 0 2 2 0 00-4 0m-4 0a2 2 0 104 0 2 2 0 00-4 0m0-6h.01M12 16h.01M5 8h14l1.921 2.876c.075.113.129.24.16.373a2 2 0 01-.16 1.751L20 14v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2l-.921-1.376a2 2 0 01-.16-1.751 1.006 1.006 0 01.16-.373L5 8z')}</svg>;
    case 'alert':
      return <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor">{path('M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z')}</svg>;
    case 'ban':
      return <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor">{path('M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636')}</svg>;
    case 'shield':
      return <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor">{path('M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z')}</svg>;
    case 'file':
      return <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor">{path('M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z')}</svg>;
    case 'search':
      return <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor">{path('M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z')}</svg>;
    case 'building':
      return <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor">{path('M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4')}</svg>;
    default:
      return <span className={c} />;
  }
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, { dateStyle: 'short' });
}
function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

export default function Rector() {
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState('fleet');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [contextError, setContextError] = useState(null);

  // Fleet: full trucks/drivers approved + not suspended
  const [trucks, setTrucks] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [approvedTruckIds, setApprovedTruckIds] = useState(new Set());
  const [approvedDriverIds, setApprovedDriverIds] = useState(new Set());
  const [suspensions, setSuspensions] = useState([]);
  const [fleetFilterRoute, setFleetFilterRoute] = useState('');
  const [fleetSearch, setFleetSearch] = useState('');
  const [routes, setRoutes] = useState([]);
  const [routeEnrollments, setRouteEnrollments] = useState({}); // routeId -> { trucks: [], drivers: [] }

  // Incidents
  const [incidents, setIncidents] = useState([]);
  const [incidentFilters, setIncidentFilters] = useState({ dateFrom: '', dateTo: '', type: '', resolved: '' });
  const [incidentDetail, setIncidentDetail] = useState(null);
  const [incidentDetailId, setIncidentDetailId] = useState(null);

  // Suspensions
  const [suspensionsList, setSuspensionsList] = useState([]);
  const [suspensionFilters, setSuspensionFilters] = useState({ entity_type: '', status: '' });

  // Compliance
  const [complianceRecords, setComplianceRecords] = useState([]);
  const [complianceFilters, setComplianceFilters] = useState({ status: '' });
  const [complianceDetail, setComplianceDetail] = useState(null);

  // Library (shift + investigation reports)
  const [shiftReports, setShiftReports] = useState([]);
  const [investigationReports, setInvestigationReports] = useState([]);
  const [librarySearch, setLibrarySearch] = useState('');
  const [shiftReportTypeFilter, setShiftReportTypeFilter] = useState('');
  const [pdfDownloading, setPdfDownloading] = useState(null);

  // Contractors details and features (per route)
  const [contractorInfo, setContractorInfo] = useState(null);
  const [contractorSubcontractors, setContractorSubcontractors] = useState([]);
  const [contractorsDetailsLoading, setContractorsDetailsLoading] = useState(false);
  const [contractorsDetailSearch, setContractorsDetailSearch] = useState('');
  const [contractorsDetailTypeFilter, setContractorsDetailTypeFilter] = useState('all'); // 'all' | 'contractor' | 'subcontractors' | 'routes'
  const [contractorsDetailSelected, setContractorsDetailSelected] = useState(null); // { type, data }

  const hasTenant = user?.tenant_id;

  // Rector route assignment: when set, user only sees data for these routes
  const [rectorRouteIds, setRectorRouteIds] = useState([]);

  // Load rector my routes first (to know if we're route-scoped)
  useEffect(() => {
    if (!hasTenant) return;
    let cancelled = false;
    contractorApi.rectorMyRoutes()
      .then((r) => { if (!cancelled) setRectorRouteIds(r.routeIds || []); })
      .catch(() => { if (!cancelled) setRectorRouteIds([]); });
    return () => { cancelled = true; };
  }, [hasTenant]);

  // Load context and base data
  useEffect(() => {
    if (!hasTenant) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    contractorApi.context().catch((e) => {
      if (e?.message?.includes('tenant') || e?.message?.includes('403')) setContextError('Your account is not linked to a company.');
      throw e;
    }).then(() => {
      if (cancelled) return;
      return Promise.all([
        contractorApi.trucks.list().then((r) => r.trucks || []),
        contractorApi.drivers.list().then((r) => r.drivers || []),
        contractorApi.enrollment.approvedTrucks().then((r) => r.trucks || []),
        contractorApi.enrollment.approvedDrivers().then((r) => r.drivers || []),
        contractorApi.suspensions.list().then((r) => r.suspensions || []),
        contractorApi.routes.list().then((r) => r.routes || []),
      ]);
    }).then((result) => {
      if (cancelled || !result) return;
      const [trucksList, driversList, approvedTrucks, approvedDrivers, suspList, routesList] = result;
      setTrucks(trucksList);
      setDrivers(driversList);
      setApprovedTruckIds(new Set((approvedTrucks || []).map((t) => t.id)));
      setApprovedDriverIds(new Set((approvedDrivers || []).map((d) => d.id)));
      setSuspensions(suspList || []);
      setRoutes(routesList || []);
    }).catch((e) => { if (!cancelled) setError(e?.message || 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [hasTenant]);

  // Route enrollments for fleet filter
  useEffect(() => {
    if (!hasTenant || routes.length === 0) return;
    let cancelled = false;
    const load = async () => {
      const next = {};
      for (const r of routes) {
        try {
          const data = await contractorApi.routes.get(r.id);
          if (!cancelled) next[r.id] = { trucks: data.trucks || [], drivers: data.drivers || [] };
        } catch (_) {}
      }
      if (!cancelled) setRouteEnrollments((prev) => ({ ...prev, ...next }));
    };
    load();
    return () => { cancelled = true; };
  }, [hasTenant, routes]);

  // Incidents with filters
  useEffect(() => {
    if (!hasTenant || activeTab !== 'incidents') return;
    let cancelled = false;
    const params = {};
    if (incidentFilters.dateFrom) params.dateFrom = incidentFilters.dateFrom;
    if (incidentFilters.dateTo) params.dateTo = incidentFilters.dateTo;
    if (incidentFilters.type) params.type = incidentFilters.type;
    if (incidentFilters.resolved !== '') params.resolved = incidentFilters.resolved;
    contractorApi.incidents.list(params)
      .then((r) => { if (!cancelled) setIncidents(r.incidents || []); })
      .catch(() => { if (!cancelled) setIncidents([]); });
    return () => { cancelled = true; };
  }, [hasTenant, activeTab, incidentFilters.dateFrom, incidentFilters.dateTo, incidentFilters.type, incidentFilters.resolved]);

  // Incident detail
  useEffect(() => {
    if (!incidentDetailId) { setIncidentDetail(null); return; }
    let cancelled = false;
    contractorApi.incidents.get(incidentDetailId)
      .then((r) => { if (!cancelled) setIncidentDetail(r.incident); })
      .catch(() => { if (!cancelled) setIncidentDetail(null); });
    return () => { cancelled = true; };
  }, [incidentDetailId]);

  // Suspensions with filters
  useEffect(() => {
    if (!hasTenant || activeTab !== 'suspensions') return;
    let cancelled = false;
    const params = {};
    if (suspensionFilters.entity_type) params.entity_type = suspensionFilters.entity_type;
    if (suspensionFilters.status) params.status = suspensionFilters.status;
    contractorApi.suspensions.list(params)
      .then((r) => { if (!cancelled) setSuspensionsList(r.suspensions || []); })
      .catch(() => { if (!cancelled) setSuspensionsList([]); });
    return () => { cancelled = true; };
  }, [hasTenant, activeTab, suspensionFilters.entity_type, suspensionFilters.status]);

  // Compliance with filters
  useEffect(() => {
    if (!hasTenant || activeTab !== 'compliance') return;
    let cancelled = false;
    const params = {};
    if (complianceFilters.status) params.status = complianceFilters.status;
    contractorApi.complianceRecords.list(params)
      .then((r) => { if (!cancelled) setComplianceRecords(r.records || []); })
      .catch(() => { if (!cancelled) setComplianceRecords([]); });
    return () => { cancelled = true; };
  }, [hasTenant, activeTab, complianceFilters.status]);

  // Compliance detail
  useEffect(() => {
    if (!complianceDetail?.id) return;
    let cancelled = false;
    contractorApi.complianceRecords.get(complianceDetail.id)
      .then((r) => { if (!cancelled) setComplianceDetail(r.record); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [complianceDetail?.id]);

  // Contractors details and features: load contractor info + subcontractors when tab is active
  useEffect(() => {
    if (!hasTenant || activeTab !== 'contractors-details') return;
    let cancelled = false;
    setContractorsDetailsLoading(true);
    Promise.all([
      contractorApi.info.get().then((r) => r?.info ?? null),
      contractorApi.subcontractors.list().then((r) => r?.subcontractors ?? []),
    ])
      .then(([info, subs]) => {
        if (!cancelled) {
          setContractorInfo(info);
          setContractorSubcontractors(subs);
        }
      })
      .catch(() => { if (!cancelled) setContractorInfo(null); setContractorSubcontractors([]); })
      .finally(() => { if (!cancelled) setContractorsDetailsLoading(false); });
    return () => { cancelled = true; };
  }, [hasTenant, activeTab]);

  // Library (shift + investigation reports) - command centre library
  useEffect(() => {
    if (!hasTenant || (activeTab !== 'shift-reports' && activeTab !== 'investigation-reports')) return;
    let cancelled = false;
    ccApi.library()
      .then((r) => {
        if (!cancelled) {
          setShiftReports(r.shiftReports || []);
          setInvestigationReports(r.investigationReports || []);
        }
      })
      .catch(() => { if (!cancelled) setShiftReports([]); setInvestigationReports([]); });
    return () => { cancelled = true; };
  }, [hasTenant, activeTab]);

  const suspendedTruckIds = new Set((suspensions || []).filter((s) => String(s.entity_type).toLowerCase() === 'truck').map((s) => String(s.entity_id)));
  const suspendedDriverIds = new Set((suspensions || []).filter((s) => String(s.entity_type).toLowerCase() === 'driver').map((s) => String(s.entity_id)));
  let approvedTrucksFull = trucks.filter((t) => approvedTruckIds.has(t.id) && !suspendedTruckIds.has(String(t.id)));
  let approvedDriversFull = drivers.filter((d) => approvedDriverIds.has(d.id) && !suspendedDriverIds.has(String(d.id)));

  // When user is assigned as rector to specific routes, only show those routes and fleet enrolled on them
  const isRectorScoped = rectorRouteIds.length > 0;
  const routesToShow = isRectorScoped ? routes.filter((r) => rectorRouteIds.includes(r.id)) : routes;
  let rectorRouteTruckIds = new Set();
  let rectorRouteDriverIds = new Set();
  if (isRectorScoped) {
    rectorRouteIds.forEach((rid) => {
      const enroll = routeEnrollments[rid];
      (enroll?.trucks || []).forEach((t) => rectorRouteTruckIds.add(t.truck_id));
      (enroll?.drivers || []).forEach((d) => rectorRouteDriverIds.add(d.driver_id));
    });
    approvedTrucksFull = approvedTrucksFull.filter((t) => rectorRouteTruckIds.has(t.id));
    approvedDriversFull = approvedDriversFull.filter((d) => rectorRouteDriverIds.has(d.id));
  }
  const incidentsToShow = isRectorScoped
    ? incidents.filter((i) => rectorRouteTruckIds.has(i.truck_id) || rectorRouteDriverIds.has(i.driver_id))
    : incidents;
  const suspensionsToShow = isRectorScoped
    ? suspensionsList.filter((s) => {
        const id = s.entity_id;
        if (String(s.entity_type).toLowerCase() === 'truck') return rectorRouteTruckIds.has(id);
        if (String(s.entity_type).toLowerCase() === 'driver') return rectorRouteDriverIds.has(id);
        return false;
      })
    : suspensionsList;
  const complianceToShow = isRectorScoped
    ? complianceRecords.filter((c) => rectorRouteTruckIds.has(c.truck_id) || rectorRouteDriverIds.has(c.driver_id))
    : complianceRecords;

  let fleetTrucks = approvedTrucksFull;
  let fleetDrivers = approvedDriversFull;
  if (fleetFilterRoute) {
    const enroll = routeEnrollments[fleetFilterRoute];
    if (enroll) {
      const routeTruckIds = new Set((enroll.trucks || []).map((t) => t.truck_id));
      const routeDriverIds = new Set((enroll.drivers || []).map((d) => d.driver_id));
      fleetTrucks = approvedTrucksFull.filter((t) => routeTruckIds.has(t.id));
      fleetDrivers = approvedDriversFull.filter((d) => routeDriverIds.has(d.id));
    }
  }
  const fleetFilterRouteOptions = routesToShow;
  if (fleetSearch.trim()) {
    const q = fleetSearch.trim().toLowerCase();
    fleetTrucks = fleetTrucks.filter((t) =>
      [t.registration, t.make_model, t.fleet_no, t.main_contractor, t.sub_contractor].some((v) => v && String(v).toLowerCase().includes(q))
    );
    fleetDrivers = fleetDrivers.filter((d) =>
      [d.full_name, d.license_number, d.phone, d.id_number].some((v) => v && String(v).toLowerCase().includes(q))
    );
  }

  const downloadFleetPdf = () => {
    setPdfDownloading('fleet');
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    let y = 20;
    doc.setFontSize(16);
    doc.text('Approved Fleet & Drivers', 20, y);
    y += 10;
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()} | Company: ${user?.tenant_name || '—'}`, 20, y);
    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.text('Trucks', 20, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    const truckCols = ['Registration', 'Make/Model', 'Fleet No', 'Trailer 1', 'Trailer 2'];
    doc.text(truckCols.join(' | '), 20, y);
    y += 5;
    fleetTrucks.slice(0, 50).forEach((t) => {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.text([t.registration || '—', t.make_model || '—', t.fleet_no || '—', t.trailer_1_reg_no || '—', t.trailer_2_reg_no || '—'].join(' | '), 20, y);
      y += 5;
    });
    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.text('Drivers', 20, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.text('Name | License | Phone | ID Number', 20, y);
    y += 5;
    fleetDrivers.slice(0, 50).forEach((d) => {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.text([d.full_name || '—', d.license_number || '—', d.phone || '—', d.id_number || '—'].join(' | '), 20, y);
      y += 5;
    });
    doc.save('rector-approved-fleet-drivers.pdf');
    setPdfDownloading(null);
  };

  const downloadIncidentsPdf = () => {
    setPdfDownloading('incidents');
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    let y = 20;
    doc.setFontSize(16);
    doc.text('Breakdowns & Incidents', 20, y);
    y += 10;
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 20, y);
    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.text('Ref | Type | Title | Reported | Resolved', 20, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    incidentsToShow.slice(0, 80).forEach((i) => {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.text(`${i.id || '—'} | ${i.type || '—'} | ${(i.title || '—').slice(0, 25)} | ${formatDate(i.reported_at)} | ${i.resolved_at ? formatDate(i.resolved_at) : 'Open'}`, 20, y);
      y += 5;
    });
    doc.save('rector-incidents.pdf');
    setPdfDownloading(null);
  };

  const downloadSuspensionsPdf = () => {
    setPdfDownloading('suspensions');
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    let y = 20;
    doc.setFontSize(16);
    doc.text('Suspensions', 20, y);
    y += 10;
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 20, y);
    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.text('Entity | Type | Status | Reason | Created', 20, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    suspensionsToShow.slice(0, 80).forEach((s) => {
      if (y > 270) { doc.addPage(); y = 20; }
      const reason = (s.reason || '—').slice(0, 40);
      doc.text(`${s.entity_id || '—'} | ${s.entity_type || '—'} | ${s.status || '—'} | ${reason} | ${formatDate(s.created_at)}`, 20, y);
      y += 5;
    });
    doc.save('rector-suspensions.pdf');
    setPdfDownloading(null);
  };

  const downloadCompliancePdf = () => {
    setPdfDownloading('compliance');
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    let y = 20;
    doc.setFontSize(16);
    doc.text('Compliance Inspections', 20, y);
    y += 10;
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 20, y);
    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.text('Truck | Driver | Status | Response due', 20, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    complianceToShow.slice(0, 80).forEach((c) => {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.text(`${c.truckRegistration || '—'} | ${c.driverName || '—'} | ${c.status || '—'} | ${formatDateTime(c.responseDueAt)}`, 20, y);
      y += 5;
    });
    doc.save('rector-compliance-inspections.pdf');
    setPdfDownloading(null);
  };

  const downloadShiftReportPdf = (report) => {
    setPdfDownloading(report.id);
    const run = (logoDataUrl) => {
      try {
        const doc = generateShiftReportPdf(report, logoDataUrl ? { logoDataUrl } : {});
        doc.save(`shift-report-${report.id || 'download'}.pdf`);
      } catch (e) { setError(e?.message || 'PDF failed'); }
      setPdfDownloading(null);
    };
    if (user?.tenant_id) {
      fetch(tenantsApi.logoUrl(user.tenant_id), { credentials: 'include' })
        .then((r) => (r.ok ? r.blob() : null))
        .then((blob) => {
          if (!blob) { run(null); return; }
          const reader = new FileReader();
          reader.onload = () => run(reader.result);
          reader.onerror = () => run(null);
          reader.readAsDataURL(blob);
        })
        .catch(() => run(null));
    } else run(null);
  };

  const downloadInvestigationReportPdf = (report) => {
    setPdfDownloading(report.id);
    try {
      const doc = generateInvestigationReportPdf(report);
      doc.save(`investigation-report-${report.case_number || report.id || 'download'}.pdf`);
    } catch (e) { setError(e?.message || 'PDF failed'); }
    setPdfDownloading(null);
  };

  const filteredShiftReports = shiftReports.filter((r) => {
    if (librarySearch.trim()) {
      const q = librarySearch.trim().toLowerCase();
      if (![r.route, r.controller1_name, r.controller2_name].some((v) => v && String(v).toLowerCase().includes(q))) return false;
    }
    if (shiftReportTypeFilter === 'approved') return r.status === 'approved';
    if (shiftReportTypeFilter === 'draft') return r.status === 'draft';
    return true;
  });
  const filteredInvReports = investigationReports.filter((r) => {
    if (librarySearch.trim()) {
      const q = librarySearch.trim().toLowerCase();
      if (![r.case_number, r.type, r.investigator_name].some((v) => v && String(v).toLowerCase().includes(q))) return false;
    }
    return true;
  });

  if (authLoading) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <p className="text-surface-500">Loading…</p>
      </div>
    );
  }

  if (!hasTenant) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
          <h2 className="font-semibold text-lg">Rector</h2>
          <p className="mt-2 text-sm">{contextError || 'Your account is not linked to a company. Rector view is available only for users linked to a company.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-0 min-h-[calc(100vh-8rem)]">
      <nav className="w-72 shrink-0 border-r border-surface-200 bg-white flex flex-col" aria-label="Rector">
        <div className="p-4 border-b border-surface-100">
          <h2 className="text-sm font-semibold text-surface-900">Rector</h2>
          <p className="text-xs text-surface-500 mt-0.5">Fleet, incidents & reports</p>
          <p className="text-xs text-surface-500 mt-1.5">Data for <strong className="text-surface-700">{user?.tenant_name || 'your company'}</strong></p>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {SECTIONS.map((section) => (
            <div key={section} className="mb-4">
              <p className="px-4 py-1.5 text-xs font-medium text-surface-400 uppercase tracking-wider">{section}</p>
              <ul className="space-y-0.5">
                {TABS.filter((t) => t.section === section).map((tab) => (
                  <li key={tab.id}>
                    <button
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors rounded-none min-w-0 ${
                        activeTab === tab.id
                          ? 'bg-brand-50 text-brand-700 border-l-2 border-l-brand-500 font-medium'
                          : 'text-surface-600 hover:bg-surface-50 hover:text-surface-900 border-l-2 border-l-transparent'
                      }`}
                    >
                      <TabIcon name={tab.icon} className="w-5 h-5 shrink-0 text-inherit opacity-90" />
                      <span className="min-w-0 break-words">{tab.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      <div className="flex-1 min-w-0 overflow-auto p-4 sm:p-6">
        <div className="w-full max-w-7xl mx-auto">
          {error && (
            <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2 flex justify-between items-center">
              {error}
              <button type="button" onClick={() => setError('')}>Dismiss</button>
            </div>
          )}

          {isRectorScoped && (
            <div className="mb-4 text-sm text-brand-700 bg-brand-50 border border-brand-100 rounded-lg px-4 py-2">
              You are viewing data for your assigned route(s) only.
            </div>
          )}

          {activeTab === 'fleet' && (
            <div>
              <div className="flex flex-wrap items-center gap-4 mb-4">
                <h3 className="text-lg font-semibold text-surface-900">Approved fleet & drivers</h3>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    placeholder="Search fleet or drivers…"
                    value={fleetSearch}
                    onChange={(e) => setFleetSearch(e.target.value)}
                    className="rounded-lg border border-surface-200 px-3 py-1.5 text-sm"
                  />
                  <select
                    value={fleetFilterRoute}
                    onChange={(e) => setFleetFilterRoute(e.target.value)}
                    className="rounded-lg border border-surface-200 px-3 py-1.5 text-sm"
                  >
                    <option value="">All routes</option>
                    {fleetFilterRouteOptions.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={downloadFleetPdf}
                    disabled={pdfDownloading === 'fleet'}
                    className="rounded-lg bg-brand-600 text-white px-3 py-1.5 text-sm hover:bg-brand-700 disabled:opacity-50"
                  >
                    {pdfDownloading === 'fleet' ? 'Generating…' : 'Download PDF'}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="rounded-xl border border-surface-200 bg-white overflow-hidden">
                  <h4 className="px-4 py-3 bg-surface-50 font-medium text-surface-800 border-b">Trucks ({fleetTrucks.length})</h4>
                  <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-surface-50 sticky top-0">
                        <tr>
                          <th className="text-left p-2">Registration</th>
                          <th className="text-left p-2">Make/Model</th>
                          <th className="text-left p-2">Fleet No</th>
                          <th className="text-left p-2">Trailers</th>
                          <th className="text-left p-2">Capacity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fleetTrucks.map((t) => (
                          <tr key={t.id} className="border-t border-surface-100 hover:bg-surface-50">
                            <td className="p-2 font-medium">{t.registration || '—'}</td>
                            <td className="p-2">{t.make_model || '—'}</td>
                            <td className="p-2">{t.fleet_no || '—'}</td>
                            <td className="p-2">{(t.trailer_1_reg_no || '') + (t.trailer_2_reg_no ? ` / ${t.trailer_2_reg_no}` : '') || '—'}</td>
                            <td className="p-2">{t.capacity_tonnes ?? t.capacity_tonnes ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="rounded-xl border border-surface-200 bg-white overflow-hidden">
                  <h4 className="px-4 py-3 bg-surface-50 font-medium text-surface-800 border-b">Drivers ({fleetDrivers.length})</h4>
                  <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-surface-50 sticky top-0">
                        <tr>
                          <th className="text-left p-2">Name</th>
                          <th className="text-left p-2">License</th>
                          <th className="text-left p-2">Phone</th>
                          <th className="text-left p-2">ID Number</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fleetDrivers.map((d) => (
                          <tr key={d.id} className="border-t border-surface-100 hover:bg-surface-50">
                            <td className="p-2 font-medium">{d.full_name || '—'}</td>
                            <td className="p-2">{d.license_number || '—'}</td>
                            <td className="p-2">{d.phone || '—'}</td>
                            <td className="p-2">{d.id_number || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'contractors-details' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-surface-900">Contractors details and features</h3>
                  <p className="text-sm text-surface-500">Click a row to open full details.</p>
                </div>
              </div>
              {contractorsDetailsLoading ? (
                <p className="text-surface-500">Loading…</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-3 items-center">
                    <input
                      type="text"
                      placeholder="Search company, contact, route…"
                      value={contractorsDetailSearch}
                      onChange={(e) => setContractorsDetailSearch(e.target.value)}
                      className="rounded-lg border border-surface-300 px-3 py-2 text-sm w-64 max-w-full"
                    />
                    <select
                      value={contractorsDetailTypeFilter}
                      onChange={(e) => setContractorsDetailTypeFilter(e.target.value)}
                      className="rounded-lg border border-surface-300 px-3 py-2 text-sm"
                    >
                      <option value="all">All</option>
                      <option value="contractor">Contractor</option>
                      <option value="subcontractors">Subcontractors</option>
                      <option value="routes">Routes</option>
                    </select>
                    {(contractorsDetailSearch || contractorsDetailTypeFilter !== 'all') && (
                      <button type="button" onClick={() => { setContractorsDetailSearch(''); setContractorsDetailTypeFilter('all'); }} className="text-sm text-surface-600 hover:text-surface-900">Clear filters</button>
                    )}
                  </div>
                  <div className="rounded-xl border border-surface-200 bg-white overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-surface-50 border-b border-surface-200">
                          <tr className="text-left text-surface-600">
                            <th className="p-3 font-medium">Type</th>
                            <th className="p-3 font-medium">Name / Title</th>
                            <th className="p-3 font-medium">Summary</th>
                          </tr>
                        </thead>
                        <tbody>
                          {contractorsDetailTypeFilter === 'all' || contractorsDetailTypeFilter === 'contractor' ? (
                            contractorInfo && (() => {
                              const q = (contractorsDetailSearch || '').toLowerCase();
                              const name = (contractorInfo.companyName || '').toLowerCase();
                              const admin = (contractorInfo.adminName || '').toLowerCase();
                              const cipc = (contractorInfo.cipcRegistrationNumber || '').toLowerCase();
                              if (q && !name.includes(q) && !admin.includes(q) && !cipc.includes(q)) return null;
                              return (
                                <tr
                                  key="contractor"
                                  onClick={() => setContractorsDetailSelected({ type: 'contractor', data: contractorInfo })}
                                  className="border-b border-surface-100 hover:bg-brand-50 cursor-pointer"
                                >
                                  <td className="p-3"><span className="px-2 py-0.5 rounded text-xs font-medium bg-surface-200 text-surface-700">Contractor</span></td>
                                  <td className="p-3 font-medium">{contractorInfo.companyName || '—'}</td>
                                  <td className="p-3 text-surface-600">CIPC {contractorInfo.cipcRegistrationNumber || '—'} · Admin {contractorInfo.adminName || '—'}</td>
                                </tr>
                              );
                            })()
                          ) : null}
                          {(contractorsDetailTypeFilter === 'all' || contractorsDetailTypeFilter === 'subcontractors') && contractorSubcontractors
                            .filter((s) => {
                              const q = (contractorsDetailSearch || '').toLowerCase();
                              if (!q) return true;
                              const company = (s.company_name || '').toLowerCase();
                              const contact = (s.contact_person || '').toLowerCase();
                              return company.includes(q) || contact.includes(q);
                            })
                            .map((s) => (
                              <tr
                                key={s.id}
                                onClick={() => setContractorsDetailSelected({ type: 'subcontractor', data: s })}
                                className="border-b border-surface-100 hover:bg-brand-50 cursor-pointer"
                              >
                                <td className="p-3"><span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">Subcontractor</span></td>
                                <td className="p-3 font-medium">{s.company_name || '—'}</td>
                                <td className="p-3 text-surface-600">{s.contact_person || '—'} {s.contact_phone ? ` · ${s.contact_phone}` : ''}</td>
                              </tr>
                            ))}
                          {(contractorsDetailTypeFilter === 'all' || contractorsDetailTypeFilter === 'routes') && routesToShow
                            .filter((r) => {
                              const q = (contractorsDetailSearch || '').toLowerCase();
                              if (!q) return true;
                              return (r.name || '').toLowerCase().includes(q);
                            })
                            .map((r) => {
                              const enroll = routeEnrollments[r.id];
                              const truckCount = (enroll?.trucks || []).length;
                              const driverCount = (enroll?.drivers || []).length;
                              return (
                                <tr
                                  key={r.id}
                                  onClick={() => setContractorsDetailSelected({ type: 'route', data: { ...r, enroll } })}
                                  className="border-b border-surface-100 hover:bg-brand-50 cursor-pointer"
                                >
                                  <td className="p-3"><span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800">Route</span></td>
                                  <td className="p-3 font-medium">{r.name || 'Unnamed route'}</td>
                                  <td className="p-3 text-surface-600">{truckCount} truck(s) · {driverCount} driver(s)</td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  {contractorsDetailSelected && (
                    <div className="fixed inset-0 z-50 flex justify-end">
                      <div className="absolute inset-0 bg-black/30" onClick={() => setContractorsDetailSelected(null)} aria-hidden />
                      <div className="relative w-full max-w-lg bg-white shadow-xl overflow-y-auto flex flex-col max-h-full">
                        <div className="sticky top-0 px-4 py-3 border-b border-surface-200 bg-white flex items-center justify-between">
                          <h4 className="font-semibold text-surface-900">
                            {contractorsDetailSelected.type === 'contractor' && 'Contractor details'}
                            {contractorsDetailSelected.type === 'subcontractor' && 'Subcontractor details'}
                            {contractorsDetailSelected.type === 'route' && 'Route details'}
                          </h4>
                          <button type="button" onClick={() => setContractorsDetailSelected(null)} className="p-2 text-surface-500 hover:text-surface-800 rounded">✕</button>
                        </div>
                        <div className="p-4 text-sm space-y-4">
                          {contractorsDetailSelected.type === 'contractor' && contractorsDetailSelected.data && (
                            <div className="grid gap-3">
                              <div><span className="text-surface-500 block text-xs">Company</span><p className="font-medium">{contractorsDetailSelected.data.companyName || '—'}</p></div>
                              <div><span className="text-surface-500 block text-xs">CIPC number</span><p className="font-medium">{contractorsDetailSelected.data.cipcRegistrationNumber || '—'}</p></div>
                              <div><span className="text-surface-500 block text-xs">CIPC date</span><p className="font-medium">{contractorsDetailSelected.data.cipcRegistrationDate ? formatDate(contractorsDetailSelected.data.cipcRegistrationDate) : '—'}</p></div>
                              <div><span className="text-surface-500 block text-xs">Administrator</span><p className="font-medium">{contractorsDetailSelected.data.adminName || '—'}</p><p className="text-surface-600">{contractorsDetailSelected.data.adminEmail || ''} {contractorsDetailSelected.data.adminPhone ? ` · ${contractorsDetailSelected.data.adminPhone}` : ''}</p></div>
                              <div><span className="text-surface-500 block text-xs">Control room</span><p className="font-medium">{contractorsDetailSelected.data.controlRoomContact || '—'}</p><p className="text-surface-600">{contractorsDetailSelected.data.controlRoomPhone || ''} {contractorsDetailSelected.data.controlRoomEmail ? ` · ${contractorsDetailSelected.data.controlRoomEmail}` : ''}</p></div>
                              <div><span className="text-surface-500 block text-xs">Mechanic</span><p className="font-medium">{contractorsDetailSelected.data.mechanicName || '—'}</p><p className="text-surface-600">{contractorsDetailSelected.data.mechanicPhone || ''} {contractorsDetailSelected.data.mechanicEmail ? ` · ${contractorsDetailSelected.data.mechanicEmail}` : ''}</p></div>
                              <div><span className="text-surface-500 block text-xs">Emergency 1</span><p className="font-medium">{contractorsDetailSelected.data.emergencyContact1Name || '—'} {contractorsDetailSelected.data.emergencyContact1Phone ? ` · ${contractorsDetailSelected.data.emergencyContact1Phone}` : ''}</p></div>
                              <div><span className="text-surface-500 block text-xs">Emergency 2</span><p className="font-medium">{contractorsDetailSelected.data.emergencyContact2Name || '—'} {contractorsDetailSelected.data.emergencyContact2Phone ? ` · ${contractorsDetailSelected.data.emergencyContact2Phone}` : ''}</p></div>
                              <div><span className="text-surface-500 block text-xs">Emergency 3</span><p className="font-medium">{contractorsDetailSelected.data.emergencyContact3Name || '—'} {contractorsDetailSelected.data.emergencyContact3Phone ? ` · ${contractorsDetailSelected.data.emergencyContact3Phone}` : ''}</p></div>
                            </div>
                          )}
                          {contractorsDetailSelected.type === 'subcontractor' && contractorsDetailSelected.data && (
                            <div className="grid gap-3">
                              <div><span className="text-surface-500 block text-xs">Company</span><p className="font-medium">{contractorsDetailSelected.data.company_name || '—'}</p></div>
                              <div><span className="text-surface-500 block text-xs">Contact person</span><p className="font-medium">{contractorsDetailSelected.data.contact_person || '—'}</p><p className="text-surface-600">{contractorsDetailSelected.data.contact_phone || ''} {contractorsDetailSelected.data.contact_email ? ` · ${contractorsDetailSelected.data.contact_email}` : ''}</p></div>
                              <div><span className="text-surface-500 block text-xs">Control room</span><p className="font-medium">{contractorsDetailSelected.data.control_room_contact || '—'}</p><p className="text-surface-600">{contractorsDetailSelected.data.control_room_phone || ''}</p></div>
                              <div><span className="text-surface-500 block text-xs">Mechanic</span><p className="font-medium">{contractorsDetailSelected.data.mechanic_name || '—'}</p><p className="text-surface-600">{contractorsDetailSelected.data.mechanic_phone || ''}</p></div>
                              <div><span className="text-surface-500 block text-xs">Emergency contact</span><p className="font-medium">{contractorsDetailSelected.data.emergency_contact_name || '—'}</p><p className="text-surface-600">{contractorsDetailSelected.data.emergency_contact_phone || ''}</p></div>
                            </div>
                          )}
                          {contractorsDetailSelected.type === 'route' && contractorsDetailSelected.data && (
                            <div className="space-y-3">
                              <div><span className="text-surface-500 block text-xs">Route</span><p className="font-medium">{contractorsDetailSelected.data.name || 'Unnamed route'}</p></div>
                              <div><span className="text-surface-500 block text-xs">Enrolled</span><p className="font-medium">{(contractorsDetailSelected.data.enroll?.trucks || []).length} truck(s) · {(contractorsDetailSelected.data.enroll?.drivers || []).length} driver(s)</p></div>
                              {((contractorsDetailSelected.data.enroll?.trucks || []).length > 0 || (contractorsDetailSelected.data.enroll?.drivers || []).length > 0) && (
                                <div className="pt-2 border-t border-surface-200">
                                      <p className="text-surface-600 text-xs mb-1">Trucks: {(contractorsDetailSelected.data.enroll?.trucks || []).map((t) => t.registration || t.truck_id).filter(Boolean).join(', ') || '—'}</p>
                                      <p className="text-surface-600 text-xs">Drivers: {(contractorsDetailSelected.data.enroll?.drivers || []).map((d) => d.full_name || d.driver_id).filter(Boolean).join(', ') || '—'}</p>
                                    </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'incidents' && (
            <div>
              <div className="flex flex-wrap items-center gap-4 mb-4">
                <h3 className="text-lg font-semibold text-surface-900">Breakdowns & incidents</h3>
                <div className="flex flex-wrap gap-2 items-center">
                  <input type="date" value={incidentFilters.dateFrom} onChange={(e) => setIncidentFilters((f) => ({ ...f, dateFrom: e.target.value }))} className="rounded border px-2 py-1 text-sm" />
                  <input type="date" value={incidentFilters.dateTo} onChange={(e) => setIncidentFilters((f) => ({ ...f, dateTo: e.target.value }))} className="rounded border px-2 py-1 text-sm" />
                  <select value={incidentFilters.type} onChange={(e) => setIncidentFilters((f) => ({ ...f, type: e.target.value }))} className="rounded border px-2 py-1 text-sm">
                    <option value="">All types</option>
                    {INCIDENT_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <select value={incidentFilters.resolved} onChange={(e) => setIncidentFilters((f) => ({ ...f, resolved: e.target.value }))} className="rounded border px-2 py-1 text-sm">
                    <option value="">All</option>
                    <option value="0">Open</option>
                    <option value="1">Resolved</option>
                  </select>
                  <button type="button" onClick={downloadIncidentsPdf} disabled={pdfDownloading === 'incidents'} className="rounded-lg bg-brand-600 text-white px-3 py-1.5 text-sm hover:bg-brand-700 disabled:opacity-50">
                    {pdfDownloading === 'incidents' ? 'Generating…' : 'Download PDF'}
                  </button>
                </div>
              </div>
              <div className="flex gap-4">
                <div className={`rounded-xl border bg-white overflow-hidden flex-1 ${incidentDetailId ? 'max-w-[55%]' : ''}`}>
                  <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-surface-50 sticky top-0">
                        <tr>
                          <th className="text-left p-2">Ref</th>
                          <th className="text-left p-2">Type</th>
                          <th className="text-left p-2">Title</th>
                          <th className="text-left p-2">Reported</th>
                          <th className="text-left p-2">Resolved</th>
                        </tr>
                      </thead>
                      <tbody>
                        {incidentsToShow.map((i) => (
                          <tr
                            key={i.id}
                            className={`border-t border-surface-100 hover:bg-surface-50 cursor-pointer ${incidentDetailId === i.id ? 'bg-brand-50' : ''}`}
                            onClick={() => setIncidentDetailId(incidentDetailId === i.id ? null : i.id)}
                          >
                            <td className="p-2 font-mono text-xs">{String(i.id).slice(0, 8)}</td>
                            <td className="p-2">{i.type || '—'}</td>
                            <td className="p-2">{(i.title || '—').slice(0, 40)}</td>
                            <td className="p-2">{formatDate(i.reported_at)}</td>
                            <td className="p-2">{i.resolved_at ? formatDate(i.resolved_at) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                {incidentDetailId && (
                  <div className="rounded-xl border border-surface-200 bg-white p-4 flex-1 overflow-y-auto max-h-[500px]">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-semibold">Incident details</h4>
                      <button type="button" onClick={() => setIncidentDetailId(null)} className="text-surface-500 hover:text-surface-700">Close</button>
                    </div>
                    {incidentDetail ? (
                      <dl className="text-sm space-y-1.5">
                        <dt className="font-medium text-surface-500">ID</dt><dd className="ml-0">{incidentDetail.id}</dd>
                        <dt className="font-medium text-surface-500">Type</dt><dd>{incidentDetail.type || '—'}</dd>
                        <dt className="font-medium text-surface-500">Title</dt><dd>{incidentDetail.title || '—'}</dd>
                        <dt className="font-medium text-surface-500">Description</dt><dd>{incidentDetail.description || '—'}</dd>
                        <dt className="font-medium text-surface-500">Severity</dt><dd>{incidentDetail.severity || '—'}</dd>
                        <dt className="font-medium text-surface-500">Actions taken</dt><dd>{incidentDetail.actions_taken || '—'}</dd>
                        <dt className="font-medium text-surface-500">Reported at</dt><dd>{formatDateTime(incidentDetail.reported_at)}</dd>
                        <dt className="font-medium text-surface-500">Resolved at</dt><dd>{incidentDetail.resolved_at ? formatDateTime(incidentDetail.resolved_at) : '—'}</dd>
                        <dt className="font-medium text-surface-500">Resolution note</dt><dd>{incidentDetail.resolution_note || '—'}</dd>
                      </dl>
                    ) : (
                      <p className="text-surface-500">Loading…</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'suspensions' && (
            <div>
              <div className="flex flex-wrap items-center gap-4 mb-4">
                <h3 className="text-lg font-semibold text-surface-900">Suspensions</h3>
                <div className="flex flex-wrap gap-2">
                  <select value={suspensionFilters.entity_type} onChange={(e) => setSuspensionFilters((f) => ({ ...f, entity_type: e.target.value }))} className="rounded border px-2 py-1 text-sm">
                    <option value="">All entities</option>
                    <option value="truck">Truck</option>
                    <option value="driver">Driver</option>
                    <option value="compliance_inspection">Compliance</option>
                  </select>
                  <select value={suspensionFilters.status} onChange={(e) => setSuspensionFilters((f) => ({ ...f, status: e.target.value }))} className="rounded border px-2 py-1 text-sm">
                    <option value="">All statuses</option>
                    <option value="suspended">Suspended</option>
                    <option value="under_appeal">Under appeal</option>
                    <option value="reversed">Reversed</option>
                  </select>
                  <button type="button" onClick={downloadSuspensionsPdf} disabled={pdfDownloading === 'suspensions'} className="rounded-lg bg-brand-600 text-white px-3 py-1.5 text-sm hover:bg-brand-700 disabled:opacity-50">
                    {pdfDownloading === 'suspensions' ? 'Generating…' : 'Download PDF'}
                  </button>
                </div>
              </div>
              <div className="rounded-xl border border-surface-200 bg-white overflow-hidden">
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-50 sticky top-0">
                      <tr>
                        <th className="text-left p-2">Entity ID</th>
                        <th className="text-left p-2">Type</th>
                        <th className="text-left p-2">Status</th>
                        <th className="text-left p-2">Reason</th>
                        <th className="text-left p-2">Created</th>
                        <th className="text-left p-2">Ends</th>
                      </tr>
                    </thead>
                    <tbody>
                      {suspensionsToShow.map((s) => (
                        <tr key={s.id} className="border-t border-surface-100 hover:bg-surface-50">
                          <td className="p-2 font-medium">{s.entity_id || '—'}</td>
                          <td className="p-2">{s.entity_type || '—'}</td>
                          <td className="p-2">{s.status || '—'}</td>
                          <td className="p-2 max-w-xs truncate" title={s.reason}>{(s.reason || '—').slice(0, 60)}</td>
                          <td className="p-2">{formatDate(s.created_at)}</td>
                          <td className="p-2">{s.suspension_ends_at ? formatDate(s.suspension_ends_at) : (s.is_permanent ? 'Permanent' : '—')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'compliance' && (
            <div>
              <div className="flex flex-wrap items-center gap-4 mb-4">
                <h3 className="text-lg font-semibold text-surface-900">Compliance inspections</h3>
                <div className="flex flex-wrap gap-2">
                  <select value={complianceFilters.status} onChange={(e) => setComplianceFilters((f) => ({ ...f, status: e.target.value }))} className="rounded border px-2 py-1 text-sm">
                    <option value="">All statuses</option>
                    <option value="pending_response">Pending response</option>
                    <option value="responded">Responded</option>
                    <option value="auto_suspended">Auto suspended</option>
                  </select>
                  <button type="button" onClick={downloadCompliancePdf} disabled={pdfDownloading === 'compliance'} className="rounded-lg bg-brand-600 text-white px-3 py-1.5 text-sm hover:bg-brand-700 disabled:opacity-50">
                    {pdfDownloading === 'compliance' ? 'Generating…' : 'Download PDF'}
                  </button>
                </div>
              </div>
              <div className="rounded-xl border border-surface-200 bg-white overflow-hidden">
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-50 sticky top-0">
                      <tr>
                        <th className="text-left p-2">Truck</th>
                        <th className="text-left p-2">Driver</th>
                        <th className="text-left p-2">Status</th>
                        <th className="text-left p-2">Response due</th>
                        <th className="text-left p-2">Responded at</th>
                      </tr>
                    </thead>
                    <tbody>
                      {complianceToShow.map((c) => (
                        <tr
                          key={c.id}
                          className="border-t border-surface-100 hover:bg-surface-50 cursor-pointer"
                          onClick={() => setComplianceDetail(c)}
                        >
                          <td className="p-2">{c.truckRegistration || '—'}</td>
                          <td className="p-2">{c.driverName || '—'}</td>
                          <td className="p-2">{c.status || '—'}</td>
                          <td className="p-2">{formatDateTime(c.responseDueAt)}</td>
                          <td className="p-2">{c.contractorRespondedAt ? formatDateTime(c.contractorRespondedAt) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {complianceDetail && (
                <div className="mt-4 rounded-xl border border-surface-200 bg-white p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-semibold">Inspection details</h4>
                    <button type="button" onClick={() => setComplianceDetail(null)} className="text-surface-500 hover:text-surface-700">Close</button>
                  </div>
                  <dl className="text-sm grid grid-cols-2 gap-x-4 gap-y-1.5">
                    <dt className="text-surface-500">Truck</dt><dd>{complianceDetail.truckRegistration || '—'}</dd>
                    <dt className="text-surface-500">Driver</dt><dd>{complianceDetail.driverName || '—'}</dd>
                    <dt className="text-surface-500">Status</dt><dd>{complianceDetail.status || '—'}</dd>
                    <dt className="text-surface-500">Response due</dt><dd>{formatDateTime(complianceDetail.responseDueAt)}</dd>
                    <dt className="text-surface-500">Contractor response</dt><dd className="col-span-2">{complianceDetail.contractorResponseText || '—'}</dd>
                    {complianceDetail.suspension && (
                      <>
                        <dt className="text-surface-500">Suspension status</dt><dd>{complianceDetail.suspension.status}</dd>
                        <dt className="text-surface-500">Appeal notes</dt><dd>{complianceDetail.suspension.appeal_notes || '—'}</dd>
                      </>
                    )}
                  </dl>
                </div>
              )}
            </div>
          )}

          {activeTab === 'shift-reports' && (
            <div>
              <div className="flex flex-wrap items-center gap-4 mb-4">
                <h3 className="text-lg font-semibold text-surface-900">Shift reports</h3>
                <input
                  type="text"
                  placeholder="Search route or controller…"
                  value={librarySearch}
                  onChange={(e) => setLibrarySearch(e.target.value)}
                  className="rounded-lg border border-surface-200 px-3 py-1.5 text-sm"
                />
                <select value={shiftReportTypeFilter} onChange={(e) => setShiftReportTypeFilter(e.target.value)} className="rounded border px-2 py-1 text-sm">
                  <option value="">All</option>
                  <option value="approved">Approved only</option>
                  <option value="draft">Draft</option>
                </select>
              </div>
              <div className="rounded-xl border border-surface-200 bg-white overflow-hidden">
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-50 sticky top-0">
                      <tr>
                        <th className="text-left p-2">Route</th>
                        <th className="text-left p-2">Report date</th>
                        <th className="text-left p-2">Controller 1</th>
                        <th className="text-left p-2">Status</th>
                        <th className="text-left p-2">Approved</th>
                        <th className="text-left p-2">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredShiftReports.map((r) => (
                        <tr key={r.id} className="border-t border-surface-100 hover:bg-surface-50">
                          <td className="p-2">{r.route || '—'}</td>
                          <td className="p-2">{formatDate(r.report_date || r.shift_date)}</td>
                          <td className="p-2">{r.controller1_name || '—'}</td>
                          <td className="p-2">{r.status || '—'}</td>
                          <td className="p-2">{r.approved_at ? formatDate(r.approved_at) : '—'}</td>
                          <td className="p-2">
                            <button
                              type="button"
                              onClick={() => downloadShiftReportPdf(r)}
                              disabled={pdfDownloading === r.id}
                              className="text-brand-600 hover:text-brand-700 text-sm"
                            >
                              {pdfDownloading === r.id ? 'Generating…' : 'Download PDF'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'investigation-reports' && (
            <div>
              <div className="flex flex-wrap items-center gap-4 mb-4">
                <h3 className="text-lg font-semibold text-surface-900">Investigation reports</h3>
                <input
                  type="text"
                  placeholder="Search case number or investigator…"
                  value={librarySearch}
                  onChange={(e) => setLibrarySearch(e.target.value)}
                  className="rounded-lg border border-surface-200 px-3 py-1.5 text-sm"
                />
              </div>
              <div className="rounded-xl border border-surface-200 bg-white overflow-hidden">
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-50 sticky top-0">
                      <tr>
                        <th className="text-left p-2">Case number</th>
                        <th className="text-left p-2">Type</th>
                        <th className="text-left p-2">Date occurred</th>
                        <th className="text-left p-2">Investigator</th>
                        <th className="text-left p-2">Status</th>
                        <th className="text-left p-2">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInvReports.map((r) => (
                        <tr key={r.id} className="border-t border-surface-100 hover:bg-surface-50">
                          <td className="p-2 font-medium">{r.case_number || '—'}</td>
                          <td className="p-2">{r.type || '—'}</td>
                          <td className="p-2">{formatDate(r.date_occurred)}</td>
                          <td className="p-2">{r.investigator_name || '—'}</td>
                          <td className="p-2">{r.status || '—'}</td>
                          <td className="p-2">
                            <button
                              type="button"
                              onClick={() => downloadInvestigationReportPdf(r)}
                              disabled={pdfDownloading === r.id}
                              className="text-brand-600 hover:text-brand-700 text-sm"
                            >
                              {pdfDownloading === r.id ? 'Generating…' : 'Download PDF'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
