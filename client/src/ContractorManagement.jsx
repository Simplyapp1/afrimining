import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useSecondaryNavHidden } from './lib/useSecondaryNavHidden.js';
import { contractor as contractorApi, openAttachmentWithAuth, downloadAttachmentWithAuth } from './api';
import InfoHint from './components/InfoHint.jsx';

const NAV_SECTIONS = [
  {
    section: 'Contractor',
    items: [
      { id: 'register', label: 'Register company', icon: 'building' },
      { id: 'firm-profile', label: 'Firm profile', icon: 'profile' },
      { id: 'expiries', label: 'Contract & licence expiry', icon: 'calendar' },
      { id: 'documents', label: 'Document library', icon: 'folder' },
      { id: 'subcontractors', label: 'Subcontractors & partners', icon: 'users' },
    ],
  },
];

function TabIcon({ name, className }) {
  const c = className || 'w-5 h-5';
  switch (name) {
    case 'building':
      return (
        <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 4h1m-1 4h1m4-4h1" />
        </svg>
      );
    case 'profile':
      return (
        <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      );
    case 'calendar':
      return (
        <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    case 'folder':
      return (
        <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      );
    case 'users':
      return (
        <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      );
    default:
      return <span className={c} />;
  }
}

function field(row, snake) {
  if (!row) return undefined;
  const k = Object.keys(row).find((x) => x && String(x).toLowerCase() === snake.toLowerCase());
  return k != null ? row[k] : undefined;
}

function inputClass() {
  return 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 outline-none';
}

function btnPrimary() {
  return 'inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50';
}

function btnSecondary() {
  return 'inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50';
}

function btnDanger() {
  return 'inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 hover:bg-red-100';
}

const DOC_LABELS = {
  operating_licence: 'Operating licence',
  insurance: 'Insurance',
  cipc_certificate: 'CIPC / company registration',
  tax_clearance: 'Tax clearance',
  safety_certificate: 'Safety / OHS certificate',
  vehicle_registrations: 'Vehicle registrations',
  driver_licences: 'Driver licences',
  contracts: 'Contracts & agreements',
  permits: 'Permits',
  other: 'Other',
};

const EXPIRY_TYPE_OPTIONS = [
  { value: 'contract', label: 'Main contract' },
  { value: 'insurance', label: 'Insurance policy' },
  { value: 'professional_indemnity', label: 'Professional indemnity' },
  { value: 'coc', label: 'Certificate of compliance (CoC)' },
  { value: 'building_plan', label: 'Building plan approval' },
  { value: 'environmental', label: 'Environmental authorisation' },
  { value: 'mining_right', label: 'Mining / prospecting right' },
  { value: 'safety_file', label: 'Safety file / appointment' },
  { value: 'license', label: 'Licence (general)' },
  { value: 'other', label: 'Other' },
];

const SECTOR_OPTIONS = [
  '',
  'Civil engineering',
  'Structural / building',
  'Mining services',
  'Electrical & instrumentation',
  'Mechanical & plant',
  'Earthworks & roads',
  'Environmental & rehabilitation',
  'Other',
];

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d - today) / (24 * 60 * 60 * 1000));
}

function expiryBadge(days) {
  if (days == null) return { cls: 'bg-slate-100 text-slate-600', label: '—' };
  if (days < 0) return { cls: 'bg-red-100 text-red-900', label: `Expired ${Math.abs(days)}d ago` };
  if (days <= 30) return { cls: 'bg-amber-100 text-amber-950', label: `${days}d left` };
  if (days <= 90) return { cls: 'bg-sky-100 text-sky-900', label: `${days}d left` };
  return { cls: 'bg-emerald-50 text-emerald-900', label: `${days}d left` };
}

