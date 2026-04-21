import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { resourcesRegister as rr, downloadAttachmentWithAuth, openAttachmentWithAuth } from './api';
import { useSecondaryNavHidden } from './lib/useSecondaryNavHidden.js';
import InfoHint from './components/InfoHint.jsx';

const MAIN_TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'assets', label: 'Assets register' },
  { id: 'inventory', label: 'Inventory register' },
];

const ASSET_TYPES = [
  { value: 'equipment', label: 'Equipment' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'building_construction', label: 'Building / construction plant' },
];

const ASSET_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'in_service', label: 'In service' },
  { value: 'standby', label: 'Standby' },
  { value: 'under_repair', label: 'Under repair' },
  { value: 'retired', label: 'Retired' },
  { value: 'disposed', label: 'Disposed' },
];

const INV_CATEGORIES = [
  { value: 'raw_materials', label: 'Raw materials' },
  { value: 'consumables', label: 'Consumables' },
  { value: 'spare_parts', label: 'Spare parts' },
  { value: 'tools', label: 'Tools' },
  { value: 'ppe', label: 'PPE' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'structural', label: 'Structural' },
  { value: 'finishes', label: 'Finishes' },
  { value: 'other', label: 'Other' },
];

const MOVEMENT_TYPES = [
  { value: 'receive', label: 'Receive (GRN)' },
  { value: 'issue', label: 'Issue / consume' },
  { value: 'adjust_in', label: 'Adjust + (stocktake)' },
  { value: 'adjust_out', label: 'Adjust − (stocktake)' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'count', label: 'Cycle count' },
];

const SERVICE_EVENT_TYPES = [
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'repair', label: 'Repair' },
  { value: 'calibration', label: 'Calibration' },
  { value: 'certification', label: 'Certification' },
  { value: 'other', label: 'Other' },
];

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, { dateStyle: 'short' });
}

function assetTypeLabel(value) {
  return ASSET_TYPES.find((t) => t.value === value)?.label || value || '—';
}

function invCategoryLabel(value) {
  return INV_CATEGORIES.find((c) => c.value === value)?.label || value || '—';
}

function inputClass() {
  return 'w-full rounded-lg border border-surface-300 bg-white dark:bg-surface-900 px-3 py-2 text-sm text-surface-900 dark:text-surface-100';
}

function btnPrimary() {
  return 'inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50';
}

function btnSecondary() {
  return 'inline-flex items-center justify-center rounded-lg border border-surface-300 bg-white px-4 py-2 text-sm font-medium text-surface-800 hover:bg-surface-50';
}

const emptyAssetForm = () => ({
  asset_type: 'equipment',
  name: '',
  asset_code: '',
  description: '',
  status: 'active',
  location_label: '',
  site_code: '',
  acquired_date: '',
  cost_value: '',
  currency_code: 'ZAR',
  supplier_name: '',
  serial_number: '',
  manufacturer: '',
  model: '',
  registration_number: '',
  vin: '',
  year_of_manufacture: '',
  odometer_km: '',
  fuel_type: '',
  insurance_policy_ref: '',
  insurance_expiry_date: '',
  license_disc_expiry_date: '',
  warranty_expiry_date: '',
  certification_name: '',
  certification_expiry_date: '',
  building_or_structure: '',
  trade_category: '',
  lifting_capacity_t: '',
  height_restriction_m: '',
  compliance_notes: '',
  maintenance_interval_days: '',
  maintenance_interval_hours: '',
  last_maintenance_date: '',
  next_maintenance_due_date: '',
  renewal_reminder_date: '',
});

const emptyInvForm = () => ({
  sku: '',
  name: '',
  description: '',
  category: 'other',
  unit: 'ea',
  quantity_on_hand: '0',
  reorder_level: '',
  economic_order_qty: '',
  storage_zone: '',
  storage_bin: '',
  default_supplier: '',
  manufacturer: '',
  part_number: '',
  hazard_class: '',
  shelf_life_days: '',
  received_date: '',
  batch_tracking: false,
  standard_unit_cost: '',
  currency_code: 'ZAR',
  expiry_date: '',
  renewal_reminder_date: '',
  maintenance_interval_days: '',
  next_review_date: '',
  notes: '',
});

