/**
 * Resources register — fixed assets (equipment / vehicles / construction plant),
 * inventory (materials + stock ledger), rich attachments (rename, expiry, renewals, maintenance cadence).
 */
import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { query } from '../db.js';
import { requireAuth, loadUser, requirePageAccess } from '../middleware/auth.js';

const router = Router();

const uploadsRoot = path.join(process.cwd(), 'uploads', 'resources-register');
const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tenantId = String(req.user?.tenant_id || 'anon');
    const et = String(req.params?.entityType || 'misc').replace(/[^a-z_]/gi, '_');
    const eid = String(req.params?.entityId || 'new');
    const dir = path.join(uploadsRoot, tenantId, et, eid);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const safe = (file.originalname || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});
const uploadMany = multer({ storage: uploadStorage, limits: { fileSize: 40 * 1024 * 1024 } }).fields([
  { name: 'file', maxCount: 1 },
  { name: 'files', maxCount: 40 },
]);

function getRow(row, key) {
  if (!row) return undefined;
  const k = Object.keys(row).find((x) => x && String(x).toLowerCase() === String(key).toLowerCase());
  return k ? row[k] : undefined;
}

function tenantOk(req, tenantId) {
  if (req.user?.role === 'super_admin') return true;
  return tenantId && String(req.user?.tenant_id) === String(tenantId);
}

router.use(requireAuth);
router.use(loadUser);

router.get('/dashboard', requirePageAccess('resources_register'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'No tenant' });

    const assetsByType = await query(
      `SELECT asset_type, COUNT(*) AS c FROM resources_assets WHERE tenant_id = @t GROUP BY asset_type`,
      { t: tenantId }
    );
    const inv = await query(
      `SELECT COUNT(*) AS sku_count, ISNULL(SUM(quantity_on_hand * ISNULL(standard_unit_cost,0)),0) AS stock_value
       FROM resources_inventory_items WHERE tenant_id = @t`,
      { t: tenantId }
    );
    const expInv = await query(
      `SELECT TOP 12 id, name, sku, expiry_date, renewal_reminder_date, quantity_on_hand
       FROM resources_inventory_items WHERE tenant_id = @t AND expiry_date IS NOT NULL
         AND expiry_date <= DATEADD(day, 90, CAST(GETUTCDATE() AS DATE))
       ORDER BY expiry_date`,
      { t: tenantId }
    );
    const expAtt = await query(
      `SELECT TOP 12 a.id, a.display_name, a.expiry_date, a.renewal_date, a.entity_type, a.entity_id
       FROM resources_attachments a WHERE a.tenant_id = @t
         AND (a.expiry_date IS NOT NULL AND a.expiry_date <= DATEADD(day, 90, CAST(GETUTCDATE() AS DATE))
           OR a.renewal_date IS NOT NULL AND a.renewal_date <= DATEADD(day, 60, CAST(GETUTCDATE() AS DATE)))
       ORDER BY ISNULL(a.expiry_date, a.renewal_date)`,
      { t: tenantId }
    );
    const maintAssets = await query(
      `SELECT TOP 12 id, name, asset_code, next_maintenance_due_date, maintenance_interval_days
       FROM resources_assets WHERE tenant_id = @t AND next_maintenance_due_date IS NOT NULL
         AND next_maintenance_due_date <= DATEADD(day, 45, CAST(GETUTCDATE() AS DATE))
       ORDER BY next_maintenance_due_date`,
      { t: tenantId }
    );
    const recentMov = await query(
      `SELECT TOP 15 m.id, m.movement_type, m.quantity_delta, m.movement_date, m.reference_no, i.name AS item_name
       FROM resources_inventory_movements m
       INNER JOIN resources_inventory_items i ON i.id = m.inventory_item_id
       WHERE m.tenant_id = @t ORDER BY m.created_at DESC`,
      { t: tenantId }
    );

    res.json({
      assets_by_type: (assetsByType.recordset || []).map((r) => ({ asset_type: getRow(r, 'asset_type'), count: getRow(r, 'c') })),
      inventory: inv.recordset?.[0] || {},
      expiring_inventory: expInv.recordset || [],
      expiring_attachments: expAtt.recordset || [],
      maintenance_due_assets: maintAssets.recordset || [],
      recent_movements: recentMov.recordset || [],
    });
  } catch (e) {
    next(e);
  }
});