/** Map GET /info (camelCase) into snake_case form state for PATCH. */
function infoToFormDraft(inf) {
  if (!inf) return {};
  const g = (a, b) => (inf[a] != null && inf[a] !== '' ? inf[a] : inf[b]) ?? '';
  return {
    company_name: g('companyName', 'company_name'),
    cipc_registration_number: g('cipcRegistrationNumber', 'cipc_registration_number'),
    cipc_registration_date: (g('cipcRegistrationDate', 'cipc_registration_date') || '').toString().slice(0, 10),
    admin_name: g('adminName', 'admin_name'),
    admin_email: g('adminEmail', 'admin_email'),
    admin_phone: g('adminPhone', 'admin_phone'),
    mechanic_name: g('mechanicName', 'mechanic_name'),
    mechanic_phone: g('mechanicPhone', 'mechanic_phone'),
    mechanic_email: g('mechanicEmail', 'mechanic_email'),
    emergency_contact_1_name: g('emergencyContact1Name', 'emergency_contact_1_name') || g('emergencyContact_1Name', ''),
    emergency_contact_1_phone: g('emergencyContact1Phone', 'emergency_contact_1_phone') || g('emergencyContact_1Phone', ''),
    emergency_contact_2_name: g('emergencyContact2Name', 'emergency_contact_2_name') || g('emergencyContact_2Name', ''),
    emergency_contact_2_phone: g('emergencyContact2Phone', 'emergency_contact_2_phone') || g('emergencyContact_2Phone', ''),
    emergency_contact_3_name: g('emergencyContact3Name', 'emergency_contact_3_name') || g('emergencyContact_3Name', ''),
    emergency_contact_3_phone: g('emergencyContact3Phone', 'emergency_contact_3_phone') || g('emergencyContact_3Phone', ''),
  };
}

const defaultCompanyForm = () => ({
  name: '',
  description: '',
  trading_name: '',
  vat_number: '',
  company_registration: '',
  website: '',
  primary_email: '',
  primary_phone: '',
  physical_address: '',
  sector: '',
  cidb_registration: '',
});