export default function ResourcesRegister() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab');
  const [mainTab, setMainTab] = useState(() =>
    MAIN_TABS.some((t) => t.id === tabFromUrl) ? tabFromUrl : 'dashboard'
  );
  const [navHidden, setNavHidden] = useSecondaryNavHidden('resources-register');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [dash, setDash] = useState(null);
  const [assets, setAssets] = useState([]);
  const [invItems, setInvItems] = useState([]);
  const [selectedAssetId, setSelectedAssetId] = useState(null);
  const [selectedInvId, setSelectedInvId] = useState(null);
  const [assetForm, setAssetForm] = useState(emptyAssetForm);
  const [invForm, setInvForm] = useState(emptyInvForm);
  const [movements, setMovements] = useState([]);
  const [movForm, setMovForm] = useState({ movement_type: 'receive', quantity_delta: '', reference_no: '', supplier: '', batch_code: '', expiry_date: '', notes: '' });
  const [serviceEvents, setServiceEvents] = useState([]);
  const [svcForm, setSvcForm] = useState({ event_type: 'maintenance', performed_at: '', vendor_name: '', cost_value: '', next_due_date: '', description: '' });
  const [assetAttachments, setAssetAttachments] = useState([]);
  const [invAttachments, setInvAttachments] = useState([]);
  const [attMeta, setAttMeta] = useState({ document_category: '', expiry_date: '', renewal_date: '', maintenance_interval_days: '', notes: '', display_name: '' });
  const [editingAtt, setEditingAtt] = useState(null);
  const [editAttForm, setEditAttForm] = useState({});
  const [assetFormVisible, setAssetFormVisible] = useState(false);
  const [assetSubVisible, setAssetSubVisible] = useState(false);
  const [invFormVisible, setInvFormVisible] = useState(false);
  const [invSubVisible, setInvSubVisible] = useState(false);

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t && MAIN_TABS.some((x) => x.id === t)) setMainTab(t);
  }, [searchParams]);

  const setTab = (id) => {
    setMainTab(id);
    setSearchParams(id === 'dashboard' ? {} : { tab: id }, { replace: true });
  };

  const refreshDashboard = useCallback(async () => {
    const d = await rr.dashboard();
    setDash(d);
  }, []);

  const refreshAssets = useCallback(async () => {
    const d = await rr.listAssets({});
    setAssets(d.assets || []);
  }, []);

  const refreshInventory = useCallback(async () => {
    const d = await rr.listInventory({});
    setInvItems(d.items || []);
  }, []);

  const loadAssetDetail = useCallback(async (id) => {
    if (!id) {
      setAssetForm(emptyAssetForm());
      setServiceEvents([]);
      setAssetAttachments([]);
      return;
    }
    const [a, ev, att] = await Promise.all([
      rr.getAsset(id),
      rr.listServiceEvents(id),
      rr.listAttachments('asset', id),
    ]);
    const row = a.asset || {};
    setAssetForm({
      asset_type: row.asset_type || 'equipment',
      name: row.name || '',
      asset_code: row.asset_code || '',
      description: row.description || '',
      status: row.status || 'active',
      location_label: row.location_label || '',
      site_code: row.site_code || '',
      acquired_date: row.acquired_date ? String(row.acquired_date).slice(0, 10) : '',
      cost_value: row.cost_value != null ? String(row.cost_value) : '',
      currency_code: row.currency_code || 'ZAR',
      supplier_name: row.supplier_name || '',
      serial_number: row.serial_number || '',
      manufacturer: row.manufacturer || '',
      model: row.model || '',
      registration_number: row.registration_number || '',
      vin: row.vin || '',
      year_of_manufacture: row.year_of_manufacture != null ? String(row.year_of_manufacture) : '',
      odometer_km: row.odometer_km != null ? String(row.odometer_km) : '',
      fuel_type: row.fuel_type || '',
      insurance_policy_ref: row.insurance_policy_ref || '',
      insurance_expiry_date: row.insurance_expiry_date ? String(row.insurance_expiry_date).slice(0, 10) : '',
      license_disc_expiry_date: row.license_disc_expiry_date ? String(row.license_disc_expiry_date).slice(0, 10) : '',
      warranty_expiry_date: row.warranty_expiry_date ? String(row.warranty_expiry_date).slice(0, 10) : '',
      certification_name: row.certification_name || '',
      certification_expiry_date: row.certification_expiry_date ? String(row.certification_expiry_date).slice(0, 10) : '',
      building_or_structure: row.building_or_structure || '',
      trade_category: row.trade_category || '',
      lifting_capacity_t: row.lifting_capacity_t != null ? String(row.lifting_capacity_t) : '',
      height_restriction_m: row.height_restriction_m != null ? String(row.height_restriction_m) : '',
      compliance_notes: row.compliance_notes || '',
      maintenance_interval_days: row.maintenance_interval_days != null ? String(row.maintenance_interval_days) : '',
      maintenance_interval_hours: row.maintenance_interval_hours != null ? String(row.maintenance_interval_hours) : '',
      last_maintenance_date: row.last_maintenance_date ? String(row.last_maintenance_date).slice(0, 10) : '',
      next_maintenance_due_date: row.next_maintenance_due_date ? String(row.next_maintenance_due_date).slice(0, 10) : '',
      renewal_reminder_date: row.renewal_reminder_date ? String(row.renewal_reminder_date).slice(0, 10) : '',
    });
    setServiceEvents(ev.events || []);
    setAssetAttachments(att.attachments || []);
  }, []);

  const loadInvDetail = useCallback(async (id) => {
    if (!id) {
      setInvForm(emptyInvForm());
      setMovements([]);
      setInvAttachments([]);
      return;
    }
    const [it, mov, att] = await Promise.all([
      rr.getInventoryItem(id),
      rr.listMovements(id),
      rr.listAttachments('inventory_item', id),
    ]);
    const row = it.item || {};
    setInvForm({
      sku: row.sku || '',
      name: row.name || '',
      description: row.description || '',
      category: row.category || 'other',
      unit: row.unit || 'ea',
      quantity_on_hand: row.quantity_on_hand != null ? String(row.quantity_on_hand) : '0',
      reorder_level: row.reorder_level != null ? String(row.reorder_level) : '',
      economic_order_qty: row.economic_order_qty != null ? String(row.economic_order_qty) : '',
      storage_zone: row.storage_zone || '',
      storage_bin: row.storage_bin || '',
      default_supplier: row.default_supplier || '',
      manufacturer: row.manufacturer || '',
      part_number: row.part_number || '',
      hazard_class: row.hazard_class || '',
      shelf_life_days: row.shelf_life_days != null ? String(row.shelf_life_days) : '',
      received_date: row.received_date ? String(row.received_date).slice(0, 10) : '',
      batch_tracking: !!row.batch_tracking,
      standard_unit_cost: row.standard_unit_cost != null ? String(row.standard_unit_cost) : '',
      currency_code: row.currency_code || 'ZAR',
      expiry_date: row.expiry_date ? String(row.expiry_date).slice(0, 10) : '',
      renewal_reminder_date: row.renewal_reminder_date ? String(row.renewal_reminder_date).slice(0, 10) : '',
      maintenance_interval_days: row.maintenance_interval_days != null ? String(row.maintenance_interval_days) : '',
      next_review_date: row.next_review_date ? String(row.next_review_date).slice(0, 10) : '',
      notes: row.notes || '',
    });
    setMovements(mov.movements || []);
    setInvAttachments(att.attachments || []);
  }, []);

  useEffect(() => {
    let c = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        if (mainTab === 'dashboard') await refreshDashboard();
        if (mainTab === 'assets') await refreshAssets();
        if (mainTab === 'inventory') await refreshInventory();
      } catch (e) {
        if (!c) setError(e?.message || 'Load failed');
      } finally {
        if (!c) setLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [mainTab, refreshDashboard, refreshAssets, refreshInventory]);

  useEffect(() => {
    if (selectedAssetId) loadAssetDetail(selectedAssetId);
    else loadAssetDetail(null);
  }, [selectedAssetId, loadAssetDetail]);

  useEffect(() => {
    if (selectedInvId) loadInvDetail(selectedInvId);
    else loadInvDetail(null);
  }, [selectedInvId, loadInvDetail]);

  useEffect(() => {
    setAssetFormVisible(false);
    setAssetSubVisible(false);
    setInvFormVisible(false);
    setInvSubVisible(false);
    setEditingAtt(null);
    setSelectedAssetId(null);
    setSelectedInvId(null);
  }, [mainTab]);

  const mainTabMeta = MAIN_TABS.find((t) => t.id === mainTab) || MAIN_TABS[0];
  const tabSubtitles = {
    dashboard: 'Compliance horizon, stock signals, and recent warehouse activity.',
    assets: 'Equipment, fleet vehicles, and construction plant — with maintenance cadence and document vault.',
    inventory: 'Materials ledger: receipts, issues, batches, expiries, and attachment metadata.',
  };

  const onSaveAsset = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const body = {
        ...assetForm,
        year_of_manufacture: assetForm.year_of_manufacture ? parseInt(assetForm.year_of_manufacture, 10) : null,
        odometer_km: assetForm.odometer_km ? parseInt(assetForm.odometer_km, 10) : null,
        maintenance_interval_days: assetForm.maintenance_interval_days ? parseInt(assetForm.maintenance_interval_days, 10) : null,
        maintenance_interval_hours: assetForm.maintenance_interval_hours ? parseInt(assetForm.maintenance_interval_hours, 10) : null,
        lifting_capacity_t: assetForm.lifting_capacity_t ? Number(assetForm.lifting_capacity_t) : null,
        height_restriction_m: assetForm.height_restriction_m ? Number(assetForm.height_restriction_m) : null,
        cost_value: assetForm.cost_value ? Number(assetForm.cost_value) : null,
      };
      if (selectedAssetId) {
        await rr.updateAsset(selectedAssetId, body);
      } else {
        const r = await rr.createAsset(body);
        setSelectedAssetId(r.asset?.id);
        setAssetFormVisible(false);
        setAssetSubVisible(true);
      }
      await refreshAssets();
      await refreshDashboard();
    } catch (err) {
      setError(err?.message || 'Save failed');
    }
  };

  const onSaveInv = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const body = {
        ...invForm,
        quantity_on_hand: Number(invForm.quantity_on_hand),
        reorder_level: invForm.reorder_level ? Number(invForm.reorder_level) : null,
        economic_order_qty: invForm.economic_order_qty ? Number(invForm.economic_order_qty) : null,
        shelf_life_days: invForm.shelf_life_days ? parseInt(invForm.shelf_life_days, 10) : null,
        standard_unit_cost: invForm.standard_unit_cost ? Number(invForm.standard_unit_cost) : null,
        maintenance_interval_days: invForm.maintenance_interval_days ? parseInt(invForm.maintenance_interval_days, 10) : null,
        batch_tracking: !!invForm.batch_tracking,
      };
      if (selectedInvId) {
        await rr.updateInventoryItem(selectedInvId, body);
      } else {
        const r = await rr.createInventoryItem(body);
        setSelectedInvId(r.item?.id);
        setInvFormVisible(false);
        setInvSubVisible(true);
      }
      await refreshInventory();
      await refreshDashboard();
    } catch (err) {
      setError(err?.message || 'Save failed');
    }
  };

  const onAddMovement = async (e) => {
    e.preventDefault();
    if (!selectedInvId) return;
    setError('');
    try {
      await rr.addMovement(selectedInvId, {
        movement_type: movForm.movement_type,
        quantity_delta: Number(movForm.quantity_delta),
        reference_no: movForm.reference_no || undefined,
        supplier: movForm.supplier || undefined,
        batch_code: movForm.batch_code || undefined,
        expiry_date: movForm.expiry_date || undefined,
        notes: movForm.notes || undefined,
      });
      setMovForm((f) => ({ ...f, quantity_delta: '', reference_no: '', notes: '' }));
      await loadInvDetail(selectedInvId);
      await refreshInventory();
      await refreshDashboard();
    } catch (err) {
      setError(err?.message || 'Movement failed');
    }
  };

  const onAddService = async (e) => {
    e.preventDefault();
    if (!selectedAssetId) return;
    setError('');
    try {
      await rr.addServiceEvent(selectedAssetId, {
        ...svcForm,
        cost_value: svcForm.cost_value ? Number(svcForm.cost_value) : null,
        update_asset_next_due: true,
      });
      setSvcForm({ event_type: 'maintenance', performed_at: '', vendor_name: '', cost_value: '', next_due_date: '', description: '' });
      await loadAssetDetail(selectedAssetId);
      await refreshDashboard();
    } catch (err) {
      setError(err?.message || 'Service log failed');
    }
  };

  const onUploadAssetFiles = async (e) => {
    const files = e.target.files;
    if (!files?.length || !selectedAssetId) return;
    setError('');
    try {
      await rr.uploadAttachments('asset', selectedAssetId, files, attMeta);
      setAttMeta({ document_category: '', expiry_date: '', renewal_date: '', maintenance_interval_days: '', notes: '', display_name: '' });
      e.target.value = '';
      await loadAssetDetail(selectedAssetId);
    } catch (err) {
      setError(err?.message || 'Upload failed');
    }
  };

  const onUploadInvFiles = async (e) => {
    const files = e.target.files;
    if (!files?.length || !selectedInvId) return;
    setError('');
    try {
      await rr.uploadAttachments('inventory_item', selectedInvId, files, attMeta);
      setAttMeta({ document_category: '', expiry_date: '', renewal_date: '', maintenance_interval_days: '', notes: '', display_name: '' });
      e.target.value = '';
      await loadInvDetail(selectedInvId);
    } catch (err) {
      setError(err?.message || 'Upload failed');
    }
  };

  const saveAttachmentEdit = async () => {
    if (!editingAtt) return;
    setError('');
    try {
      await rr.updateAttachment(editingAtt, editAttForm);
      setEditingAtt(null);
      if (selectedAssetId) await loadAssetDetail(selectedAssetId);
      if (selectedInvId) await loadInvDetail(selectedInvId);
      await refreshDashboard();
    } catch (err) {
      setError(err?.message || 'Update failed');
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col -m-4 sm:-m-6 overflow-hidden bg-gradient-to-b from-slate-50 via-white to-slate-50/80 dark:from-surface-950 dark:via-surface-900 dark:to-surface-950">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside
          className={`shrink-0 border-r border-slate-200/80 dark:border-surface-700 bg-white/95 dark:bg-surface-900/95 shadow-[1px_0_0_rgba(15,23,42,0.04)] flex flex-col transition-[width] duration-200 overflow-hidden ${
            navHidden ? 'w-0 border-0 shadow-none' : 'w-64 lg:w-72'
          }`}
        >
          <div className="p-4 border-b border-slate-100 dark:border-surface-800 flex items-start justify-between gap-2 w-64 lg:w-72 shrink-0 bg-slate-50/50 dark:bg-surface-800/40">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-surface-100 tracking-tight">Resources register</h2>
              <p className="text-xs text-slate-500 dark:text-surface-400 mt-0.5">Assets & inventory</p>
            </div>
            <button type="button" onClick={() => setNavHidden(true)} className="text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 shrink-0" aria-label="Hide menu">
              «
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto p-3 space-y-1 w-64 lg:w-72 text-sm">
            <div className="pt-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-surface-400">Workspace</div>
            {MAIN_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`w-full text-left rounded-lg px-3 py-2.5 font-medium transition ${
                  mainTab === t.id
                    ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-900 dark:text-brand-200 ring-1 ring-brand-200/80 dark:ring-brand-800/80'
                    : 'hover:bg-surface-50 dark:hover:bg-surface-800 text-surface-800 dark:text-surface-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {navHidden && (
            <button type="button" onClick={() => setNavHidden(false)} className="m-2 self-start text-sm text-brand-700 dark:text-brand-400 hover:underline shrink-0">
              Show section menu
            </button>
          )}

          <div className="shrink-0 border-b border-slate-200/80 dark:border-surface-700 bg-white/95 dark:bg-surface-900/95 px-4 py-4 sm:px-6">
            <div className="flex items-center gap-2 flex-wrap max-w-7xl mx-auto w-full">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-surface-50">{mainTabMeta.label}</h1>
              <InfoHint
                title="Resources register"
                text="Register fixed assets by class (equipment, vehicles, construction plant), track maintenance and renewals, run a full inventory ledger with stock movements, and attach documents with expiry / renewal / maintenance cadence metadata. Grant the Resources register page role in User management."
              />
            </div>
            <p className="text-sm text-surface-600 dark:text-surface-400 mt-1 max-w-7xl mx-auto w-full">{tabSubtitles[mainTab]}</p>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6 w-full">
              {error && <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">{error}</div>}
              {loading && mainTab === 'dashboard' && <p className="text-surface-500">Loading…</p>}

              {mainTab === 'dashboard' && dash && (
                <div className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {(dash.assets_by_type || []).map((x) => (
                      <div key={x.asset_type} className="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-4 shadow-sm">
                        <p className="text-xs font-medium text-surface-500 uppercase">{x.asset_type}</p>
                        <p className="text-2xl font-bold text-brand-700 dark:text-brand-400 mt-1 tabular-nums">{x.count}</p>
                        <p className="text-xs text-surface-500 mt-1">Assets</p>
                      </div>
                    ))}
                    <div className="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-4 shadow-sm">
                      <p className="text-xs font-medium text-surface-500 uppercase">Inventory SKUs</p>
                      <p className="text-2xl font-bold text-surface-900 dark:text-surface-100 mt-1 tabular-nums">{dash.inventory?.sku_count ?? 0}</p>
                    </div>
                    <div className="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-4 shadow-sm">
                      <p className="text-xs font-medium text-surface-500 uppercase">Stock value (est.)</p>
                      <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 mt-1 tabular-nums">
                        {Number(dash.inventory?.stock_value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </p>
                    </div>
                  </div>

                  <div className="grid lg:grid-cols-2 gap-6">
                    <div className="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-4">
                      <h2 className="text-sm font-semibold text-surface-900 dark:text-surface-100 mb-2">Expiring inventory (90d)</h2>
                      <ul className="text-sm space-y-2 max-h-56 overflow-y-auto">
                        {(dash.expiring_inventory || []).map((r) => (
                          <li key={r.id} className="border-b border-surface-100 pb-1">
                            <span className="font-medium">{r.name}</span>
                            <span className="text-surface-500 text-xs ml-2">exp {formatDate(r.expiry_date)}</span>
                          </li>
                        ))}
                        {!(dash.expiring_inventory || []).length && <li className="text-surface-500">None flagged.</li>}
                      </ul>
                    </div>
                    <div className="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-4">
                      <h2 className="text-sm font-semibold text-surface-900 dark:text-surface-100 mb-2">Maintenance due (45d)</h2>
                      <ul className="text-sm space-y-2 max-h-56 overflow-y-auto">
                        {(dash.maintenance_due_assets || []).map((r) => (
                          <li key={r.id} className="border-b border-surface-100 pb-1">
                            <span className="font-medium">{r.name}</span>
                            <span className="text-surface-500 text-xs ml-2">{formatDate(r.next_maintenance_due_date)}</span>
                          </li>
                        ))}
                        {!(dash.maintenance_due_assets || []).length && <li className="text-surface-500">None due.</li>}
                      </ul>
                    </div>
                  </div>

                  <div className="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-4 overflow-x-auto">
                    <h2 className="text-sm font-semibold text-surface-900 dark:text-surface-100 mb-3">Recent stock movements</h2>
                    <table className="w-full text-sm min-w-[480px]">
                      <thead>
                        <tr className="text-left text-surface-500 border-b border-surface-200">
                          <th className="py-2">Date</th>
                          <th>Type</th>
                          <th>Item</th>
                          <th className="text-right">Δ Qty</th>
                          <th>Ref</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(dash.recent_movements || []).map((m) => (
                          <tr key={m.id} className="border-b border-surface-100">
                            <td className="py-1.5">{formatDate(m.movement_date)}</td>
                            <td>{m.movement_type}</td>
                            <td>{m.item_name}</td>
                            <td className="text-right tabular-nums">{m.quantity_delta}</td>
                            <td className="text-surface-500">{m.reference_no || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {mainTab === 'assets' && (
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                    <h2 className="text-sm font-semibold text-surface-800 dark:text-surface-200">Registered assets</h2>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className={btnPrimary()}
                        onClick={() => {
                          setSelectedAssetId(null);
                          setAssetForm(emptyAssetForm());
                          setAssetFormVisible(true);
                          setAssetSubVisible(false);
                          setEditingAtt(null);
                        }}
                      >
                        Register new asset
                      </button>
                      <button
                        type="button"
                        className={btnSecondary()}
                        disabled={!selectedAssetId}
                        onClick={() => {
                          if (!selectedAssetId) return;
                          setAssetFormVisible(true);
                          setAssetSubVisible(false);
                          setEditingAtt(null);
                        }}
                      >
                        Edit selected
                      </button>
                      <button
                        type="button"
                        className={btnSecondary()}
                        disabled={!selectedAssetId}
                        onClick={() => {
                          if (!selectedAssetId) return;
                          setAssetFormVisible(false);
                          setAssetSubVisible((v) => !v);
                          setEditingAtt(null);
                        }}
                      >
                        {assetSubVisible ? 'Hide' : 'Show'} maintenance and files
                      </button>
                      {selectedAssetId && (
                        <button
                          type="button"
                          className="text-sm text-surface-600 hover:text-surface-900 dark:text-surface-400 dark:hover:text-surface-100"
                          onClick={() => {
                            setSelectedAssetId(null);
                            setAssetForm(emptyAssetForm());
                            setAssetFormVisible(false);
                            setAssetSubVisible(false);
                            setEditingAtt(null);
                          }}
                        >
                          Clear selection
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 overflow-hidden shadow-sm">
                    <div className="overflow-x-auto max-h-[min(32rem,55vh)] overflow-y-auto">
                      <table className="w-full text-sm min-w-[720px]">
                        <thead className="sticky top-0 z-10 bg-slate-100/95 dark:bg-surface-800/95 backdrop-blur border-b border-surface-200 dark:border-surface-700">
                          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-surface-600 dark:text-surface-400">
                            <th className="px-3 py-2.5">Code</th>
                            <th className="px-3 py-2.5">Name</th>
                            <th className="px-3 py-2.5">Class</th>
                            <th className="px-3 py-2.5">Status</th>
                            <th className="px-3 py-2.5">Location</th>
                            <th className="px-3 py-2.5">Next maintenance</th>
                            <th className="px-3 py-2.5 w-[1%] text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {assets.map((a) => (
                            <tr
                              key={a.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => {
                                setSelectedAssetId(a.id);
                                setEditingAtt(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  setSelectedAssetId(a.id);
                                  setEditingAtt(null);
                                }
                              }}
                              onDoubleClick={() => {
                                setSelectedAssetId(a.id);
                                setAssetFormVisible(true);
                                setAssetSubVisible(false);
                                setEditingAtt(null);
                              }}
                              className={`border-b border-surface-100 dark:border-surface-800 cursor-pointer transition-colors ${
                                selectedAssetId === a.id
                                  ? 'bg-brand-50/90 dark:bg-brand-900/25'
                                  : 'hover:bg-surface-50 dark:hover:bg-surface-800/60'
                              }`}
                            >
                              <td className="px-3 py-2.5 text-surface-600 dark:text-surface-400 tabular-nums">{a.asset_code || '—'}</td>
                              <td className="px-3 py-2.5 font-medium text-surface-900 dark:text-surface-100">{a.name}</td>
                              <td className="px-3 py-2.5 text-surface-700 dark:text-surface-300">{assetTypeLabel(a.asset_type)}</td>
                              <td className="px-3 py-2.5 capitalize text-surface-600 dark:text-surface-400">{String(a.status || '').replace(/_/g, ' ')}</td>
                              <td className="px-3 py-2.5 text-surface-600 dark:text-surface-400 max-w-[200px] truncate" title={a.location_label || ''}>
                                {a.location_label || '—'}
                              </td>
                              <td className="px-3 py-2.5 text-surface-600 dark:text-surface-400">{formatDate(a.next_maintenance_due_date)}</td>
                              <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                <button
                                  type="button"
                                  className="text-brand-600 dark:text-brand-400 font-medium hover:underline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedAssetId(a.id);
                                    setAssetFormVisible(true);
                                    setAssetSubVisible(false);
                                    setEditingAtt(null);
                                  }}
                                >
                                  Edit
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!assets.length && <p className="p-6 text-sm text-surface-500 text-center">No assets yet. Use Register new asset to add one.</p>}
                  </div>

                  {selectedAssetId && !assetFormVisible && (
                    <p className="text-xs text-surface-500">
                      Tip: double-click a row to open the full edit form. Use Show maintenance and files for service logs and attachments without opening the register form.
                    </p>
                  )}

                  {assetFormVisible && (
                    <div className="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-4 shadow-sm space-y-4">
                    <form onSubmit={onSaveAsset} className="space-y-4">
                      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-surface-100 dark:border-surface-800 pb-3">
                        <h2 className="text-sm font-semibold text-surface-800 dark:text-surface-200">{selectedAssetId ? 'Edit asset' : 'Register asset'}</h2>
                        <button
                          type="button"
                          className={btnSecondary() + ' text-xs py-1.5'}
                          onClick={() => {
                            setAssetFormVisible(false);
                            setEditingAtt(null);
                          }}
                        >
                          Close form
                        </button>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-surface-600 mb-1">Asset class</label>
                          <select className={inputClass()} value={assetForm.asset_type} onChange={(e) => setAssetForm((f) => ({ ...f, asset_type: e.target.value }))}>
                            {ASSET_TYPES.map((t) => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-surface-600 mb-1">Status</label>
                          <select className={inputClass()} value={assetForm.status} onChange={(e) => setAssetForm((f) => ({ ...f, status: e.target.value }))}>
                            {ASSET_STATUSES.map((s) => (
                              <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-medium text-surface-600 mb-1">Name *</label>
                          <input className={inputClass()} value={assetForm.name} onChange={(e) => setAssetForm((f) => ({ ...f, name: e.target.value }))} required />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-surface-600 mb-1">Asset code</label>
                          <input className={inputClass()} value={assetForm.asset_code} onChange={(e) => setAssetForm((f) => ({ ...f, asset_code: e.target.value }))} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-surface-600 mb-1">Location</label>
                          <input className={inputClass()} value={assetForm.location_label} onChange={(e) => setAssetForm((f) => ({ ...f, location_label: e.target.value }))} />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-medium text-surface-600 mb-1">Description</label>
                          <textarea rows={2} className={inputClass()} value={assetForm.description} onChange={(e) => setAssetForm((f) => ({ ...f, description: e.target.value }))} />
                        </div>

                        {assetForm.asset_type === 'vehicle' && (
                          <>
                            <div><label className="block text-xs text-surface-600 mb-1">Registration</label><input className={inputClass()} value={assetForm.registration_number} onChange={(e) => setAssetForm((f) => ({ ...f, registration_number: e.target.value }))} /></div>
                            <div><label className="block text-xs text-surface-600 mb-1">VIN</label><input className={inputClass()} value={assetForm.vin} onChange={(e) => setAssetForm((f) => ({ ...f, vin: e.target.value }))} /></div>
                            <div><label className="block text-xs text-surface-600 mb-1">Make / manufacturer</label><input className={inputClass()} value={assetForm.manufacturer} onChange={(e) => setAssetForm((f) => ({ ...f, manufacturer: e.target.value }))} /></div>
                            <div><label className="block text-xs text-surface-600 mb-1">Model</label><input className={inputClass()} value={assetForm.model} onChange={(e) => setAssetForm((f) => ({ ...f, model: e.target.value }))} /></div>
                            <div><label className="block text-xs text-surface-600 mb-1">Year</label><input type="number" className={inputClass()} value={assetForm.year_of_manufacture} onChange={(e) => setAssetForm((f) => ({ ...f, year_of_manufacture: e.target.value }))} /></div>
                            <div><label className="block text-xs text-surface-600 mb-1">Odometer (km)</label><input type="number" className={inputClass()} value={assetForm.odometer_km} onChange={(e) => setAssetForm((f) => ({ ...f, odometer_km: e.target.value }))} /></div>
                            <div><label className="block text-xs text-surface-600 mb-1">Fuel</label><input className={inputClass()} value={assetForm.fuel_type} onChange={(e) => setAssetForm((f) => ({ ...f, fuel_type: e.target.value }))} /></div>
                            <div><label className="block text-xs text-surface-600 mb-1">Insurance expiry</label><input type="date" className={inputClass()} value={assetForm.insurance_expiry_date} onChange={(e) => setAssetForm((f) => ({ ...f, insurance_expiry_date: e.target.value }))} /></div>
                            <div><label className="block text-xs text-surface-600 mb-1">License disc expiry</label><input type="date" className={inputClass()} value={assetForm.license_disc_expiry_date} onChange={(e) => setAssetForm((f) => ({ ...f, license_disc_expiry_date: e.target.value }))} /></div>
                          </>
                        )}

                        {assetForm.asset_type === 'equipment' && (
                          <>
                            <div><label className="block text-xs text-surface-600 mb-1">Serial number</label><input className={inputClass()} value={assetForm.serial_number} onChange={(e) => setAssetForm((f) => ({ ...f, serial_number: e.target.value }))} /></div>
                            <div><label className="block text-xs text-surface-600 mb-1">Manufacturer</label><input className={inputClass()} value={assetForm.manufacturer} onChange={(e) => setAssetForm((f) => ({ ...f, manufacturer: e.target.value }))} /></div>
                            <div><label className="block text-xs text-surface-600 mb-1">Model</label><input className={inputClass()} value={assetForm.model} onChange={(e) => setAssetForm((f) => ({ ...f, model: e.target.value }))} /></div>
                            <div><label className="block text-xs text-surface-600 mb-1">Warranty expiry</label><input type="date" className={inputClass()} value={assetForm.warranty_expiry_date} onChange={(e) => setAssetForm((f) => ({ ...f, warranty_expiry_date: e.target.value }))} /></div>
                            <div><label className="block text-xs text-surface-600 mb-1">Certification</label><input className={inputClass()} value={assetForm.certification_name} onChange={(e) => setAssetForm((f) => ({ ...f, certification_name: e.target.value }))} /></div>
                            <div><label className="block text-xs text-surface-600 mb-1">Certification expiry</label><input type="date" className={inputClass()} value={assetForm.certification_expiry_date} onChange={(e) => setAssetForm((f) => ({ ...f, certification_expiry_date: e.target.value }))} /></div>
                          </>
                        )}

                        {assetForm.asset_type === 'building_construction' && (
                          <>
                            <div className="sm:col-span-2"><label className="block text-xs text-surface-600 mb-1">Building / structure</label><input className={inputClass()} value={assetForm.building_or_structure} onChange={(e) => setAssetForm((f) => ({ ...f, building_or_structure: e.target.value }))} /></div>
                            <div><label className="block text-xs text-surface-600 mb-1">Trade category</label><input className={inputClass()} value={assetForm.trade_category} onChange={(e) => setAssetForm((f) => ({ ...f, trade_category: e.target.value }))} /></div>
                            <div><label className="block text-xs text-surface-600 mb-1">Lifting capacity (t)</label><input type="number" step="0.01" className={inputClass()} value={assetForm.lifting_capacity_t} onChange={(e) => setAssetForm((f) => ({ ...f, lifting_capacity_t: e.target.value }))} /></div>
                            <div><label className="block text-xs text-surface-600 mb-1">Height restriction (m)</label><input type="number" step="0.01" className={inputClass()} value={assetForm.height_restriction_m} onChange={(e) => setAssetForm((f) => ({ ...f, height_restriction_m: e.target.value }))} /></div>
                            <div className="sm:col-span-2"><label className="block text-xs text-surface-600 mb-1">Compliance notes</label><textarea rows={2} className={inputClass()} value={assetForm.compliance_notes} onChange={(e) => setAssetForm((f) => ({ ...f, compliance_notes: e.target.value }))} /></div>
                          </>
                        )}

                        <div><label className="block text-xs text-surface-600 mb-1">Maintenance every (days)</label><input type="number" className={inputClass()} value={assetForm.maintenance_interval_days} onChange={(e) => setAssetForm((f) => ({ ...f, maintenance_interval_days: e.target.value }))} /></div>
                        <div><label className="block text-xs text-surface-600 mb-1">Maintenance every (hours)</label><input type="number" className={inputClass()} value={assetForm.maintenance_interval_hours} onChange={(e) => setAssetForm((f) => ({ ...f, maintenance_interval_hours: e.target.value }))} /></div>
                        <div><label className="block text-xs text-surface-600 mb-1">Last maintenance</label><input type="date" className={inputClass()} value={assetForm.last_maintenance_date} onChange={(e) => setAssetForm((f) => ({ ...f, last_maintenance_date: e.target.value }))} /></div>
                        <div><label className="block text-xs text-surface-600 mb-1">Next maintenance due</label><input type="date" className={inputClass()} value={assetForm.next_maintenance_due_date} onChange={(e) => setAssetForm((f) => ({ ...f, next_maintenance_due_date: e.target.value }))} /></div>
                        <div><label className="block text-xs text-surface-600 mb-1">Renewal reminder</label><input type="date" className={inputClass()} value={assetForm.renewal_reminder_date} onChange={(e) => setAssetForm((f) => ({ ...f, renewal_reminder_date: e.target.value }))} /></div>
                        <div><label className="block text-xs text-surface-600 mb-1">Acquired</label><input type="date" className={inputClass()} value={assetForm.acquired_date} onChange={(e) => setAssetForm((f) => ({ ...f, acquired_date: e.target.value }))} /></div>
                        <div><label className="block text-xs text-surface-600 mb-1">Cost value</label><input type="number" step="0.01" className={inputClass()} value={assetForm.cost_value} onChange={(e) => setAssetForm((f) => ({ ...f, cost_value: e.target.value }))} /></div>
                      </div>
                      <button type="submit" className={btnPrimary()}>{selectedAssetId ? 'Save changes' : 'Create asset'}</button>
                      {selectedAssetId && (
                        <button
                          type="button"
                          className="ml-2 text-sm text-red-600"
                          onClick={async () => {
                            if (!window.confirm('Delete this asset?')) return;
                            try {
                              await rr.deleteAsset(selectedAssetId);
                              setSelectedAssetId(null);
                              setAssetForm(emptyAssetForm());
                              setAssetFormVisible(false);
                              setAssetSubVisible(false);
                              await refreshAssets();
                            } catch (err) {
                              setError(err?.message || 'Delete failed');
                            }
                          }}
                        >
                          Delete
                        </button>
                      )}
                    </form>

                    {selectedAssetId && (
                      <div className="grid lg:grid-cols-2 gap-6 border-t border-surface-100 dark:border-surface-800 pt-4">
                        <div className="rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-50/80 dark:bg-surface-800/40 p-4 space-y-3">
                          <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-200">Service & inspections</h3>
                          <form onSubmit={onAddService} className="grid sm:grid-cols-2 gap-2 text-xs">
                            <select className={inputClass()} value={svcForm.event_type} onChange={(e) => setSvcForm((f) => ({ ...f, event_type: e.target.value }))}>
                              {SERVICE_EVENT_TYPES.map((x) => (
                                <option key={x.value} value={x.value}>{x.label}</option>
                              ))}
                            </select>
                            <input type="date" className={inputClass()} value={svcForm.performed_at} onChange={(e) => setSvcForm((f) => ({ ...f, performed_at: e.target.value }))} required />
                            <input className={inputClass()} placeholder="Vendor" value={svcForm.vendor_name} onChange={(e) => setSvcForm((f) => ({ ...f, vendor_name: e.target.value }))} />
                            <input type="number" step="0.01" className={inputClass()} placeholder="Cost" value={svcForm.cost_value} onChange={(e) => setSvcForm((f) => ({ ...f, cost_value: e.target.value }))} />
                            <input type="date" className={inputClass()} placeholder="Next due" value={svcForm.next_due_date} onChange={(e) => setSvcForm((f) => ({ ...f, next_due_date: e.target.value }))} />
                            <textarea className={inputClass() + ' sm:col-span-2'} rows={2} placeholder="Description" value={svcForm.description} onChange={(e) => setSvcForm((f) => ({ ...f, description: e.target.value }))} />
                            <button type="submit" className={btnPrimary() + ' sm:col-span-2'}>Log event</button>
                          </form>
                          <ul className="text-xs space-y-1 max-h-40 overflow-y-auto border-t pt-2">
                            {serviceEvents.map((ev) => (
                              <li key={ev.id}>{formatDate(ev.performed_at)} · {ev.event_type}{ev.next_due_date ? ` → next ${formatDate(ev.next_due_date)}` : ''}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-50/80 dark:bg-surface-800/40 p-4 space-y-3">
                          <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-200">Attachments (multi-file)</h3>
                          <div className="grid sm:grid-cols-2 gap-2 text-xs">
                            <input className={inputClass()} placeholder="Display name (default: file name)" value={attMeta.display_name} onChange={(e) => setAttMeta((m) => ({ ...m, display_name: e.target.value }))} />
                            <input className={inputClass()} placeholder="Document category" value={attMeta.document_category} onChange={(e) => setAttMeta((m) => ({ ...m, document_category: e.target.value }))} />
                            <input type="date" className={inputClass()} value={attMeta.expiry_date} onChange={(e) => setAttMeta((m) => ({ ...m, expiry_date: e.target.value }))} />
                            <input type="date" className={inputClass()} value={attMeta.renewal_date} onChange={(e) => setAttMeta((m) => ({ ...m, renewal_date: e.target.value }))} />
                            <input type="number" className={inputClass()} placeholder="Maint. interval (days)" value={attMeta.maintenance_interval_days} onChange={(e) => setAttMeta((m) => ({ ...m, maintenance_interval_days: e.target.value }))} />
                            <textarea className={inputClass() + ' sm:col-span-2'} rows={1} placeholder="Notes" value={attMeta.notes} onChange={(e) => setAttMeta((m) => ({ ...m, notes: e.target.value }))} />
                          </div>
                          <label className={`${btnSecondary()} cursor-pointer text-xs`}>
                            Upload files
                            <input type="file" multiple className="hidden" onChange={onUploadAssetFiles} />
                          </label>
                          <ul className="text-xs space-y-2">
                            {assetAttachments.map((a) => (
                              <li key={a.id} className="flex flex-wrap justify-between gap-2 border-b border-surface-100 pb-1">
                                <span>{a.display_name}</span>
                                <span className="flex gap-2">
                                  <button type="button" className="text-brand-600" onClick={() => openAttachmentWithAuth(rr.attachmentDownloadUrl(a.id))}>View</button>
                                  <button type="button" className="text-brand-600" onClick={() => downloadAttachmentWithAuth(rr.attachmentDownloadUrl(a.id), a.display_name)}>Download</button>
                                  <button type="button" className="text-surface-600" onClick={() => { setEditingAtt(a.id); setEditAttForm({ display_name: a.display_name, expiry_date: a.expiry_date ? String(a.expiry_date).slice(0, 10) : '', renewal_date: a.renewal_date ? String(a.renewal_date).slice(0, 10) : '', maintenance_interval_days: a.maintenance_interval_days ?? '', notes: a.notes || '' }); }}>Rename / meta</button>
                                </span>
                              </li>
                            ))}
                          </ul>
                          {editingAtt && (
                            <div className="border rounded-lg p-2 space-y-2 text-xs">
                              <input className={inputClass()} value={editAttForm.display_name} onChange={(e) => setEditAttForm((f) => ({ ...f, display_name: e.target.value }))} />
                              <div className="flex gap-2">
                                <input type="date" className={inputClass()} value={editAttForm.expiry_date} onChange={(e) => setEditAttForm((f) => ({ ...f, expiry_date: e.target.value }))} />
                                <input type="date" className={inputClass()} value={editAttForm.renewal_date} onChange={(e) => setEditAttForm((f) => ({ ...f, renewal_date: e.target.value }))} />
                              </div>
                              <input type="number" className={inputClass()} placeholder="Maint interval days" value={editAttForm.maintenance_interval_days} onChange={(e) => setEditAttForm((f) => ({ ...f, maintenance_interval_days: e.target.value }))} />
                              <textarea className={inputClass()} rows={2} value={editAttForm.notes} onChange={(e) => setEditAttForm((f) => ({ ...f, notes: e.target.value }))} />
                              <div className="flex gap-2">
                                <button type="button" className={btnPrimary()} onClick={saveAttachmentEdit}>Save</button>
                                <button type="button" className={btnSecondary()} onClick={() => setEditingAtt(null)}>Cancel</button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    </div>
                  )}

                  {assetSubVisible && selectedAssetId && !assetFormVisible && (
                    <div className="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-4 shadow-sm space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-100 dark:border-surface-800 pb-3">
                        <h2 className="text-sm font-semibold text-surface-800 dark:text-surface-200">Maintenance and files</h2>
                        <button type="button" className={btnSecondary() + ' text-xs py-1.5'} onClick={() => { setAssetSubVisible(false); setEditingAtt(null); }}>
                          Close
                        </button>
                      </div>
                      <div className="grid lg:grid-cols-2 gap-6">
                        <div className="rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-50/80 dark:bg-surface-800/40 p-4 space-y-3">
                          <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-200">Service & inspections</h3>
                          <form onSubmit={onAddService} className="grid sm:grid-cols-2 gap-2 text-xs">
                            <select className={inputClass()} value={svcForm.event_type} onChange={(e) => setSvcForm((f) => ({ ...f, event_type: e.target.value }))}>
                              {SERVICE_EVENT_TYPES.map((x) => (
                                <option key={x.value} value={x.value}>{x.label}</option>
                              ))}
                            </select>
                            <input type="date" className={inputClass()} value={svcForm.performed_at} onChange={(e) => setSvcForm((f) => ({ ...f, performed_at: e.target.value }))} required />
                            <input className={inputClass()} placeholder="Vendor" value={svcForm.vendor_name} onChange={(e) => setSvcForm((f) => ({ ...f, vendor_name: e.target.value }))} />
                            <input type="number" step="0.01" className={inputClass()} placeholder="Cost" value={svcForm.cost_value} onChange={(e) => setSvcForm((f) => ({ ...f, cost_value: e.target.value }))} />
                            <input type="date" className={inputClass()} placeholder="Next due" value={svcForm.next_due_date} onChange={(e) => setSvcForm((f) => ({ ...f, next_due_date: e.target.value }))} />
                            <textarea className={inputClass() + ' sm:col-span-2'} rows={2} placeholder="Description" value={svcForm.description} onChange={(e) => setSvcForm((f) => ({ ...f, description: e.target.value }))} />
                            <button type="submit" className={btnPrimary() + ' sm:col-span-2'}>Log event</button>
                          </form>
                          <ul className="text-xs space-y-1 max-h-40 overflow-y-auto border-t pt-2">
                            {serviceEvents.map((ev) => (
                              <li key={ev.id}>{formatDate(ev.performed_at)} · {ev.event_type}{ev.next_due_date ? ` → next ${formatDate(ev.next_due_date)}` : ''}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-50/80 dark:bg-surface-800/40 p-4 space-y-3">
                          <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-200">Attachments (multi-file)</h3>
                          <div className="grid sm:grid-cols-2 gap-2 text-xs">
                            <input className={inputClass()} placeholder="Display name (default: file name)" value={attMeta.display_name} onChange={(e) => setAttMeta((m) => ({ ...m, display_name: e.target.value }))} />
                            <input className={inputClass()} placeholder="Document category" value={attMeta.document_category} onChange={(e) => setAttMeta((m) => ({ ...m, document_category: e.target.value }))} />
                            <input type="date" className={inputClass()} value={attMeta.expiry_date} onChange={(e) => setAttMeta((m) => ({ ...m, expiry_date: e.target.value }))} />
                            <input type="date" className={inputClass()} value={attMeta.renewal_date} onChange={(e) => setAttMeta((m) => ({ ...m, renewal_date: e.target.value }))} />
                            <input type="number" className={inputClass()} placeholder="Maint. interval (days)" value={attMeta.maintenance_interval_days} onChange={(e) => setAttMeta((m) => ({ ...m, maintenance_interval_days: e.target.value }))} />
                            <textarea className={inputClass() + ' sm:col-span-2'} rows={1} placeholder="Notes" value={attMeta.notes} onChange={(e) => setAttMeta((m) => ({ ...m, notes: e.target.value }))} />
                          </div>
                          <label className={`${btnSecondary()} cursor-pointer text-xs`}>
                            Upload files
                            <input type="file" multiple className="hidden" onChange={onUploadAssetFiles} />
                          </label>
                          <ul className="text-xs space-y-2">
                            {assetAttachments.map((a) => (
                              <li key={a.id} className="flex flex-wrap justify-between gap-2 border-b border-surface-100 pb-1">
                                <span>{a.display_name}</span>
                                <span className="flex gap-2">
                                  <button type="button" className="text-brand-600" onClick={() => openAttachmentWithAuth(rr.attachmentDownloadUrl(a.id))}>View</button>
                                  <button type="button" className="text-brand-600" onClick={() => downloadAttachmentWithAuth(rr.attachmentDownloadUrl(a.id), a.display_name)}>Download</button>
                                  <button type="button" className="text-surface-600" onClick={() => { setEditingAtt(a.id); setEditAttForm({ display_name: a.display_name, expiry_date: a.expiry_date ? String(a.expiry_date).slice(0, 10) : '', renewal_date: a.renewal_date ? String(a.renewal_date).slice(0, 10) : '', maintenance_interval_days: a.maintenance_interval_days ?? '', notes: a.notes || '' }); }}>Rename / meta</button>
                                </span>
                              </li>
                            ))}
                          </ul>
                          {editingAtt && (
                            <div className="border rounded-lg p-2 space-y-2 text-xs">
                              <input className={inputClass()} value={editAttForm.display_name} onChange={(e) => setEditAttForm((f) => ({ ...f, display_name: e.target.value }))} />
                              <div className="flex gap-2">
                                <input type="date" className={inputClass()} value={editAttForm.expiry_date} onChange={(e) => setEditAttForm((f) => ({ ...f, expiry_date: e.target.value }))} />
                                <input type="date" className={inputClass()} value={editAttForm.renewal_date} onChange={(e) => setEditAttForm((f) => ({ ...f, renewal_date: e.target.value }))} />
                              </div>
                              <input type="number" className={inputClass()} placeholder="Maint interval days" value={editAttForm.maintenance_interval_days} onChange={(e) => setEditAttForm((f) => ({ ...f, maintenance_interval_days: e.target.value }))} />
                              <textarea className={inputClass()} rows={2} value={editAttForm.notes} onChange={(e) => setEditAttForm((f) => ({ ...f, notes: e.target.value }))} />
                              <div className="flex gap-2">
                                <button type="button" className={btnPrimary()} onClick={saveAttachmentEdit}>Save</button>
                                <button type="button" className={btnSecondary()} onClick={() => setEditingAtt(null)}>Cancel</button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {mainTab === 'inventory' && (
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                    <h2 className="text-sm font-semibold text-surface-800 dark:text-surface-200">Inventory register</h2>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className={btnPrimary()}
                        onClick={() => {
                          setSelectedInvId(null);
                          setInvForm(emptyInvForm());
                          setInvFormVisible(true);
                          setInvSubVisible(false);
                          setEditingAtt(null);
                        }}
                      >
                        Register new item
                      </button>
                      <button
                        type="button"
                        className={btnSecondary()}
                        disabled={!selectedInvId}
                        onClick={() => {
                          if (!selectedInvId) return;
                          setInvFormVisible(true);
                          setInvSubVisible(false);
                          setEditingAtt(null);
                        }}
                      >
                        Edit selected
                      </button>
                      <button
                        type="button"
                        className={btnSecondary()}
                        disabled={!selectedInvId}
                        onClick={() => {
                          if (!selectedInvId) return;
                          setInvFormVisible(false);
                          setInvSubVisible((v) => !v);
                          setEditingAtt(null);
                        }}
                      >
                        {invSubVisible ? 'Hide' : 'Show'} movements and files
                      </button>
                      {selectedInvId && (
                        <button
                          type="button"
                          className="text-sm text-surface-600 hover:text-surface-900 dark:text-surface-400 dark:hover:text-surface-100"
                          onClick={() => {
                            setSelectedInvId(null);
                            setInvForm(emptyInvForm());
                            setInvFormVisible(false);
                            setInvSubVisible(false);
                            setEditingAtt(null);
                          }}
                        >
                          Clear selection
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 overflow-hidden shadow-sm">
                    <div className="overflow-x-auto max-h-[min(32rem,55vh)] overflow-y-auto">
                      <table className="w-full text-sm min-w-[800px]">
                        <thead className="sticky top-0 z-10 bg-slate-100/95 dark:bg-surface-800/95 backdrop-blur border-b border-surface-200 dark:border-surface-700">
                          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-surface-600 dark:text-surface-400">
                            <th className="px-3 py-2.5">SKU</th>
                            <th className="px-3 py-2.5">Name</th>
                            <th className="px-3 py-2.5">Category</th>
                            <th className="px-3 py-2.5 text-right">Qty</th>
                            <th className="px-3 py-2.5">Unit</th>
                            <th className="px-3 py-2.5">Zone / bin</th>
                            <th className="px-3 py-2.5">Expiry</th>
                            <th className="px-3 py-2.5 w-[1%] text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {invItems.map((it) => (
                            <tr
                              key={it.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => {
                                setSelectedInvId(it.id);
                                setEditingAtt(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  setSelectedInvId(it.id);
                                  setEditingAtt(null);
                                }
                              }}
                              onDoubleClick={() => {
                                setSelectedInvId(it.id);
                                setInvFormVisible(true);
                                setInvSubVisible(false);
                                setEditingAtt(null);
                              }}
                              className={`border-b border-surface-100 dark:border-surface-800 cursor-pointer transition-colors ${
                                selectedInvId === it.id
                                  ? 'bg-brand-50/90 dark:bg-brand-900/25'
                                  : 'hover:bg-surface-50 dark:hover:bg-surface-800/60'
                              }`}
                            >
                              <td className="px-3 py-2.5 text-surface-600 dark:text-surface-400 tabular-nums">{it.sku || '—'}</td>
                              <td className="px-3 py-2.5 font-medium text-surface-900 dark:text-surface-100">{it.name}</td>
                              <td className="px-3 py-2.5 text-surface-700 dark:text-surface-300">{invCategoryLabel(it.category)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-surface-800 dark:text-surface-200">{it.quantity_on_hand}</td>
                              <td className="px-3 py-2.5 text-surface-600 dark:text-surface-400">{it.unit}</td>
                              <td className="px-3 py-2.5 text-surface-600 dark:text-surface-400 max-w-[180px] truncate" title={`${it.storage_zone || ''} ${it.storage_bin || ''}`}>
                                {[it.storage_zone, it.storage_bin].filter(Boolean).join(' / ') || '—'}
                              </td>
                              <td className="px-3 py-2.5 text-surface-600 dark:text-surface-400">{formatDate(it.expiry_date)}</td>
                              <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                <button
                                  type="button"
                                  className="text-brand-600 dark:text-brand-400 font-medium hover:underline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedInvId(it.id);
                                    setInvFormVisible(true);
                                    setInvSubVisible(false);
                                    setEditingAtt(null);
                                  }}
                                >
                                  Edit
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!invItems.length && <p className="p-6 text-sm text-surface-500 text-center">No inventory lines yet. Use Register new item to add one.</p>}
                  </div>

                  {selectedInvId && !invFormVisible && (
                    <p className="text-xs text-surface-500">
                      Tip: double-click a row to open the full item form. Use Show movements and files to post stock movements or upload certificates without opening the register form.
                    </p>
                  )}

                  {invFormVisible && (
                    <div className="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-4 shadow-sm space-y-4">
                    <form onSubmit={onSaveInv} className="space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-surface-100 dark:border-surface-800 pb-3">
                        <h2 className="text-sm font-semibold text-surface-800 dark:text-surface-200">{selectedInvId ? 'Edit item' : 'Register material / SKU'}</h2>
                        <button type="button" className={btnSecondary() + ' text-xs py-1.5'} onClick={() => { setInvFormVisible(false); setEditingAtt(null); }}>
                          Close form
                        </button>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div><label className="block text-xs text-surface-600 mb-1">SKU</label><input className={inputClass()} value={invForm.sku} onChange={(e) => setInvForm((f) => ({ ...f, sku: e.target.value }))} /></div>
                        <div><label className="block text-xs text-surface-600 mb-1">Category</label>
                          <select className={inputClass()} value={invForm.category} onChange={(e) => setInvForm((f) => ({ ...f, category: e.target.value }))}>
                            {INV_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                          </select>
                        </div>
                        <div className="sm:col-span-2"><label className="block text-xs text-surface-600 mb-1">Name *</label><input className={inputClass()} value={invForm.name} onChange={(e) => setInvForm((f) => ({ ...f, name: e.target.value }))} required /></div>
                        <div><label className="block text-xs text-surface-600 mb-1">Unit</label><input className={inputClass()} value={invForm.unit} onChange={(e) => setInvForm((f) => ({ ...f, unit: e.target.value }))} /></div>
                        <div><label className="block text-xs text-surface-600 mb-1">Qty on hand</label><input type="number" step="0.0001" className={inputClass()} value={invForm.quantity_on_hand} onChange={(e) => setInvForm((f) => ({ ...f, quantity_on_hand: e.target.value }))} /></div>
                        <div><label className="block text-xs text-surface-600 mb-1">Reorder level</label><input type="number" step="0.0001" className={inputClass()} value={invForm.reorder_level} onChange={(e) => setInvForm((f) => ({ ...f, reorder_level: e.target.value }))} /></div>
                        <div><label className="block text-xs text-surface-600 mb-1">EOQ</label><input type="number" step="0.0001" className={inputClass()} value={invForm.economic_order_qty} onChange={(e) => setInvForm((f) => ({ ...f, economic_order_qty: e.target.value }))} /></div>
                        <div><label className="block text-xs text-surface-600 mb-1">Zone / bin</label><input className={inputClass()} value={invForm.storage_zone} placeholder="Zone" onChange={(e) => setInvForm((f) => ({ ...f, storage_zone: e.target.value }))} /></div>
                        <div><label className="block text-xs text-surface-600 mb-1">&nbsp;</label><input className={inputClass()} value={invForm.storage_bin} placeholder="Bin" onChange={(e) => setInvForm((f) => ({ ...f, storage_bin: e.target.value }))} /></div>
                        <div><label className="block text-xs text-surface-600 mb-1">Supplier</label><input className={inputClass()} value={invForm.default_supplier} onChange={(e) => setInvForm((f) => ({ ...f, default_supplier: e.target.value }))} /></div>
                        <div><label className="block text-xs text-surface-600 mb-1">Part #</label><input className={inputClass()} value={invForm.part_number} onChange={(e) => setInvForm((f) => ({ ...f, part_number: e.target.value }))} /></div>
                        <div><label className="block text-xs text-surface-600 mb-1">Hazard class</label><input className={inputClass()} value={invForm.hazard_class} onChange={(e) => setInvForm((f) => ({ ...f, hazard_class: e.target.value }))} /></div>
                        <div><label className="block text-xs text-surface-600 mb-1">Shelf life (days)</label><input type="number" className={inputClass()} value={invForm.shelf_life_days} onChange={(e) => setInvForm((f) => ({ ...f, shelf_life_days: e.target.value }))} /></div>
                        <div><label className="block text-xs text-surface-600 mb-1">Standard unit cost</label><input type="number" step="0.0001" className={inputClass()} value={invForm.standard_unit_cost} onChange={(e) => setInvForm((f) => ({ ...f, standard_unit_cost: e.target.value }))} /></div>
                        <div><label className="block text-xs text-surface-600 mb-1">Expiry (lot default)</label><input type="date" className={inputClass()} value={invForm.expiry_date} onChange={(e) => setInvForm((f) => ({ ...f, expiry_date: e.target.value }))} /></div>
                        <div><label className="block text-xs text-surface-600 mb-1">Renewal reminder</label><input type="date" className={inputClass()} value={invForm.renewal_reminder_date} onChange={(e) => setInvForm((f) => ({ ...f, renewal_reminder_date: e.target.value }))} /></div>
                        <div><label className="block text-xs text-surface-600 mb-1">Maint. interval (days)</label><input type="number" className={inputClass()} value={invForm.maintenance_interval_days} onChange={(e) => setInvForm((f) => ({ ...f, maintenance_interval_days: e.target.value }))} /></div>
                        <div><label className="block text-xs text-surface-600 mb-1">Next review</label><input type="date" className={inputClass()} value={invForm.next_review_date} onChange={(e) => setInvForm((f) => ({ ...f, next_review_date: e.target.value }))} /></div>
                        <label className="sm:col-span-2 flex items-center gap-2 text-xs text-surface-700">
                          <input type="checkbox" checked={invForm.batch_tracking} onChange={(e) => setInvForm((f) => ({ ...f, batch_tracking: e.target.checked }))} />
                          Batch / lot tracking
                        </label>
                        <div className="sm:col-span-2"><label className="block text-xs text-surface-600 mb-1">Notes</label><textarea rows={2} className={inputClass()} value={invForm.notes} onChange={(e) => setInvForm((f) => ({ ...f, notes: e.target.value }))} /></div>
                      </div>
                      <button type="submit" className={btnPrimary()}>{selectedInvId ? 'Save item' : 'Create item'}</button>
                      {selectedInvId && (
                        <button type="button" className="ml-2 text-sm text-red-600" onClick={async () => { if (!window.confirm('Delete?')) return; try { await rr.deleteInventoryItem(selectedInvId); setSelectedInvId(null); setInvForm(emptyInvForm()); setInvFormVisible(false); setInvSubVisible(false); await refreshInventory(); } catch (err) { setError(err?.message); } }}>Delete</button>
                      )}
                    </form>

                    {selectedInvId && (
                      <div className="grid lg:grid-cols-2 gap-6 border-t border-surface-100 dark:border-surface-800 pt-4">
                        <div className="rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-50/80 dark:bg-surface-800/40 p-4 space-y-3">
                          <h3 className="text-sm font-semibold">Stock movements</h3>
                          <form onSubmit={onAddMovement} className="grid sm:grid-cols-2 gap-2 text-xs">
                            <select className={inputClass()} value={movForm.movement_type} onChange={(e) => setMovForm((f) => ({ ...f, movement_type: e.target.value }))}>
                              {MOVEMENT_TYPES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                            <input type="number" step="0.0001" className={inputClass()} placeholder="Δ quantity (+/-)" value={movForm.quantity_delta} onChange={(e) => setMovForm((f) => ({ ...f, quantity_delta: e.target.value }))} required />
                            <input className={inputClass()} placeholder="Reference / PO" value={movForm.reference_no} onChange={(e) => setMovForm((f) => ({ ...f, reference_no: e.target.value }))} />
                            <input className={inputClass()} placeholder="Supplier" value={movForm.supplier} onChange={(e) => setMovForm((f) => ({ ...f, supplier: e.target.value }))} />
                            <input className={inputClass()} placeholder="Batch code" value={movForm.batch_code} onChange={(e) => setMovForm((f) => ({ ...f, batch_code: e.target.value }))} />
                            <input type="date" className={inputClass()} value={movForm.expiry_date} onChange={(e) => setMovForm((f) => ({ ...f, expiry_date: e.target.value }))} />
                            <textarea className={inputClass() + ' sm:col-span-2'} rows={1} placeholder="Notes" value={movForm.notes} onChange={(e) => setMovForm((f) => ({ ...f, notes: e.target.value }))} />
                            <button type="submit" className={btnPrimary() + ' sm:col-span-2'}>Post movement</button>
                          </form>
                          <ul className="text-xs max-h-48 overflow-y-auto border-t pt-2 space-y-1">
                            {movements.map((m) => (
                              <li key={m.id}>{formatDate(m.movement_date)} · {m.movement_type} · {m.quantity_delta}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-50/80 dark:bg-surface-800/40 p-4 space-y-3">
                          <h3 className="text-sm font-semibold">Attachments & certificates</h3>
                          <div className="grid sm:grid-cols-2 gap-2 text-xs">
                            <input className={inputClass()} placeholder="Display name" value={attMeta.display_name} onChange={(e) => setAttMeta((m) => ({ ...m, display_name: e.target.value }))} />
                            <input className={inputClass()} placeholder="Category" value={attMeta.document_category} onChange={(e) => setAttMeta((m) => ({ ...m, document_category: e.target.value }))} />
                            <input type="date" className={inputClass()} value={attMeta.expiry_date} onChange={(e) => setAttMeta((m) => ({ ...m, expiry_date: e.target.value }))} />
                            <input type="date" className={inputClass()} value={attMeta.renewal_date} onChange={(e) => setAttMeta((m) => ({ ...m, renewal_date: e.target.value }))} />
                            <input type="number" className={inputClass()} placeholder="Maint interval (days)" value={attMeta.maintenance_interval_days} onChange={(e) => setAttMeta((m) => ({ ...m, maintenance_interval_days: e.target.value }))} />
                          </div>
                          <label className={`${btnSecondary()} cursor-pointer text-xs`}>
                            Upload files
                            <input type="file" multiple className="hidden" onChange={onUploadInvFiles} />
                          </label>
                          <ul className="text-xs space-y-2">
                            {invAttachments.map((a) => (
                              <li key={a.id} className="flex flex-wrap justify-between gap-2 border-b border-surface-100 pb-1">
                                <span>{a.display_name}</span>
                                <span className="flex gap-2">
                                  <button type="button" className="text-brand-600" onClick={() => openAttachmentWithAuth(rr.attachmentDownloadUrl(a.id))}>View</button>
                                  <button type="button" className="text-brand-600" onClick={() => downloadAttachmentWithAuth(rr.attachmentDownloadUrl(a.id), a.display_name)}>Download</button>
                                  <button type="button" className="text-surface-600" onClick={() => { setEditingAtt(a.id); setEditAttForm({ display_name: a.display_name, expiry_date: a.expiry_date ? String(a.expiry_date).slice(0, 10) : '', renewal_date: a.renewal_date ? String(a.renewal_date).slice(0, 10) : '', maintenance_interval_days: a.maintenance_interval_days ?? '', notes: a.notes || '' }); }}>Edit meta</button>
                                </span>
                              </li>
                            ))}
                          </ul>
                          {editingAtt && (
                            <div className="border rounded-lg p-2 space-y-2 text-xs">
                              <input className={inputClass()} value={editAttForm.display_name} onChange={(e) => setEditAttForm((f) => ({ ...f, display_name: e.target.value }))} />
                              <div className="flex gap-2 flex-wrap">
                                <input type="date" className={inputClass()} value={editAttForm.expiry_date} onChange={(e) => setEditAttForm((f) => ({ ...f, expiry_date: e.target.value }))} />
                                <input type="date" className={inputClass()} value={editAttForm.renewal_date} onChange={(e) => setEditAttForm((f) => ({ ...f, renewal_date: e.target.value }))} />
                                <input type="number" className={inputClass()} value={editAttForm.maintenance_interval_days} onChange={(e) => setEditAttForm((f) => ({ ...f, maintenance_interval_days: e.target.value }))} />
                              </div>
                              <textarea className={inputClass()} rows={2} value={editAttForm.notes} onChange={(e) => setEditAttForm((f) => ({ ...f, notes: e.target.value }))} />
                              <div className="flex gap-2">
                                <button type="button" className={btnPrimary()} onClick={saveAttachmentEdit}>Save</button>
                                <button type="button" className={btnSecondary()} onClick={() => setEditingAtt(null)}>Cancel</button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    </div>
                  )}

                  {invSubVisible && selectedInvId && !invFormVisible && (
                    <div className="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-4 shadow-sm space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-100 dark:border-surface-800 pb-3">
                        <h2 className="text-sm font-semibold text-surface-800 dark:text-surface-200">Movements and files</h2>
                        <button type="button" className={btnSecondary() + ' text-xs py-1.5'} onClick={() => { setInvSubVisible(false); setEditingAtt(null); }}>
                          Close
                        </button>
                      </div>
                      <div className="grid lg:grid-cols-2 gap-6">
                        <div className="rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-50/80 dark:bg-surface-800/40 p-4 space-y-3">
                          <h3 className="text-sm font-semibold">Stock movements</h3>
                          <form onSubmit={onAddMovement} className="grid sm:grid-cols-2 gap-2 text-xs">
                            <select className={inputClass()} value={movForm.movement_type} onChange={(e) => setMovForm((f) => ({ ...f, movement_type: e.target.value }))}>
                              {MOVEMENT_TYPES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                            <input type="number" step="0.0001" className={inputClass()} placeholder="Δ quantity (+/-)" value={movForm.quantity_delta} onChange={(e) => setMovForm((f) => ({ ...f, quantity_delta: e.target.value }))} required />
                            <input className={inputClass()} placeholder="Reference / PO" value={movForm.reference_no} onChange={(e) => setMovForm((f) => ({ ...f, reference_no: e.target.value }))} />
                            <input className={inputClass()} placeholder="Supplier" value={movForm.supplier} onChange={(e) => setMovForm((f) => ({ ...f, supplier: e.target.value }))} />
                            <input className={inputClass()} placeholder="Batch code" value={movForm.batch_code} onChange={(e) => setMovForm((f) => ({ ...f, batch_code: e.target.value }))} />
                            <input type="date" className={inputClass()} value={movForm.expiry_date} onChange={(e) => setMovForm((f) => ({ ...f, expiry_date: e.target.value }))} />
                            <textarea className={inputClass() + ' sm:col-span-2'} rows={1} placeholder="Notes" value={movForm.notes} onChange={(e) => setMovForm((f) => ({ ...f, notes: e.target.value }))} />
                            <button type="submit" className={btnPrimary() + ' sm:col-span-2'}>Post movement</button>
                          </form>
                          <ul className="text-xs max-h-48 overflow-y-auto border-t pt-2 space-y-1">
                            {movements.map((m) => (
                              <li key={m.id}>{formatDate(m.movement_date)} · {m.movement_type} · {m.quantity_delta}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-50/80 dark:bg-surface-800/40 p-4 space-y-3">
                          <h3 className="text-sm font-semibold">Attachments & certificates</h3>
                          <div className="grid sm:grid-cols-2 gap-2 text-xs">
                            <input className={inputClass()} placeholder="Display name" value={attMeta.display_name} onChange={(e) => setAttMeta((m) => ({ ...m, display_name: e.target.value }))} />
                            <input className={inputClass()} placeholder="Category" value={attMeta.document_category} onChange={(e) => setAttMeta((m) => ({ ...m, document_category: e.target.value }))} />
                            <input type="date" className={inputClass()} value={attMeta.expiry_date} onChange={(e) => setAttMeta((m) => ({ ...m, expiry_date: e.target.value }))} />
                            <input type="date" className={inputClass()} value={attMeta.renewal_date} onChange={(e) => setAttMeta((m) => ({ ...m, renewal_date: e.target.value }))} />
                            <input type="number" className={inputClass()} placeholder="Maint interval (days)" value={attMeta.maintenance_interval_days} onChange={(e) => setAttMeta((m) => ({ ...m, maintenance_interval_days: e.target.value }))} />
                          </div>
                          <label className={`${btnSecondary()} cursor-pointer text-xs`}>
                            Upload files
                            <input type="file" multiple className="hidden" onChange={onUploadInvFiles} />
                          </label>
                          <ul className="text-xs space-y-2">
                            {invAttachments.map((a) => (
                              <li key={a.id} className="flex flex-wrap justify-between gap-2 border-b border-surface-100 pb-1">
                                <span>{a.display_name}</span>
                                <span className="flex gap-2">
                                  <button type="button" className="text-brand-600" onClick={() => openAttachmentWithAuth(rr.attachmentDownloadUrl(a.id))}>View</button>
                                  <button type="button" className="text-brand-600" onClick={() => downloadAttachmentWithAuth(rr.attachmentDownloadUrl(a.id), a.display_name)}>Download</button>
                                  <button type="button" className="text-surface-600" onClick={() => { setEditingAtt(a.id); setEditAttForm({ display_name: a.display_name, expiry_date: a.expiry_date ? String(a.expiry_date).slice(0, 10) : '', renewal_date: a.renewal_date ? String(a.renewal_date).slice(0, 10) : '', maintenance_interval_days: a.maintenance_interval_days ?? '', notes: a.notes || '' }); }}>Edit meta</button>
                                </span>
                              </li>
                            ))}
                          </ul>
                          {editingAtt && (
                            <div className="border rounded-lg p-2 space-y-2 text-xs">
                              <input className={inputClass()} value={editAttForm.display_name} onChange={(e) => setEditAttForm((f) => ({ ...f, display_name: e.target.value }))} />
                              <div className="flex gap-2 flex-wrap">
                                <input type="date" className={inputClass()} value={editAttForm.expiry_date} onChange={(e) => setEditAttForm((f) => ({ ...f, expiry_date: e.target.value }))} />
                                <input type="date" className={inputClass()} value={editAttForm.renewal_date} onChange={(e) => setEditAttForm((f) => ({ ...f, renewal_date: e.target.value }))} />
                                <input type="number" className={inputClass()} value={editAttForm.maintenance_interval_days} onChange={(e) => setEditAttForm((f) => ({ ...f, maintenance_interval_days: e.target.value }))} />
                              </div>
                              <textarea className={inputClass()} rows={2} value={editAttForm.notes} onChange={(e) => setEditAttForm((f) => ({ ...f, notes: e.target.value }))} />
                              <div className="flex gap-2">
                                <button type="button" className={btnPrimary()} onClick={saveAttachmentEdit}>Save</button>
                                <button type="button" className={btnSecondary()} onClick={() => setEditingAtt(null)}>Cancel</button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