router.get('/assets', requirePageAccess('resources_register'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'No tenant' });
    const type = (req.query.asset_type || '').trim();
    const q = (req.query.search || '').trim();
    let sql = `SELECT a.*, u.full_name AS creator_name FROM resources_assets a
      LEFT JOIN users u ON u.id = a.created_by WHERE a.tenant_id = @t`;
    const params = { t: tenantId };
    if (type) {
      sql += ` AND a.asset_type = @atype`;
      params.atype = type;
    }
    if (q) {
      sql += ` AND (a.name LIKE @q OR a.asset_code LIKE @q OR a.serial_number LIKE @q OR a.registration_number LIKE @q)`;
      params.q = `%${q}%`;
    }
    sql += ` ORDER BY a.updated_at DESC`;
    const r = await query(sql, params);
    res.json({ assets: r.recordset || [] });
  } catch (e) {
    next(e);
  }
});

router.post('/assets', requirePageAccess('resources_register'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'No tenant' });
    const b = req.body || {};
    const types = ['equipment', 'vehicle', 'building_construction'];
    if (!types.includes(b.asset_type)) return res.status(400).json({ error: 'Invalid asset_type' });
    const r = await query(
      `INSERT INTO resources_assets (
        tenant_id, asset_type, name, asset_code, description, status, location_label, site_code,
        acquired_date, cost_value, currency_code, supplier_name, serial_number, manufacturer, model,
        registration_number, vin, year_of_manufacture, odometer_km, fuel_type,
        insurance_policy_ref, insurance_expiry_date, license_disc_expiry_date, warranty_expiry_date,
        certification_name, certification_expiry_date, building_or_structure, trade_category,
        lifting_capacity_t, height_restriction_m, compliance_notes,
        maintenance_interval_days, maintenance_interval_hours, last_maintenance_date, next_maintenance_due_date,
        renewal_reminder_date, custom_fields_json, created_by
      ) OUTPUT INSERTED.*
      VALUES (
        @tenantId, @asset_type, @name, @asset_code, @description, @status, @location_label, @site_code,
        @acquired_date, @cost_value, @currency_code, @supplier_name, @serial_number, @manufacturer, @model,
        @registration_number, @vin, @year_of_manufacture, @odometer_km, @fuel_type,
        @insurance_policy_ref, @insurance_expiry_date, @license_disc_expiry_date, @warranty_expiry_date,
        @certification_name, @certification_expiry_date, @building_or_structure, @trade_category,
        @lifting_capacity_t, @height_restriction_m, @compliance_notes,
        @maintenance_interval_days, @maintenance_interval_hours, @last_maintenance_date, @next_maintenance_due_date,
        @renewal_reminder_date, @custom_fields_json, @created_by
      )`,
      {
        tenantId,
        asset_type: b.asset_type,
        name: String(b.name || '').trim() || 'Unnamed asset',
        asset_code: b.asset_code || null,
        description: b.description || null,
        status: b.status || 'active',
        location_label: b.location_label || null,
        site_code: b.site_code || null,
        acquired_date: b.acquired_date || null,
        cost_value: b.cost_value != null ? Number(b.cost_value) : null,
        currency_code: b.currency_code || 'ZAR',
        supplier_name: b.supplier_name || null,
        serial_number: b.serial_number || null,
        manufacturer: b.manufacturer || null,
        model: b.model || null,
        registration_number: b.registration_number || null,
        vin: b.vin || null,
        year_of_manufacture: b.year_of_manufacture != null ? parseInt(b.year_of_manufacture, 10) : null,
        odometer_km: b.odometer_km != null ? parseInt(b.odometer_km, 10) : null,
        fuel_type: b.fuel_type || null,
        insurance_policy_ref: b.insurance_policy_ref || null,
        insurance_expiry_date: b.insurance_expiry_date || null,
        license_disc_expiry_date: b.license_disc_expiry_date || null,
        warranty_expiry_date: b.warranty_expiry_date || null,
        certification_name: b.certification_name || null,
        certification_expiry_date: b.certification_expiry_date || null,
        building_or_structure: b.building_or_structure || null,
        trade_category: b.trade_category || null,
        lifting_capacity_t: b.lifting_capacity_t != null ? Number(b.lifting_capacity_t) : null,
        height_restriction_m: b.height_restriction_m != null ? Number(b.height_restriction_m) : null,
        compliance_notes: b.compliance_notes || null,
        maintenance_interval_days: b.maintenance_interval_days != null ? parseInt(b.maintenance_interval_days, 10) : null,
        maintenance_interval_hours: b.maintenance_interval_hours != null ? parseInt(b.maintenance_interval_hours, 10) : null,
        last_maintenance_date: b.last_maintenance_date || null,
        next_maintenance_due_date: b.next_maintenance_due_date || null,
        renewal_reminder_date: b.renewal_reminder_date || null,
        custom_fields_json: typeof b.custom_fields_json === 'string' ? b.custom_fields_json : b.custom_fields_json ? JSON.stringify(b.custom_fields_json) : null,
        created_by: req.user.id,
      }
    );
    res.status(201).json({ asset: r.recordset?.[0] });
  } catch (e) {
    next(e);
  }
});