export default function ContractorManagement() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [navHidden, setNavHidden] = useSecondaryNavHidden('contractor-mgmt');

  const tabFromUrl = searchParams.get('tab');
  const firstTab = NAV_SECTIONS[0].items[0].id;
  const [activeTab, setActiveTab] = useState(
    NAV_SECTIONS[0].items.some((i) => i.id === tabFromUrl) ? tabFromUrl : firstTab
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ctx, setCtx] = useState(null);
  const [contractors, setContractors] = useState([]);
  const [infoDraft, setInfoDraft] = useState({});
  const [expiries, setExpiries] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [docTypes, setDocTypes] = useState([]);
  const [subcontractors, setSubcontractors] = useState([]);

  const [companyForm, setCompanyForm] = useState(defaultCompanyForm);
  const [savingCompany, setSavingCompany] = useState(false);
  const [editingContractor, setEditingContractor] = useState(null);

  const [savingInfo, setSavingInfo] = useState(false);

  const [expForm, setExpForm] = useState({
    item_type: 'contract',
    item_ref: '',
    issued_date: '',
    expiry_date: '',
    description: '',
  });
  const [editingExpiry, setEditingExpiry] = useState(null);

  const [libUploadType, setLibUploadType] = useState('contracts');
  const [libFile, setLibFile] = useState(null);
  const [libUploading, setLibUploading] = useState(false);

  const [subForm, setSubForm] = useState({
    company_name: '',
    contact_person: '',
    contact_phone: '',
    contact_email: '',
    mechanic_name: '',
    mechanic_phone: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
  });
  const [savingSub, setSavingSub] = useState(false);

  const setActiveTabBoth = (id) => {
    setActiveTab(id);
    setSearchParams((prev) => {
      const n = new URLSearchParams(prev);
      n.set('tab', id);
      return n;
    });
  };

  const refresh = useCallback(async () => {
    setError('');
    try {
      const [cRes, iRes, eRes, lRes, tRes, sRes] = await Promise.all([
        contractorApi.listContractors(),
        contractorApi.getInfo().catch(() => ({ info: null })),
        contractorApi.listExpiries().catch(() => ({ expiries: [] })),
        contractorApi.listLibrary().catch(() => ({ documents: [] })),
        contractorApi.libraryDocumentTypes().catch(() => ({ documentTypes: [] })),
        contractorApi.listSubcontractors().catch(() => ({ subcontractors: [] })),
      ]);
      setContractors(cRes.contractors || []);
      setInfoDraft(infoToFormDraft(iRes.info || null));
      setExpiries(eRes.expiries || []);
      setDocuments(lRes.documents || []);
      setDocTypes(tRes.documentTypes || []);
      setSubcontractors(sRes.subcontractors || []);
      try {
        setCtx(await contractorApi.context());
      } catch {
        setCtx(null);
      }
    } catch (e) {
      setError(e?.message || 'Could not load contractor data');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t && NAV_SECTIONS[0].items.some((i) => i.id === t)) setActiveTab(t);
  }, [searchParams]);

  const registerCompany = async (e) => {
    e.preventDefault();
    if (!companyForm.name.trim()) return;
    setSavingCompany(true);
    setError('');
    try {
      await contractorApi.createContractor({
        name: companyForm.name.trim(),
        description: companyForm.description.trim() || undefined,
        trading_name: companyForm.trading_name.trim() || undefined,
        vat_number: companyForm.vat_number.trim() || undefined,
        company_registration: companyForm.company_registration.trim() || undefined,
        website: companyForm.website.trim() || undefined,
        primary_email: companyForm.primary_email.trim() || undefined,
        primary_phone: companyForm.primary_phone.trim() || undefined,
        physical_address: companyForm.physical_address.trim() || undefined,
        sector: companyForm.sector.trim() || undefined,
        cidb_registration: companyForm.cidb_registration.trim() || undefined,
      });
      setCompanyForm(defaultCompanyForm());
      await refresh();
    } catch (err) {
      setError(err?.message || 'Could not register company');
    } finally {
      setSavingCompany(false);
    }
  };

  const saveContractorEdit = async () => {
    if (!editingContractor?.id) return;
    setError('');
    try {
      await contractorApi.updateContractor(editingContractor.id, {
        name: editingContractor.name?.trim(),
        description: editingContractor.description?.trim() || null,
        trading_name: editingContractor.trading_name?.trim() || null,
        vat_number: editingContractor.vat_number?.trim() || null,
        company_registration: editingContractor.company_registration?.trim() || null,
        website: editingContractor.website?.trim() || null,
        primary_email: editingContractor.primary_email?.trim() || null,
        primary_phone: editingContractor.primary_phone?.trim() || null,
        physical_address: editingContractor.physical_address?.trim() || null,
        sector: editingContractor.sector?.trim() || null,
        cidb_registration: editingContractor.cidb_registration?.trim() || null,
      });
      setEditingContractor(null);
      await refresh();
    } catch (err) {
      setError(err?.message || 'Could not save company');
    }
  };

  const saveInfo = async (e) => {
    e.preventDefault();
    setSavingInfo(true);
    setError('');
    try {
      const body = { ...infoDraft };
      Object.keys(body).forEach((k) => {
        if (body[k] === '') body[k] = null;
      });
      const res = await contractorApi.updateInfo(body);
      setInfoDraft(infoToFormDraft(res.info));
      await refresh();
    } catch (err) {
      setError(err?.message || 'Could not save firm profile');
    } finally {
      setSavingInfo(false);
    }
  };

  const addExpiry = async (e) => {
    e.preventDefault();
    if (!expForm.expiry_date) {
      setError('Expiry date is required');
      return;
    }
    setError('');
    try {
      await contractorApi.createExpiry({
        item_type: expForm.item_type,
        item_ref: expForm.item_ref.trim() || null,
        issued_date: expForm.issued_date || null,
        expiry_date: expForm.expiry_date,
        description: expForm.description.trim() || null,
      });
      setExpForm((f) => ({ ...f, item_ref: '', issued_date: '', expiry_date: '', description: '' }));
      await refresh();
    } catch (err) {
      setError(err?.message || 'Could not add expiry record');
    }
  };

  const saveExpiryEdit = async () => {
    if (!editingExpiry?.id) return;
    try {
      await contractorApi.updateExpiry(editingExpiry.id, {
        item_type: editingExpiry.item_type,
        item_ref: editingExpiry.item_ref || null,
        issued_date: editingExpiry.issued_date || null,
        expiry_date: editingExpiry.expiry_date,
        description: editingExpiry.description || null,
      });
      setEditingExpiry(null);
      await refresh();
    } catch (err) {
      setError(err?.message || 'Could not update');
    }
  };

  const uploadDoc = async (e) => {
    e.preventDefault();
    if (!libFile) return;
    setLibUploading(true);
    setError('');
    try {
      await contractorApi.uploadLibraryDocument(libFile, libUploadType);
      setLibFile(null);
      await refresh();
    } catch (err) {
      setError(err?.message || 'Upload failed');
    } finally {
      setLibUploading(false);
    }
  };

  const addSub = async (e) => {
    e.preventDefault();
    if (!subForm.company_name.trim()) {
      setError('Subcontractor company name is required');
      return;
    }
    setSavingSub(true);
    setError('');
    try {
      await contractorApi.createSubcontractor(subForm);
      setSubForm({
        company_name: '',
        contact_person: '',
        contact_phone: '',
        contact_email: '',
        mechanic_name: '',
        mechanic_phone: '',
        emergency_contact_name: '',
        emergency_contact_phone: '',
      });
      await refresh();
    } catch (err) {
      setError(err?.message || 'Could not add subcontractor');
    } finally {
      setSavingSub(false);
    }
  };

  const openEditContractor = (row) => {
    setEditingContractor({
      id: field(row, 'id'),
      name: field(row, 'name') || '',
      description: field(row, 'description') || '',
      trading_name: field(row, 'trading_name') || '',
      vat_number: field(row, 'vat_number') || '',
      company_registration: field(row, 'company_registration') || '',
      website: field(row, 'website') || '',
      primary_email: field(row, 'primary_email') || '',
      primary_phone: field(row, 'primary_phone') || '',
      physical_address: field(row, 'physical_address') || '',
      sector: field(row, 'sector') || '',
      cidb_registration: field(row, 'cidb_registration') || '',
    });
  };

  const mainContent = () => {
    if (loading) return <p className="text-slate-500">Loading…</p>;

    return (
      <>
        {error && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            <span>{error}</span>
            <button type="button" className="font-medium underline" onClick={() => setError('')}>
              Dismiss
            </button>
          </div>
        )}

        {activeTab === 'register' && (
          <div className="space-y-8">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Register a new contractor (legal entity)</h2>
              <p className="mt-1 text-sm text-slate-600">
                Capture the registered name plus a rich company profile: description, trading name, tax and registration identifiers, CIDB, sector, and
                primary contacts. Run <code className="text-xs bg-slate-100 px-1 rounded">npm run db:contractor-company-profile</code> if extended fields
                are not saved yet.
              </p>
            </div>
            <form onSubmit={registerCompany} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Legal / registered name *</label>
                  <input className={inputClass()} required value={companyForm.name} onChange={(e) => setCompanyForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Afrimining Civil (Pty) Ltd" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Contractor description</label>
                  <textarea
                    className={inputClass()}
                    rows={4}
                    value={companyForm.description}
                    onChange={(e) => setCompanyForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Scope of work, grades, typical projects, SHEQ posture, client sectors…"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Trading name (if different)</label>
                  <input className={inputClass()} value={companyForm.trading_name} onChange={(e) => setCompanyForm((f) => ({ ...f, trading_name: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Sector</label>
                  <select className={inputClass()} value={companyForm.sector} onChange={(e) => setCompanyForm((f) => ({ ...f, sector: e.target.value }))}>
                    {SECTOR_OPTIONS.map((s) => (
                      <option key={s || '—'} value={s}>
                        {s || 'Select sector…'}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Company / CIPC registration no.</label>
                  <input className={inputClass()} value={companyForm.company_registration} onChange={(e) => setCompanyForm((f) => ({ ...f, company_registration: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">VAT number</label>
                  <input className={inputClass()} value={companyForm.vat_number} onChange={(e) => setCompanyForm((f) => ({ ...f, vat_number: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">CIDB / contractor grading (optional)</label>
                  <input className={inputClass()} value={companyForm.cidb_registration} onChange={(e) => setCompanyForm((f) => ({ ...f, cidb_registration: e.target.value }))} placeholder="e.g. CRB 12345678 – 7CE" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Website</label>
                  <input type="url" className={inputClass()} value={companyForm.website} onChange={(e) => setCompanyForm((f) => ({ ...f, website: e.target.value }))} placeholder="https://…" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Primary email</label>
                  <input type="email" className={inputClass()} value={companyForm.primary_email} onChange={(e) => setCompanyForm((f) => ({ ...f, primary_email: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Primary phone</label>
                  <input className={inputClass()} value={companyForm.primary_phone} onChange={(e) => setCompanyForm((f) => ({ ...f, primary_phone: e.target.value }))} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Physical / registered address</label>
                  <textarea className={inputClass()} rows={2} value={companyForm.physical_address} onChange={(e) => setCompanyForm((f) => ({ ...f, physical_address: e.target.value }))} />
                </div>
              </div>
              <button type="submit" disabled={savingCompany} className={btnPrimary()}>
                {savingCompany ? 'Saving…' : 'Register company'}
              </button>
            </form>

            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                <h3 className="font-semibold text-slate-900">Registered companies</h3>
                <span className="text-xs text-slate-500">{contractors.length} total</span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm text-left">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Description</th>
                      <th className="px-4 py-3">Sector</th>
                      <th className="px-4 py-3 w-28">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {contractors.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                          No contractors yet.
                        </td>
                      </tr>
                    ) : (
                      contractors.map((c) => (
                        <tr key={field(c, 'id')} className="hover:bg-slate-50/80">
                          <td className="px-4 py-2 font-medium text-slate-900">{field(c, 'name')}</td>
                          <td className="px-4 py-2 text-slate-600 max-w-md line-clamp-2">{field(c, 'description') || '—'}</td>
                          <td className="px-4 py-2 text-slate-600">{field(c, 'sector') || '—'}</td>
                          <td className="px-4 py-2">
                            <button type="button" className={btnSecondary()} onClick={() => openEditContractor(c)}>
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {editingContractor && (
              <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                <button type="button" className="absolute inset-0 bg-slate-900/50" aria-label="Close" onClick={() => setEditingContractor(null)} />
                <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
                  <h3 className="font-semibold text-slate-900">Edit contractor company</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className="text-xs text-slate-500">Legal name *</label>
                      <input className={inputClass()} value={editingContractor.name} onChange={(e) => setEditingContractor((x) => ({ ...x, name: e.target.value }))} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs text-slate-500">Description</label>
                      <textarea className={inputClass()} rows={3} value={editingContractor.description} onChange={(e) => setEditingContractor((x) => ({ ...x, description: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Trading name</label>
                      <input className={inputClass()} value={editingContractor.trading_name} onChange={(e) => setEditingContractor((x) => ({ ...x, trading_name: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Sector</label>
                      <select className={inputClass()} value={editingContractor.sector} onChange={(e) => setEditingContractor((x) => ({ ...x, sector: e.target.value }))}>
                        {SECTOR_OPTIONS.map((s) => (
                          <option key={s || '—'} value={s}>
                            {s || '—'}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Company registration</label>
                      <input className={inputClass()} value={editingContractor.company_registration} onChange={(e) => setEditingContractor((x) => ({ ...x, company_registration: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">VAT</label>
                      <input className={inputClass()} value={editingContractor.vat_number} onChange={(e) => setEditingContractor((x) => ({ ...x, vat_number: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">CIDB</label>
                      <input className={inputClass()} value={editingContractor.cidb_registration} onChange={(e) => setEditingContractor((x) => ({ ...x, cidb_registration: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Website</label>
                      <input className={inputClass()} value={editingContractor.website} onChange={(e) => setEditingContractor((x) => ({ ...x, website: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Primary email</label>
                      <input className={inputClass()} value={editingContractor.primary_email} onChange={(e) => setEditingContractor((x) => ({ ...x, primary_email: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Primary phone</label>
                      <input className={inputClass()} value={editingContractor.primary_phone} onChange={(e) => setEditingContractor((x) => ({ ...x, primary_phone: e.target.value }))} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs text-slate-500">Physical address</label>
                      <textarea className={inputClass()} rows={2} value={editingContractor.physical_address} onChange={(e) => setEditingContractor((x) => ({ ...x, physical_address: e.target.value }))} />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button type="button" className={btnPrimary()} onClick={saveContractorEdit}>
                      Save
                    </button>
                    <button type="button" className={btnSecondary()} onClick={() => setEditingContractor(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'firm-profile' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Firm profile</h2>
              <p className="mt-1 text-sm text-slate-600">CIPC, principal admin, workshop contacts, and site emergency lines (stored per tenant).</p>
            </div>
            <form onSubmit={saveInfo} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Trading / registered company name</label>
                  <input className={inputClass()} value={infoDraft.company_name ?? ''} onChange={(e) => setInfoDraft((d) => ({ ...d, company_name: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">CIPC registration number</label>
                  <input className={inputClass()} value={infoDraft.cipc_registration_number ?? ''} onChange={(e) => setInfoDraft((d) => ({ ...d, cipc_registration_number: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">CIPC registration date</label>
                  <input type="date" className={inputClass()} value={(infoDraft.cipc_registration_date || '').toString().slice(0, 10)} onChange={(e) => setInfoDraft((d) => ({ ...d, cipc_registration_date: e.target.value }))} />
                </div>
                <div className="sm:col-span-2 border-t border-slate-100 pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Principal admin & SHEQ</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Admin name</label>
                      <input className={inputClass()} value={infoDraft.admin_name ?? ''} onChange={(e) => setInfoDraft((d) => ({ ...d, admin_name: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Admin email</label>
                      <input type="email" className={inputClass()} value={infoDraft.admin_email ?? ''} onChange={(e) => setInfoDraft((d) => ({ ...d, admin_email: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Admin phone</label>
                      <input className={inputClass()} value={infoDraft.admin_phone ?? ''} onChange={(e) => setInfoDraft((d) => ({ ...d, admin_phone: e.target.value }))} />
                    </div>
                  </div>
                </div>
                <div className="sm:col-span-2 border-t border-slate-100 pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Workshop / mechanic</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Mechanic name</label>
                      <input className={inputClass()} value={infoDraft.mechanic_name ?? ''} onChange={(e) => setInfoDraft((d) => ({ ...d, mechanic_name: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Mechanic phone</label>
                      <input className={inputClass()} value={infoDraft.mechanic_phone ?? ''} onChange={(e) => setInfoDraft((d) => ({ ...d, mechanic_phone: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Mechanic email</label>
                      <input type="email" className={inputClass()} value={infoDraft.mechanic_email ?? ''} onChange={(e) => setInfoDraft((d) => ({ ...d, mechanic_email: e.target.value }))} />
                    </div>
                  </div>
                </div>
                <div className="sm:col-span-2 border-t border-slate-100 pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Emergency contacts (site)</p>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {[1, 2, 3].map((n) => (
                      <div key={n} className="rounded-lg border border-slate-100 p-3 space-y-2">
                        <label className="block text-xs font-medium text-slate-500">Emergency {n} name</label>
                        <input className={inputClass()} value={infoDraft[`emergency_contact_${n}_name`] ?? ''} onChange={(e) => setInfoDraft((d) => ({ ...d, [`emergency_contact_${n}_name`]: e.target.value }))} />
                        <label className="block text-xs font-medium text-slate-500">Phone</label>
                        <input className={inputClass()} value={infoDraft[`emergency_contact_${n}_phone`] ?? ''} onChange={(e) => setInfoDraft((d) => ({ ...d, [`emergency_contact_${n}_phone`]: e.target.value }))} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <button type="submit" disabled={savingInfo} className={btnPrimary()}>
                {savingInfo ? 'Saving…' : 'Save firm profile'}
              </button>
            </form>
          </div>
        )}

        {activeTab === 'expiries' && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-slate-900">Contract & licence expiry</h2>
            <form onSubmit={addExpiry} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Type</label>
                <select className={inputClass()} value={expForm.item_type} onChange={(e) => setExpForm((f) => ({ ...f, item_type: e.target.value }))}>
                  {EXPIRY_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Reference / policy no.</label>
                <input className={inputClass()} value={expForm.item_ref} onChange={(e) => setExpForm((f) => ({ ...f, item_ref: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Issued date</label>
                <input type="date" className={inputClass()} value={expForm.issued_date} onChange={(e) => setExpForm((f) => ({ ...f, issued_date: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Expiry date *</label>
                <input type="date" className={inputClass()} required value={expForm.expiry_date} onChange={(e) => setExpForm((f) => ({ ...f, expiry_date: e.target.value }))} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
                <input className={inputClass()} value={expForm.description} onChange={(e) => setExpForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="sm:col-span-2">
                <button type="submit" className={btnPrimary()}>
                  Add expiry record
                </button>
              </div>
            </form>
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm text-left">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Reference</th>
                      <th className="px-4 py-3">Issued</th>
                      <th className="px-4 py-3">Expires</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Notes</th>
                      <th className="px-4 py-3 w-32">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {expiries.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                          No expiries yet.
                        </td>
                      </tr>
                    ) : (
                      expiries.map((row) => {
                        const id = field(row, 'id');
                        const ed = field(row, 'expiry_date');
                        const d = daysUntil(ed);
                        const badge = expiryBadge(d);
                        return (
                          <tr key={id}>
                            <td className="px-4 py-2 font-medium">{field(row, 'item_type')}</td>
                            <td className="px-4 py-2 text-slate-600">{field(row, 'item_ref') || '—'}</td>
                            <td className="px-4 py-2 tabular-nums">{field(row, 'issued_date') ? String(field(row, 'issued_date')).slice(0, 10) : '—'}</td>
                            <td className="px-4 py-2 tabular-nums">{ed ? String(ed).slice(0, 10) : '—'}</td>
                            <td className="px-4 py-2">
                              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.cls}`}>{badge.label}</span>
                            </td>
                            <td className="px-4 py-2 text-slate-600 max-w-xs truncate">{field(row, 'description') || '—'}</td>
                            <td className="px-4 py-2 flex flex-wrap gap-1">
                              <button type="button" className={btnSecondary()} onClick={() => setEditingExpiry({
                                id,
                                item_type: field(row, 'item_type'),
                                item_ref: field(row, 'item_ref') || '',
                                issued_date: field(row, 'issued_date') ? String(field(row, 'issued_date')).slice(0, 10) : '',
                                expiry_date: ed ? String(ed).slice(0, 10) : '',
                                description: field(row, 'description') || '',
                              })}>
                                Edit
                              </button>
                              <button
                                type="button"
                                className={btnDanger()}
                                onClick={async () => {
                                  if (!confirm('Delete this expiry record?')) return;
                                  try {
                                    await contractorApi.deleteExpiry(id);
                                    await refresh();
                                  } catch (err) {
                                    setError(err?.message || 'Delete failed');
                                  }
                                }}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            {editingExpiry && (
              <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                <button type="button" className="absolute inset-0 bg-slate-900/50" aria-label="Close" onClick={() => setEditingExpiry(null)} />
                <div className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-3">
                  <h3 className="font-semibold text-slate-900">Edit expiry</h3>
                  <div className="grid gap-2">
                    <select className={inputClass()} value={editingExpiry.item_type} onChange={(e) => setEditingExpiry((x) => ({ ...x, item_type: e.target.value }))}>
                      {EXPIRY_TYPE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <input className={inputClass()} value={editingExpiry.item_ref} onChange={(e) => setEditingExpiry((x) => ({ ...x, item_ref: e.target.value }))} />
                    <input type="date" className={inputClass()} value={editingExpiry.issued_date} onChange={(e) => setEditingExpiry((x) => ({ ...x, issued_date: e.target.value }))} />
                    <input type="date" className={inputClass()} value={editingExpiry.expiry_date} onChange={(e) => setEditingExpiry((x) => ({ ...x, expiry_date: e.target.value }))} />
                    <input className={inputClass()} value={editingExpiry.description} onChange={(e) => setEditingExpiry((x) => ({ ...x, description: e.target.value }))} />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button type="button" className={btnPrimary()} onClick={saveExpiryEdit}>
                      Save
                    </button>
                    <button type="button" className={btnSecondary()} onClick={() => setEditingExpiry(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'documents' && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-slate-900">Document library</h2>
            <form onSubmit={uploadDoc} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-wrap gap-3 items-end">
              <div className="min-w-[200px]">
                <label className="block text-xs font-medium text-slate-500 mb-1">Document type</label>
                <select className={inputClass()} value={libUploadType} onChange={(e) => setLibUploadType(e.target.value)}>
                  {(docTypes.length ? docTypes : Object.keys(DOC_LABELS)).map((dt) => (
                    <option key={dt} value={dt}>
                      {DOC_LABELS[dt] || dt}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">File</label>
                <input type="file" className="text-sm" onChange={(e) => setLibFile(e.target.files?.[0] || null)} />
              </div>
              <button type="submit" disabled={libUploading || !libFile} className={btnPrimary()}>
                {libUploading ? 'Uploading…' : 'Upload'}
              </button>
            </form>
            <ul className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
              {documents.length === 0 ? (
                <li className="px-6 py-8 text-center text-slate-500">No documents yet.</li>
              ) : (
                documents.map((doc) => {
                  const id = field(doc, 'id');
                  const fname = field(doc, 'file_name');
                  const dtype = field(doc, 'document_type');
                  return (
                    <li key={id} className="px-6 py-3 flex flex-wrap justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">{fname}</p>
                        <p className="text-xs text-slate-500">{DOC_LABELS[dtype] || dtype}</p>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" className={btnSecondary()} onClick={() => openAttachmentWithAuth(contractorApi.libraryDownloadUrl(id)).catch((err) => setError(err?.message))}>
                          View
                        </button>
                        <button type="button" className={btnSecondary()} onClick={() => downloadAttachmentWithAuth(contractorApi.libraryDownloadUrl(id), fname).catch((err) => setError(err?.message))}>
                          Download
                        </button>
                        <button
                          type="button"
                          className={btnDanger()}
                          onClick={async () => {
                            if (!confirm('Remove this file?')) return;
                            try {
                              await contractorApi.deleteLibraryDocument(id);
                              await refresh();
                            } catch (err) {
                              setError(err?.message || 'Delete failed');
                            }
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        )}

        {activeTab === 'subcontractors' && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-slate-900">Subcontractors & partners</h2>
            <form onSubmit={addSub} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1">Company name *</label>
                <input className={inputClass()} required value={subForm.company_name} onChange={(e) => setSubForm((s) => ({ ...s, company_name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Contact person</label>
                <input className={inputClass()} value={subForm.contact_person} onChange={(e) => setSubForm((s) => ({ ...s, contact_person: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Contact phone</label>
                <input className={inputClass()} value={subForm.contact_phone} onChange={(e) => setSubForm((s) => ({ ...s, contact_phone: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Contact email</label>
                <input type="email" className={inputClass()} value={subForm.contact_email} onChange={(e) => setSubForm((s) => ({ ...s, contact_email: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Mechanic / plant</label>
                <input className={inputClass()} value={subForm.mechanic_name} onChange={(e) => setSubForm((s) => ({ ...s, mechanic_name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Mechanic phone</label>
                <input className={inputClass()} value={subForm.mechanic_phone} onChange={(e) => setSubForm((s) => ({ ...s, mechanic_phone: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Emergency contact</label>
                <input className={inputClass()} value={subForm.emergency_contact_name} onChange={(e) => setSubForm((s) => ({ ...s, emergency_contact_name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Emergency phone</label>
                <input className={inputClass()} value={subForm.emergency_contact_phone} onChange={(e) => setSubForm((s) => ({ ...s, emergency_contact_phone: e.target.value }))} />
              </div>
              <div className="sm:col-span-2">
                <button type="submit" disabled={savingSub} className={btnPrimary()}>
                  {savingSub ? 'Saving…' : 'Add subcontractor'}
                </button>
              </div>
            </form>
            <ul className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
              {subcontractors.length === 0 ? (
                <li className="px-6 py-8 text-center text-slate-500">No subcontractors recorded.</li>
              ) : (
                subcontractors.map((s) => (
                  <li key={field(s, 'id')} className="px-6 py-4 flex flex-wrap justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{field(s, 'company_name')}</p>
                      <p className="text-sm text-slate-600">
                        {[field(s, 'contact_person'), field(s, 'contact_phone'), field(s, 'contact_email')].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={btnDanger()}
                      onClick={async () => {
                        if (!confirm('Remove this record?')) return;
                        try {
                          await contractorApi.deleteSubcontractor(field(s, 'id'));
                          await refresh();
                        } catch (err) {
                          setError(err?.message || 'Delete failed');
                        }
                      }}
                    >
                      Remove
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </>
    );
  };

  return (
    <div className="flex gap-0 w-full min-h-0 flex-1 -m-4 sm:-m-6">
      <nav
        className={`shrink-0 flex flex-col border-r border-slate-200 bg-white transition-[width] duration-200 ease-out overflow-hidden ${navHidden ? 'w-0 border-r-0' : 'w-72'}`}
        aria-label="Contractor management"
        aria-hidden={navHidden}
      >
        <div className="p-4 border-b border-slate-100 flex items-start justify-between gap-2 w-72 shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-slate-900">Contractor management</h2>
            {user?.tenant_name ? <p className="text-sm font-medium text-slate-700 mt-0.5 truncate">{user.tenant_name}</p> : null}
            <div className="mt-1 flex items-center gap-1">
              <InfoHint title="Contractor management" text="Assign the Contractor management page role in Users. Extended company fields require npm run db:contractor-company-profile." />
            </div>
          </div>
          <button
            type="button"
            onClick={() => setNavHidden(true)}
            className="shrink-0 h-8 w-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
            aria-label="Hide navigation"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2 w-72">
          {NAV_SECTIONS.map((group) => (
            <div key={group.section} className="mb-4">
              <p className="px-4 py-1.5 text-xs font-medium text-slate-400 uppercase tracking-wider">{group.section}</p>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setActiveTabBoth(item.id)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors min-w-0 ${
                        activeTab === item.id
                          ? 'bg-brand-50 text-brand-700 border-l-2 border-l-brand-500 font-medium'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border-l-2 border-l-transparent'
                      }`}
                    >
                      <TabIcon name={item.icon} className="w-5 h-5 shrink-0 opacity-90" />
                      <span className="min-w-0 break-words">{item.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      <div className="flex-1 min-w-0 overflow-auto p-4 sm:p-6 flex flex-col bg-gradient-to-b from-slate-50 to-white">
        {navHidden && (
          <button
            type="button"
            onClick={() => setNavHidden(false)}
            className="self-start flex items-center gap-2 px-3 py-2 mb-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-sm font-medium shadow-sm"
            aria-label="Show navigation"
          >
            <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            Show navigation
          </button>
        )}
        <div className="w-full max-w-5xl mx-auto flex-1">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Contractor management</h1>
            <button type="button" className={btnSecondary()} onClick={() => refresh()}>
              Refresh
            </button>
          </div>
          {ctx?.tenantName && <p className="text-xs text-slate-500 mb-4">Session tenant: {ctx.tenantName}</p>}
          {mainContent()}
        </div>
      </div>
    </div>
  );
}