router.get('/assets/:id', requirePageAccess('resources_register'), async (req, res, next) => {
  try {
    const r = await query(`SELECT a.*, u.full_name AS creator_name FROM resources_assets a
      LEFT JOIN users u ON u.id = a.created_by WHERE a.id = @id`, { id: req.params.id });
    const row = r.recordset?.[0];
    if (!row || !tenantOk(req, getRow(row, 'tenant_id'))) return res.status(404).json({ error: 'Not found' });
    res.json({ asset: row });
  } catch (e) {
    next(e);
  }
});

router.patch('/assets/:id', requirePageAccess('resources_register'), async (req, res, next) => {
  try {
    const cur = await query(`SELECT * FROM resources_assets WHERE id = @id`, { id: req.params.id });
    const row = cur.recordset?.[0];
    if (!row || !tenantOk(req, getRow(row, 'tenant_id'))) return res.status(404).json({ error: 'Not found' });
    const b = req.body || {};
    const fields = [
      'name', 'asset_code', 'description', 'status', 'location_label', 'site_code', 'acquired_date', 'cost_value', 'currency_code',
      'supplier_name', 'serial_number', 'manufacturer', 'model', 'registration_number', 'vin', 'year_of_manufacture', 'odometer_km',
      'fuel_type', 'insurance_policy_ref', 'insurance_expiry_date', 'license_disc_expiry_date', 'warranty_expiry_date',
      'certification_name', 'certification_expiry_date', 'building_or_structure', 'trade_category', 'lifting_capacity_t',
      'height_restriction_m', 'compliance_notes', 'maintenance_interval_days', 'maintenance_interval_hours',
      'last_maintenance_date', 'next_maintenance_due_date', 'renewal_reminder_date', 'custom_fields_json',
    ];
    const sets = [];
    const params = { id: req.params.id };
    for (const f of fields) {
      if (b[f] !== undefined) {
        sets.push(`${f} = @${f}`);
        params[f] = f === 'custom_fields_json' && typeof b[f] !== 'string' ? JSON.stringify(b[f]) : b[f];
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'No updates' });
    sets.push('updated_at = SYSUTCDATETIME()');
    await query(`UPDATE resources_assets SET ${sets.join(', ')} WHERE id = @id`, params);
    const out = await query(`SELECT * FROM resources_assets WHERE id = @id`, { id: req.params.id });
    res.json({ asset: out.recordset?.[0] });
  } catch (e) {
    next(e);
  }
});

router.delete('/assets/:id', requirePageAccess('resources_register'), async (req, res, next) => {
  try {
    const cur = await query(`SELECT tenant_id FROM resources_assets WHERE id = @id`, { id: req.params.id });
    const row = cur.recordset?.[0];
    if (!row || !tenantOk(req, getRow(row, 'tenant_id'))) return res.status(404).json({ error: 'Not found' });
    await query(`DELETE FROM resources_assets WHERE id = @id`, { id: req.params.id });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.get('/assets/:id/service-events', requirePageAccess('resources_register'), async (req, res, next) => {
  try {
    const a = await query(`SELECT id, tenant_id FROM resources_assets WHERE id = @id`, { id: req.params.id });
    const row = a.recordset?.[0];
    if (!row || !tenantOk(req, getRow(row, 'tenant_id'))) return res.status(404).json({ error: 'Not found' });
    const r = await query(
      `SELECT e.*, u.full_name AS author_name FROM resources_asset_service_events e
       LEFT JOIN users u ON u.id = e.created_by WHERE e.asset_id = @id ORDER BY e.performed_at DESC, e.created_at DESC`,
      { id: req.params.id }
    );
    res.json({ events: r.recordset || [] });
  } catch (e) {
    next(e);
  }
});

router.post('/assets/:id/service-events', requirePageAccess('resources_register'), async (req, res, next) => {
  try {
    const a = await query(`SELECT id, tenant_id FROM resources_assets WHERE id = @id`, { id: req.params.id });
    const row = a.recordset?.[0];
    if (!row || !tenantOk(req, getRow(row, 'tenant_id'))) return res.status(404).json({ error: 'Not found' });
    const b = req.body || {};
    const tenantId = getRow(row, 'tenant_id');
    const r = await query(
      `INSERT INTO resources_asset_service_events (
        tenant_id, asset_id, event_type, performed_at, meter_reading_km, meter_reading_hours,
        vendor_name, cost_value, next_due_date, description, created_by
      ) OUTPUT INSERTED.*
      VALUES (@tenantId, @assetId, @event_type, @performed_at, @meter_reading_km, @meter_reading_hours,
        @vendor_name, @cost_value, @next_due_date, @description, @created_by)`,
      {
        tenantId,
        assetId: req.params.id,
        event_type: b.event_type || 'maintenance',
        performed_at: b.performed_at || new Date().toISOString().slice(0, 10),
        meter_reading_km: b.meter_reading_km != null ? parseInt(b.meter_reading_km, 10) : null,
        meter_reading_hours: b.meter_reading_hours != null ? parseInt(b.meter_reading_hours, 10) : null,
        vendor_name: b.vendor_name || null,
        cost_value: b.cost_value != null ? Number(b.cost_value) : null,
        next_due_date: b.next_due_date || null,
        description: b.description || null,
        created_by: req.user.id,
      }
    );
    if (b.update_asset_next_due !== false && b.next_due_date) {
      await query(`UPDATE resources_assets SET next_maintenance_due_date = @nd, last_maintenance_date = @pd, updated_at = SYSUTCDATETIME() WHERE id = @id`, {
        nd: b.next_due_date,
        pd: b.performed_at || new Date().toISOString().slice(0, 10),
        id: req.params.id,
      });
    }
    res.status(201).json({ event: r.recordset?.[0] });
  } catch (e) {
    next(e);
  }
});

router.get('/inventory/items', requirePageAccess('resources_register'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'No tenant' });
    const cat = (req.query.category || '').trim();
    const q = (req.query.search || '').trim();
    let sql = `SELECT i.*, u.full_name AS creator_name FROM resources_inventory_items i
      LEFT JOIN users u ON u.id = i.created_by WHERE i.tenant_id = @t`;
    const params = { t: tenantId };
    if (cat) {
      sql += ` AND i.category = @cat`;
      params.cat = cat;
    }
    if (q) {
      sql += ` AND (i.name LIKE @q OR i.sku LIKE @q OR i.part_number LIKE @q)`;
      params.q = `%${q}%`;
    }
    sql += ` ORDER BY i.updated_at DESC`;
    const r = await query(sql, params);
    res.json({ items: r.recordset || [] });
  } catch (e) {
    next(e);
  }
});

router.post('/inventory/items', requirePageAccess('resources_register'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'No tenant' });
    const b = req.body || {};
    const r = await query(
      `INSERT INTO resources_inventory_items (
        tenant_id, sku, name, description, category, unit, quantity_on_hand, reorder_level, economic_order_qty,
        storage_zone, storage_bin, default_supplier, manufacturer, part_number, hazard_class, shelf_life_days,
        received_date, batch_tracking, standard_unit_cost, currency_code, expiry_date, renewal_reminder_date,
        maintenance_interval_days, next_review_date, notes, created_by
      ) OUTPUT INSERTED.*
      VALUES (
        @tenantId, @sku, @name, @description, @category, @unit, @quantity_on_hand, @reorder_level, @economic_order_qty,
        @storage_zone, @storage_bin, @default_supplier, @manufacturer, @part_number, @hazard_class, @shelf_life_days,
        @received_date, @batch_tracking, @standard_unit_cost, @currency_code, @expiry_date, @renewal_reminder_date,
        @maintenance_interval_days, @next_review_date, @notes, @created_by
      )`,
      {
        tenantId,
        sku: b.sku || null,
        name: String(b.name || '').trim() || 'Unnamed item',
        description: b.description || null,
        category: b.category || 'other',
        unit: b.unit || 'ea',
        quantity_on_hand: b.quantity_on_hand != null ? Number(b.quantity_on_hand) : 0,
        reorder_level: b.reorder_level != null ? Number(b.reorder_level) : null,
        economic_order_qty: b.economic_order_qty != null ? Number(b.economic_order_qty) : null,
        storage_zone: b.storage_zone || null,
        storage_bin: b.storage_bin || null,
        default_supplier: b.default_supplier || null,
        manufacturer: b.manufacturer || null,
        part_number: b.part_number || null,
        hazard_class: b.hazard_class || null,
        shelf_life_days: b.shelf_life_days != null ? parseInt(b.shelf_life_days, 10) : null,
        received_date: b.received_date || null,
        batch_tracking: b.batch_tracking ? 1 : 0,
        standard_unit_cost: b.standard_unit_cost != null ? Number(b.standard_unit_cost) : null,
        currency_code: b.currency_code || 'ZAR',
        expiry_date: b.expiry_date || null,
        renewal_reminder_date: b.renewal_reminder_date || null,
        maintenance_interval_days: b.maintenance_interval_days != null ? parseInt(b.maintenance_interval_days, 10) : null,
        next_review_date: b.next_review_date || null,
        notes: b.notes || null,
        created_by: req.user.id,
      }
    );
    res.status(201).json({ item: r.recordset?.[0] });
  } catch (e) {
    next(e);
  }
});

router.get('/inventory/items/:id', requirePageAccess('resources_register'), async (req, res, next) => {
  try {
    const r = await query(`SELECT i.*, u.full_name AS creator_name FROM resources_inventory_items i
      LEFT JOIN users u ON u.id = i.created_by WHERE i.id = @id`, { id: req.params.id });
    const row = r.recordset?.[0];
    if (!row || !tenantOk(req, getRow(row, 'tenant_id'))) return res.status(404).json({ error: 'Not found' });
    res.json({ item: row });
  } catch (e) {
    next(e);
  }
});

router.patch('/inventory/items/:id', requirePageAccess('resources_register'), async (req, res, next) => {
  try {
    const cur = await query(`SELECT * FROM resources_inventory_items WHERE id = @id`, { id: req.params.id });
    const row = cur.recordset?.[0];
    if (!row || !tenantOk(req, getRow(row, 'tenant_id'))) return res.status(404).json({ error: 'Not found' });
    const b = req.body || {};
    const fields = [
      'sku', 'name', 'description', 'category', 'unit', 'quantity_on_hand', 'reorder_level', 'economic_order_qty',
      'storage_zone', 'storage_bin', 'default_supplier', 'manufacturer', 'part_number', 'hazard_class', 'shelf_life_days',
      'received_date', 'batch_tracking', 'standard_unit_cost', 'currency_code', 'expiry_date', 'renewal_reminder_date',
      'maintenance_interval_days', 'next_review_date', 'notes', 'last_count_date',
    ];
    const sets = [];
    const params = { id: req.params.id };
    for (const f of fields) {
      if (b[f] !== undefined) {
        sets.push(`${f} = @${f}`);
        params[f] = f === 'batch_tracking' ? (b[f] ? 1 : 0) : b[f];
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'No updates' });
    sets.push('updated_at = SYSUTCDATETIME()');
    await query(`UPDATE resources_inventory_items SET ${sets.join(', ')} WHERE id = @id`, params);
    const out = await query(`SELECT * FROM resources_inventory_items WHERE id = @id`, { id: req.params.id });
    res.json({ item: out.recordset?.[0] });
  } catch (e) {
    next(e);
  }
});

router.delete('/inventory/items/:id', requirePageAccess('resources_register'), async (req, res, next) => {
  try {
    const cur = await query(`SELECT tenant_id FROM resources_inventory_items WHERE id = @id`, { id: req.params.id });
    const row = cur.recordset?.[0];
    if (!row || !tenantOk(req, getRow(row, 'tenant_id'))) return res.status(404).json({ error: 'Not found' });
    await query(`DELETE FROM resources_inventory_items WHERE id = @id`, { id: req.params.id });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.get('/inventory/items/:id/movements', requirePageAccess('resources_register'), async (req, res, next) => {
  try {
    const it = await query(`SELECT id, tenant_id FROM resources_inventory_items WHERE id = @id`, { id: req.params.id });
    const row = it.recordset?.[0];
    if (!row || !tenantOk(req, getRow(row, 'tenant_id'))) return res.status(404).json({ error: 'Not found' });
    const r = await query(
      `SELECT m.*, u.full_name AS author_name FROM resources_inventory_movements m
       LEFT JOIN users u ON u.id = m.created_by WHERE m.inventory_item_id = @id ORDER BY m.movement_date DESC, m.created_at DESC`,
      { id: req.params.id }
    );
    res.json({ movements: r.recordset || [] });
  } catch (e) {
    next(e);
  }
});

router.post('/inventory/items/:id/movements', requirePageAccess('resources_register'), async (req, res, next) => {
  try {
    const it = await query(`SELECT id, tenant_id, quantity_on_hand FROM resources_inventory_items WHERE id = @id`, { id: req.params.id });
    const row = it.recordset?.[0];
    if (!row || !tenantOk(req, getRow(row, 'tenant_id'))) return res.status(404).json({ error: 'Not found' });
    const b = req.body || {};
    const delta = Number(b.quantity_delta);
    if (!Number.isFinite(delta) || delta === 0) return res.status(400).json({ error: 'quantity_delta required' });
    const mtype = b.movement_type || 'receive';
    const tenantId = getRow(row, 'tenant_id');
    const ins = await query(
      `INSERT INTO resources_inventory_movements (
        tenant_id, inventory_item_id, movement_type, quantity_delta, unit_cost, reference_no, supplier, batch_code, expiry_date, notes, movement_date, created_by
      ) OUTPUT INSERTED.*
      VALUES (@tenantId, @iid, @mtype, @delta, @unit_cost, @reference_no, @supplier, @batch_code, @expiry_date, @notes, @movement_date, @created_by)`,
      {
        tenantId,
        iid: req.params.id,
        mtype,
        delta,
        unit_cost: b.unit_cost != null ? Number(b.unit_cost) : null,
        reference_no: b.reference_no || null,
        supplier: b.supplier || null,
        batch_code: b.batch_code || null,
        expiry_date: b.expiry_date || null,
        notes: b.notes || null,
        movement_date: b.movement_date || new Date().toISOString().slice(0, 10),
        created_by: req.user.id,
      }
    );
    await query(
      `UPDATE resources_inventory_items SET quantity_on_hand = quantity_on_hand + @d, updated_at = SYSUTCDATETIME() WHERE id = @id AND tenant_id = @t`,
      { d: delta, id: req.params.id, t: tenantId }
    );
    res.status(201).json({ movement: ins.recordset?.[0] });
  } catch (e) {
    next(e);
  }
});

router.get('/attachments', requirePageAccess('resources_register'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'No tenant' });
    const entityType = (req.query.entity_type || '').trim();
    const entityId = (req.query.entity_id || '').trim();
    if (!entityType || !entityId) return res.status(400).json({ error: 'entity_type and entity_id required' });
    if (!['asset', 'inventory_item'].includes(entityType)) return res.status(400).json({ error: 'Invalid entity_type' });
    const r = await query(
      `SELECT a.*, u.full_name AS author_name FROM resources_attachments a
       LEFT JOIN users u ON u.id = a.uploaded_by
       WHERE a.tenant_id = @t AND a.entity_type = @et AND a.entity_id = @eid ORDER BY a.created_at DESC`,
      { t: tenantId, et: entityType, eid: entityId }
    );
    res.json({ attachments: r.recordset || [] });
  } catch (e) {
    next(e);
  }
});

router.post('/attachments/:entityType/:entityId', requirePageAccess('resources_register'), uploadMany, async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'No tenant' });
    const entityType = (req.params.entityType || '').trim();
    const entityId = (req.params.entityId || '').trim();
    if (!entityType || !entityId) return res.status(400).json({ error: 'entity_type and entity_id required' });
    if (!['asset', 'inventory_item'].includes(entityType)) return res.status(400).json({ error: 'Invalid entity_type' });
    if (entityType === 'asset') {
      const a = await query(`SELECT id FROM resources_assets WHERE id = @id AND tenant_id = @t`, { id: entityId, t: tenantId });
      if (!a.recordset?.length) return res.status(404).json({ error: 'Asset not found' });
    } else {
      const a = await query(`SELECT id FROM resources_inventory_items WHERE id = @id AND tenant_id = @t`, { id: entityId, t: tenantId });
      if (!a.recordset?.length) return res.status(404).json({ error: 'Inventory item not found' });
    }
    const files = []
      .concat(req.files?.files || [])
      .concat(req.files?.file || [])
      .filter(Boolean);
    if (!files.length) return res.status(400).json({ error: 'No files' });
    const created = [];
    for (const f of files) {
      const orig = f.originalname || 'file';
      const displayName = (req.body?.[`display_name_${f.fieldname}`] || req.body?.display_name || orig).toString().slice(0, 500);
      const r = await query(
        `INSERT INTO resources_attachments (
          tenant_id, entity_type, entity_id, file_name, display_name, file_path, mime_type, file_size_bytes,
          document_category, expiry_date, renewal_date, maintenance_interval_days, notes, uploaded_by
        ) OUTPUT INSERTED.*
        VALUES (@tenantId, @et, @eid, @fname, @dname, @path, @mime, @size, @dcat, @exp, @ren, @maint, @notes, @uid)`,
        {
          tenantId,
          et: entityType,
          eid: entityId,
          fname: orig,
          dname: displayName,
          path: f.path,
          mime: f.mimetype || null,
          size: f.size || null,
          dcat: req.body?.document_category || null,
          exp: req.body?.expiry_date || null,
          ren: req.body?.renewal_date || null,
          maint: req.body?.maintenance_interval_days != null ? parseInt(req.body.maintenance_interval_days, 10) : null,
          notes: req.body?.notes || null,
          uid: req.user.id,
        }
      );
      created.push(r.recordset?.[0]);
    }
    res.status(201).json({ attachments: created });
  } catch (e) {
    next(e);
  }
});

router.patch('/attachments/:id', requirePageAccess('resources_register'), async (req, res, next) => {
  try {
    const cur = await query(`SELECT * FROM resources_attachments WHERE id = @id`, { id: req.params.id });
    const row = cur.recordset?.[0];
    if (!row || !tenantOk(req, getRow(row, 'tenant_id'))) return res.status(404).json({ error: 'Not found' });
    const b = req.body || {};
    const fields = ['display_name', 'document_category', 'expiry_date', 'renewal_date', 'maintenance_interval_days', 'notes'];
    const sets = [];
    const params = { id: req.params.id };
    for (const f of fields) {
      if (b[f] !== undefined) {
        sets.push(`${f} = @${f}`);
        params[f] = f === 'maintenance_interval_days' && b[f] !== null ? parseInt(b[f], 10) : b[f];
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'No updates' });
    sets.push('updated_at = SYSUTCDATETIME()');
    await query(`UPDATE resources_attachments SET ${sets.join(', ')} WHERE id = @id`, params);
    const out = await query(`SELECT * FROM resources_attachments WHERE id = @id`, { id: req.params.id });
    res.json({ attachment: out.recordset?.[0] });
  } catch (e) {
    next(e);
  }
});

router.delete('/attachments/:id', requirePageAccess('resources_register'), async (req, res, next) => {
  try {
    const cur = await query(`SELECT file_path, tenant_id FROM resources_attachments WHERE id = @id`, { id: req.params.id });
    const row = cur.recordset?.[0];
    if (!row || !tenantOk(req, getRow(row, 'tenant_id'))) return res.status(404).json({ error: 'Not found' });
    const fp = getRow(row, 'file_path');
    await query(`DELETE FROM resources_attachments WHERE id = @id`, { id: req.params.id });
    try {
      if (fp && fs.existsSync(fp)) fs.unlinkSync(fp);
    } catch (_) {}
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.get('/attachments/:id/download', requirePageAccess('resources_register'), async (req, res, next) => {
  try {
    const cur = await query(`SELECT file_path, file_name, display_name, tenant_id FROM resources_attachments WHERE id = @id`, { id: req.params.id });
    const row = cur.recordset?.[0];
    if (!row || !tenantOk(req, getRow(row, 'tenant_id'))) return res.status(404).json({ error: 'Not found' });
    const fp = getRow(row, 'file_path');
    if (!fp || !fs.existsSync(fp)) return res.status(404).json({ error: 'File missing' });
    const downloadName = getRow(row, 'display_name') || getRow(row, 'file_name') || 'download';
    res.download(fp, downloadName);
  } catch (e) {
    next(e);
  }
});

export default router;
