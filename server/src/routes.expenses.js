// Expense Tracking API — Project -> Weekly entry -> payroll + expense line items.
// Weekly buckets. Each week holds four payroll figures ($ + hours):
//   own Electrical, own Mechanical, Staffing Electrical, Staffing Mechanical
// plus expense line items. Materials line items are split by trade via the
// categories "Materials – Electrical" and "Materials – Mechanical".
// Rolls up per week, per project (vs. per-category budgets), with category and
// weekly-trend breakdowns for the dashboard.
import express from 'express';
import crypto from 'crypto';
import db from './db.js';
import { authRequired, appReadRequired, appEditRequired } from './auth.js';

const router = express.Router();
const id = () => crypto.randomBytes(12).toString('hex');
const now = () => new Date().toISOString();
const num = (v) => { const n = Number(v); return isNaN(n) ? 0 : n; };

// Trade of a cost: 'Electrical' | 'Mechanical' | null (unassigned).
function normTrade(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return null;
  if (s.startsWith('e')) return 'Electrical';
  if (s.startsWith('m')) return 'Mechanical';
  return null;
}
// Materials categories carry their trade in the name; other lines use their own trade field.
function itemTrade(it) {
  if (it.category === 'Materials – Electrical') return 'Electrical';
  if (it.category === 'Materials – Mechanical') return 'Mechanical';
  return normTrade(it.trade);
}

// Normalize a pasted date to YYYY-MM-DD so the HTML date input can render it.
// Accepts YYYY-MM-DD, M/D/YYYY, M/D/YY, with stray whitespace / carriage returns.
function normDate(v) {
  if (v == null) return '';
  let s = String(v).replace(/[\r\n]/g, '').trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${String(+m[2]).padStart(2,'0')}-${String(+m[3]).padStart(2,'0')}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let [, mo, da, yr] = m; yr = +yr < 100 ? 2000 + +yr : +yr;
    return `${yr}-${String(+mo).padStart(2,'0')}-${String(+da).padStart(2,'0')}`;
  }
  return s; // leave anything unrecognized untouched
}

router.use(authRequired);
router.use(appReadRequired('expenses'));

// Line-item categories always available in the UI. Payroll (own + staffing) is
// handled by dedicated week fields, not line items.
const BASE_CATEGORIES = ['Materials – Electrical', 'Materials – Mechanical', 'Equipment Rental', 'Other'];

function weekTotals(week, items) {
  const payroll = num(week.elec_pay) + num(week.mech_pay) + num(week.staff_elec_pay) + num(week.staff_mech_pay);
  const itemsTotal = items.reduce((s, it) => s + num(it.amount), 0);
  return {
    payroll,
    items_total: itemsTotal,
    total: payroll + itemsTotal,
    hours: num(week.elec_hours) + num(week.mech_hours) + num(week.staff_elec_hours) + num(week.staff_mech_hours),
  };
}

function buildSummary(projectId) {
  const projects = projectId
    ? db.prepare('SELECT * FROM expense_projects WHERE id = ? AND archived = 0').all(projectId)
    : db.prepare('SELECT * FROM expense_projects WHERE archived = 0 ORDER BY sort_order, name').all();

  const out = [];
  for (const p of projects) {
    const weeks = db.prepare('SELECT * FROM expense_weeks WHERE project_id = ? ORDER BY week_ending ASC').all(p.id);
    const weekOut = [];
    let projTotal = 0, projPayroll = 0, projItems = 0, projHours = 0;
    let elecPay = 0, mechPay = 0, staffElecPay = 0, staffMechPay = 0;
    const categoryTotals = {};

    for (const w of weeks) {
      const items = db.prepare('SELECT * FROM expense_items WHERE week_id = ? ORDER BY sort_order, created_date').all(w.id);
      const t = weekTotals(w, items);
      projTotal += t.total; projPayroll += t.payroll; projItems += t.items_total; projHours += t.hours;
      elecPay += num(w.elec_pay); mechPay += num(w.mech_pay);
      staffElecPay += num(w.staff_elec_pay); staffMechPay += num(w.staff_mech_pay);
      // Category rollup: the four payroll buckets + line items by their category.
      categoryTotals['Payroll – Electrical'] = (categoryTotals['Payroll – Electrical'] || 0) + num(w.elec_pay);
      categoryTotals['Payroll – Mechanical'] = (categoryTotals['Payroll – Mechanical'] || 0) + num(w.mech_pay);
      categoryTotals['Staffing – Electrical'] = (categoryTotals['Staffing – Electrical'] || 0) + num(w.staff_elec_pay);
      categoryTotals['Staffing – Mechanical'] = (categoryTotals['Staffing – Mechanical'] || 0) + num(w.staff_mech_pay);
      for (const it of items) categoryTotals[it.category] = (categoryTotals[it.category] || 0) + num(it.amount);
      weekOut.push({ ...w, items, totals: t });
    }

    // Spend per budgeted category.
    const spend = {
      elec: elecPay, mech: mechPay,
      staff_elec: staffElecPay, staff_mech: staffMechPay,
      materials_elec: categoryTotals['Materials – Electrical'] || 0,
      materials_mech: categoryTotals['Materials – Mechanical'] || 0,
      rental: categoryTotals['Equipment Rental'] || 0,
      other: categoryTotals['Other'] || 0,
    };
    // Equipment rentals (computed up front so cost folds into spend + total).
    const rentalRows = db.prepare('SELECT * FROM expense_rentals WHERE project_id = ? ORDER BY sort_order, date_delivered').all(p.id);
    const rentalCost = rentalRows.reduce((s, x) => s + num(x.cost), 0);
    const rentalTotals = {
      count: rentalRows.length,
      out: rentalRows.filter((x) => !x.date_returned).length,
      cost: rentalCost,
    };
    // Rental costs count toward Equipment Rental spend and the project total.
    projTotal += rentalCost;
    spend.rental += rentalCost;

    const catSpend = (label, sp) => ({ label, spend: sp });

    // ---- Per-trade spend: payroll + staffing + materials + trade-tagged lines/rentals ----
    const tradeSpend = { Electrical: elecPay + staffElecPay, Mechanical: mechPay + staffMechPay, Unassigned: 0 };
    for (const w of weekOut) for (const it of w.items) tradeSpend[itemTrade(it) || 'Unassigned'] += num(it.amount);
    for (const r of rentalRows) tradeSpend[normTrade(r.trade) || 'Unassigned'] += num(r.cost);

    // Change orders (computed up front so their $ can be folded into the budget).
    const coRows = db.prepare('SELECT * FROM expense_change_orders WHERE project_id = ? ORDER BY sort_order, co_date').all(p.id);
    const coTotals = {
      count: coRows.length,
      man_hours: coRows.reduce((s, c) => s + num(c.man_hours), 0),
      equipment_total: coRows.reduce((s, c) => s + num(c.equipment_total), 0),
      total: coRows.reduce((s, c) => s + num(c.total), 0),
    };
    // Budgets are set per trade. Change orders raise the budget of their trade
    // (unassigned COs raise only the overall budget). Projects created before the
    // split keep their single overall budget until both trade budgets are entered.
    const coByTrade = { Electrical: 0, Mechanical: 0, Unassigned: 0 };
    for (const c of coRows) coByTrade[normTrade(c.trade) || 'Unassigned'] += num(c.total);
    const baseElec = num(p.budget_elec), baseMech = num(p.budget_mech);
    const splitNeeded = baseElec === 0 && baseMech === 0 && num(p.budget_total) > 0;
    const baseBudget = splitNeeded ? num(p.budget_total) : baseElec + baseMech;
    const budgetTotal = baseBudget + coTotals.total;
    const elecHoursOwn = weeks.reduce((s, w) => s + num(w.elec_hours), 0);
    const elecHoursStaff = weeks.reduce((s, w) => s + num(w.staff_elec_hours), 0);
    const mechHoursOwn = weeks.reduce((s, w) => s + num(w.mech_hours), 0);
    const mechHoursStaff = weeks.reduce((s, w) => s + num(w.staff_mech_hours), 0);
    const tradeBlock = (name, base, ownHours, staffHours, payroll) => {
      const budget = base + coByTrade[name];
      const spend = tradeSpend[name];
      return {
        base_budget: base, change_orders: coByTrade[name], budget, spend,
        remaining: budget - spend,
        pct: budget > 0 ? Math.round((spend / budget) * 100) : 0,
        payroll,
        hours: ownHours + staffHours, own_hours: ownHours, staff_hours: staffHours,
      };
    };
    const trades = {
      elec: tradeBlock('Electrical', baseElec, elecHoursOwn, elecHoursStaff, elecPay + staffElecPay),
      mech: tradeBlock('Mechanical', baseMech, mechHoursOwn, mechHoursStaff, mechPay + staffMechPay),
      unassigned: { spend: tradeSpend.Unassigned, change_orders: coByTrade.Unassigned },
      budget_split_needed: splitNeeded,
    };

    out.push({
      ...p,
      weeks: weekOut,
      week_count: weekOut.length,
      change_orders: { list: coRows, totals: coTotals },
      rentals: { list: rentalRows, totals: rentalTotals },
      purchase_orders: (() => {
        const pos = db.prepare('SELECT * FROM expense_purchase_orders WHERE project_id = ? ORDER BY sort_order, created_date').all(p.id);
        const received = pos.reduce((s, o) => s + num(o.amount), 0);
        const paid = pos.filter((o) => o.paid).reduce((s, o) => s + num(o.amount), 0);
        return {
          list: pos.map((o) => ({ ...o, paid: !!o.paid })),
          totals: {
            count: pos.length,
            received,                 // total PO $ awarded
            paid,                     // PO $ marked paid
            unpaid: received - paid,
          },
        };
      })(),
      totals: {
        total: projTotal, payroll: projPayroll, items_total: projItems, hours: projHours,
        elec_pay: elecPay, mech_pay: mechPay, staff_elec_pay: staffElecPay, staff_mech_pay: staffMechPay,
        cost_per_hour: projHours > 0 ? projTotal / projHours : 0,
        budget: budgetTotal,
        base_budget: baseBudget,
        budget_remaining: budgetTotal > 0 ? budgetTotal - projTotal : 0,
        budget_pct: budgetTotal > 0 ? Math.round((projTotal / budgetTotal) * 100) : 0,
      },
      trades,
      budgets: {
        elec: catSpend('Electrical Payroll', spend.elec),
        mech: catSpend('Mechanical Payroll', spend.mech),
        staff_elec: catSpend('Staffing – Electrical', spend.staff_elec),
        staff_mech: catSpend('Staffing – Mechanical', spend.staff_mech),
        materials_elec: catSpend('Materials – Electrical', spend.materials_elec),
        materials_mech: catSpend('Materials – Mechanical', spend.materials_mech),
        rental: catSpend('Equipment Rental', spend.rental),
        other: catSpend('Other', spend.other),
      },
      category_totals: categoryTotals,
      trend: weekOut.map((w) => ({ week_ending: w.week_ending, total: w.totals.total })),
    });
  }
  return out;
}

// ===== Summary =====
router.get('/summary', (req, res) => { res.json(buildSummary(req.query.project || null)); });

// ===== Categories =====
router.get('/categories', (_req, res) => {
  const custom = db.prepare('SELECT name FROM expense_categories ORDER BY name').all().map((r) => r.name);
  res.json([...BASE_CATEGORIES, ...custom.filter((c) => !BASE_CATEGORIES.includes(c))]);
});
router.post('/categories', appEditRequired('expenses'), (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name required' });
  if (BASE_CATEGORIES.includes(name)) return res.json({ ok: true });
  if (!db.prepare('SELECT id FROM expense_categories WHERE name = ?').get(name)) {
    db.prepare('INSERT INTO expense_categories (id, name, created_date) VALUES (?,?,?)').run(id(), name, now());
  }
  res.json({ ok: true, name });
});

// ===== Projects =====
const PROJECT_BUDGET_COLS = ['budget_elec', 'budget_mech', 'budget_total'];
// Overall budget is always Electrical + Mechanical once either is set.
const syncTotal = (row) => { if (num(row.budget_elec) || num(row.budget_mech)) row.budget_total = num(row.budget_elec) + num(row.budget_mech); return row; };

router.get('/projects', (_req, res) => {
  res.json(db.prepare('SELECT * FROM expense_projects WHERE archived = 0 ORDER BY sort_order, name').all());
});

router.post('/projects', appEditRequired('expenses'), (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name required' });
  const maxRow = db.prepare('SELECT MAX(sort_order) AS m FROM expense_projects').get();
  const row = {
    id: id(), name, archived: 0,
    sort_order: (maxRow && maxRow.m != null ? maxRow.m : -1) + 1,
    created_by: req.user?.email || null, created_date: now(), updated_date: now(),
  };
  for (const c of PROJECT_BUDGET_COLS) row[c] = num(req.body?.[c]);
  syncTotal(row);
  const cols = ['id', 'name', ...PROJECT_BUDGET_COLS, 'archived', 'sort_order', 'created_by', 'created_date', 'updated_date'];
  db.prepare(`INSERT INTO expense_projects (${cols.join(',')}) VALUES (${cols.map((c) => '@' + c).join(',')})`).run(row);
  res.json(row);
});

router.put('/projects/:id', appEditRequired('expenses'), (req, res) => {
  const p = db.prepare('SELECT * FROM expense_projects WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {};
  const name = b.name != null ? String(b.name).trim() : p.name;
  const archived = b.archived != null ? (b.archived ? 1 : 0) : p.archived;
  const next = syncTotal(Object.fromEntries(PROJECT_BUDGET_COLS.map((c) => [c, b[c] != null ? num(b[c]) : p[c]])));
  const vals = PROJECT_BUDGET_COLS.map((c) => next[c]);
  db.prepare(`UPDATE expense_projects SET name=?, ${PROJECT_BUDGET_COLS.map((c) => c + '=?').join(', ')}, archived=?, updated_date=? WHERE id=?`)
    .run(name, ...vals, archived, now(), p.id);
  res.json(db.prepare('SELECT * FROM expense_projects WHERE id = ?').get(p.id));
});

router.delete('/projects/:id', appEditRequired('expenses'), (req, res) => {
  const p = db.prepare('SELECT * FROM expense_projects WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  const weeks = db.prepare('SELECT id FROM expense_weeks WHERE project_id = ?').all(p.id);
  const delItems = db.prepare('DELETE FROM expense_items WHERE week_id = ?');
  const tx = db.transaction(() => {
    for (const w of weeks) delItems.run(w.id);
    db.prepare('DELETE FROM expense_weeks WHERE project_id = ?').run(p.id);
    db.prepare('DELETE FROM expense_projects WHERE id = ?').run(p.id);
  });
  tx();
  res.json({ ok: true });
});

// ===== Weeks =====
const WEEK_PAY_COLS = ['elec_pay', 'elec_hours', 'mech_pay', 'mech_hours', 'staff_elec_pay', 'staff_elec_hours', 'staff_mech_pay', 'staff_mech_hours'];

function insertWeek(project_id, body, user) {
  const row = {
    id: id(), project_id, week_ending: normDate(body.week_ending),
    notes: (body.notes || '').trim() || null,
    created_by: user || null, updated_by: user || null, created_date: now(), updated_date: now(),
  };
  for (const c of WEEK_PAY_COLS) row[c] = num(body[c]);
  const cols = ['id', 'project_id', 'week_ending', ...WEEK_PAY_COLS, 'notes', 'created_by', 'updated_by', 'created_date', 'updated_date'];
  db.prepare(`INSERT INTO expense_weeks (${cols.join(',')}) VALUES (${cols.map((c) => '@' + c).join(',')})`).run(row);
  return row;
}

router.post('/weeks', appEditRequired('expenses'), (req, res) => {
  const project_id = req.body?.project_id;
  const week_ending = (req.body?.week_ending || '').trim();
  if (!project_id || !week_ending) return res.status(400).json({ error: 'project_id and week_ending required' });
  if (!db.prepare('SELECT id FROM expense_projects WHERE id = ?').get(project_id)) return res.status(400).json({ error: 'Invalid project' });
  res.json(insertWeek(project_id, req.body, req.user?.email));
});

router.put('/weeks/:id', appEditRequired('expenses'), (req, res) => {
  const w = db.prepare('SELECT * FROM expense_weeks WHERE id = ?').get(req.params.id);
  if (!w) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {};
  const week_ending = b.week_ending != null ? normDate(b.week_ending) : w.week_ending;
  const notes = b.notes != null ? (String(b.notes).trim() || null) : w.notes;
  const vals = WEEK_PAY_COLS.map((c) => (b[c] != null ? num(b[c]) : w[c]));
  db.prepare(`UPDATE expense_weeks SET week_ending=?, ${WEEK_PAY_COLS.map((c) => c + '=?').join(', ')}, notes=?, updated_by=?, updated_date=? WHERE id=?`)
    .run(week_ending, ...vals, notes, req.user?.email || null, now(), w.id);
  res.json(db.prepare('SELECT * FROM expense_weeks WHERE id = ?').get(w.id));
});

router.delete('/weeks/:id', appEditRequired('expenses'), (req, res) => {
  const w = db.prepare('SELECT * FROM expense_weeks WHERE id = ?').get(req.params.id);
  if (!w) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM expense_items WHERE week_id = ?').run(w.id);
  db.prepare('DELETE FROM expense_weeks WHERE id = ?').run(w.id);
  res.json({ ok: true });
});

// ===== Bulk import: paste weekly totals -> create many weeks at once =====
// Body: { project_id, rows: [{ week_ending, elec_pay, elec_hours, mech_pay,
//   mech_hours, staff_elec_pay, staff_elec_hours, staff_mech_pay,
//   staff_mech_hours, materials_elec, materials_mech, rental, other, notes }] }
// materials_elec / materials_mech / rental / other become expense line items.
router.post('/import', appEditRequired('expenses'), (req, res) => {
  const project_id = req.body?.project_id;
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!project_id) return res.status(400).json({ error: 'project_id required' });
  if (!db.prepare('SELECT id FROM expense_projects WHERE id = ?').get(project_id)) return res.status(400).json({ error: 'Invalid project' });
  if (!rows.length) return res.status(400).json({ error: 'No rows to import' });

  const insertItem = db.prepare(`INSERT INTO expense_items (id,week_id,category,description,amount,sort_order,created_date,updated_date)
    VALUES (@id,@week_id,@category,@description,@amount,@sort_order,@created_date,@updated_date)`);
  let created = 0;
  const tx = db.transaction(() => {
    for (const r of rows) {
      const we = normDate(r.week_ending);
      if (!we) continue;
      const week = insertWeek(project_id, r, req.user?.email);
      created++;
      const lineDefs = [
        ['Materials – Electrical', r.materials_elec],
        ['Materials – Mechanical', r.materials_mech],
        ['Equipment Rental', r.rental],
        ['Other', r.other],
      ];
      let so = 0;
      for (const [cat, amt] of lineDefs) {
        const a = num(amt);
        if (a) insertItem.run({ id: id(), week_id: week.id, category: cat, description: null, amount: a, sort_order: so++, created_date: now(), updated_date: now() });
      }
    }
  });
  tx();
  res.json({ ok: true, weeks_created: created });
});

// ===== Expense line items =====
router.post('/items', appEditRequired('expenses'), (req, res) => {
  const week_id = req.body?.week_id;
  const category = (req.body?.category || '').trim();
  if (!week_id || !category) return res.status(400).json({ error: 'week_id and category required' });
  if (!db.prepare('SELECT id FROM expense_weeks WHERE id = ?').get(week_id)) return res.status(400).json({ error: 'Invalid week' });
  const maxRow = db.prepare('SELECT MAX(sort_order) AS m FROM expense_items WHERE week_id = ?').get(week_id);
  const row = {
    id: id(), week_id, category,
    description: (req.body?.description || '').trim() || null,
    amount: num(req.body?.amount),
    trade: normTrade(req.body?.trade),
    sort_order: (maxRow && maxRow.m != null ? maxRow.m : -1) + 1,
    created_date: now(), updated_date: now(),
  };
  db.prepare(`INSERT INTO expense_items (id,week_id,category,description,amount,trade,sort_order,created_date,updated_date)
    VALUES (@id,@week_id,@category,@description,@amount,@trade,@sort_order,@created_date,@updated_date)`).run(row);
  res.json(row);
});

router.put('/items/:id', appEditRequired('expenses'), (req, res) => {
  const it = db.prepare('SELECT * FROM expense_items WHERE id = ?').get(req.params.id);
  if (!it) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {};
  const category = b.category != null ? String(b.category).trim() : it.category;
  const description = b.description != null ? (String(b.description).trim() || null) : it.description;
  const amount = b.amount != null ? num(b.amount) : it.amount;
  const trade = b.trade !== undefined ? normTrade(b.trade) : it.trade;
  db.prepare('UPDATE expense_items SET category=?, description=?, amount=?, trade=?, updated_date=? WHERE id=?')
    .run(category, description, amount, trade, now(), it.id);
  res.json(db.prepare('SELECT * FROM expense_items WHERE id = ?').get(it.id));
});

router.delete('/items/:id', appEditRequired('expenses'), (req, res) => {
  const it = db.prepare('SELECT * FROM expense_items WHERE id = ?').get(req.params.id);
  if (!it) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM expense_items WHERE id = ?').run(it.id);
  res.json({ ok: true });
});

// ===== Change Orders (tracked separately, per project) =====
const CO_COLS = ['co_number', 'co_date', 'trade', 'man_hours', 'equipment_total', 'total', 'notes'];

router.post('/change-orders', appEditRequired('expenses'), (req, res) => {
  const project_id = req.body?.project_id;
  if (!project_id) return res.status(400).json({ error: 'project_id required' });
  if (!db.prepare('SELECT id FROM expense_projects WHERE id = ?').get(project_id)) return res.status(400).json({ error: 'Invalid project' });
  const maxRow = db.prepare('SELECT MAX(sort_order) AS m FROM expense_change_orders WHERE project_id = ?').get(project_id);
  const row = {
    id: id(), project_id,
    co_number: (req.body?.co_number || '').trim() || null,
    co_date: req.body?.co_date || null,
    trade: normTrade(req.body?.trade),
    man_hours: num(req.body?.man_hours),
    equipment_total: num(req.body?.equipment_total),
    total: num(req.body?.total),
    notes: (req.body?.notes || '').trim() || null,
    sort_order: (maxRow && maxRow.m != null ? maxRow.m : -1) + 1,
    created_by: req.user?.email || null, updated_by: req.user?.email || null,
    created_date: now(), updated_date: now(),
  };
  const cols = ['id', 'project_id', ...CO_COLS, 'sort_order', 'created_by', 'updated_by', 'created_date', 'updated_date'];
  db.prepare(`INSERT INTO expense_change_orders (${cols.join(',')}) VALUES (${cols.map((c) => '@' + c).join(',')})`).run(row);
  res.json(row);
});

router.put('/change-orders/:id', appEditRequired('expenses'), (req, res) => {
  const co = db.prepare('SELECT * FROM expense_change_orders WHERE id = ?').get(req.params.id);
  if (!co) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {};
  const co_number = b.co_number != null ? (String(b.co_number).trim() || null) : co.co_number;
  const co_date = b.co_date !== undefined ? (b.co_date || null) : co.co_date;
  const man_hours = b.man_hours != null ? num(b.man_hours) : co.man_hours;
  const equipment_total = b.equipment_total != null ? num(b.equipment_total) : co.equipment_total;
  const total = b.total != null ? num(b.total) : co.total;
  const notes = b.notes != null ? (String(b.notes).trim() || null) : co.notes;
  const trade = b.trade !== undefined ? normTrade(b.trade) : co.trade;
  db.prepare('UPDATE expense_change_orders SET co_number=?, co_date=?, trade=?, man_hours=?, equipment_total=?, total=?, notes=?, updated_by=?, updated_date=? WHERE id=?')
    .run(co_number, co_date, trade, man_hours, equipment_total, total, notes, req.user?.email || null, now(), co.id);
  res.json(db.prepare('SELECT * FROM expense_change_orders WHERE id = ?').get(co.id));
});

router.delete('/change-orders/:id', appEditRequired('expenses'), (req, res) => {
  const co = db.prepare('SELECT * FROM expense_change_orders WHERE id = ?').get(req.params.id);
  if (!co) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM expense_change_orders WHERE id = ?').run(co.id);
  res.json({ ok: true });
});

// ===== Purchase Orders (money awarded/received, per project) =====
router.post('/purchase-orders', appEditRequired('expenses'), (req, res) => {
  const project_id = req.body?.project_id;
  if (!project_id) return res.status(400).json({ error: 'project_id required' });
  if (!db.prepare('SELECT id FROM expense_projects WHERE id = ?').get(project_id)) return res.status(400).json({ error: 'Invalid project' });
  const maxRow = db.prepare('SELECT MAX(sort_order) AS m FROM expense_purchase_orders WHERE project_id = ?').get(project_id);
  const row = {
    id: id(), project_id,
    po_number: (req.body?.po_number || '').trim() || null,
    amount: num(req.body?.amount),
    paid: req.body?.paid ? 1 : 0,
    sort_order: (maxRow && maxRow.m != null ? maxRow.m : -1) + 1,
    created_by: req.user?.email || null, updated_by: req.user?.email || null,
    created_date: now(), updated_date: now(),
  };
  db.prepare(`INSERT INTO expense_purchase_orders (id,project_id,po_number,amount,paid,sort_order,created_by,updated_by,created_date,updated_date)
    VALUES (@id,@project_id,@po_number,@amount,@paid,@sort_order,@created_by,@updated_by,@created_date,@updated_date)`).run(row);
  res.json({ ...row, paid: !!row.paid });
});

router.put('/purchase-orders/:id', appEditRequired('expenses'), (req, res) => {
  const o = db.prepare('SELECT * FROM expense_purchase_orders WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {};
  const po_number = b.po_number != null ? (String(b.po_number).trim() || null) : o.po_number;
  const amount = b.amount != null ? num(b.amount) : o.amount;
  const paid = b.paid != null ? (b.paid ? 1 : 0) : o.paid;
  db.prepare('UPDATE expense_purchase_orders SET po_number=?, amount=?, paid=?, updated_by=?, updated_date=? WHERE id=?')
    .run(po_number, amount, paid, req.user?.email || null, now(), o.id);
  const u = db.prepare('SELECT * FROM expense_purchase_orders WHERE id = ?').get(o.id);
  res.json({ ...u, paid: !!u.paid });
});

router.delete('/purchase-orders/:id', appEditRequired('expenses'), (req, res) => {
  const o = db.prepare('SELECT * FROM expense_purchase_orders WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM expense_purchase_orders WHERE id = ?').run(o.id);
  res.json({ ok: true });
});

// ===== Equipment Rentals (per project) =====
const BASE_RENTAL_TYPES = ['Scissor Lift', 'Gas Monitor', 'Fork Lift', 'Donkey'];
const RENTAL_COLS = ['equipment_type', 'serial_number', 'trade', 'date_delivered', 'date_returned', 'cost', 'notes'];

router.get('/rental-types', (_req, res) => {
  const custom = db.prepare('SELECT name FROM expense_rental_types ORDER BY name').all().map((r) => r.name);
  res.json([...BASE_RENTAL_TYPES, ...custom.filter((c) => !BASE_RENTAL_TYPES.includes(c))]);
});
router.post('/rental-types', appEditRequired('expenses'), (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name required' });
  if (!BASE_RENTAL_TYPES.includes(name) && !db.prepare('SELECT id FROM expense_rental_types WHERE name = ?').get(name)) {
    db.prepare('INSERT INTO expense_rental_types (id, name, created_date) VALUES (?,?,?)').run(id(), name, now());
  }
  res.json({ ok: true, name });
});

router.post('/rentals', appEditRequired('expenses'), (req, res) => {
  const project_id = req.body?.project_id;
  if (!project_id) return res.status(400).json({ error: 'project_id required' });
  if (!db.prepare('SELECT id FROM expense_projects WHERE id = ?').get(project_id)) return res.status(400).json({ error: 'Invalid project' });
  const maxRow = db.prepare('SELECT MAX(sort_order) AS m FROM expense_rentals WHERE project_id = ?').get(project_id);
  const b = req.body || {};
  const row = {
    id: id(), project_id,
    equipment_type: (b.equipment_type || '').trim() || null,
    serial_number: (b.serial_number || '').trim() || null,
    trade: normTrade(b.trade),
    date_delivered: normDate(b.date_delivered) || null,
    date_returned: normDate(b.date_returned) || null,
    cost: num(b.cost),
    notes: (b.notes || '').trim() || null,
    sort_order: (maxRow && maxRow.m != null ? maxRow.m : -1) + 1,
    created_by: req.user?.email || null, updated_by: req.user?.email || null,
    created_date: now(), updated_date: now(),
  };
  const cols = ['id', 'project_id', ...RENTAL_COLS, 'sort_order', 'created_by', 'updated_by', 'created_date', 'updated_date'];
  db.prepare(`INSERT INTO expense_rentals (${cols.join(',')}) VALUES (${cols.map((c) => '@' + c).join(',')})`).run(row);
  res.json(row);
});

router.put('/rentals/:id', appEditRequired('expenses'), (req, res) => {
  const r0 = db.prepare('SELECT * FROM expense_rentals WHERE id = ?').get(req.params.id);
  if (!r0) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {};
  const v = {
    equipment_type: b.equipment_type != null ? (String(b.equipment_type).trim() || null) : r0.equipment_type,
    serial_number: b.serial_number != null ? (String(b.serial_number).trim() || null) : r0.serial_number,
    trade: b.trade !== undefined ? normTrade(b.trade) : r0.trade,
    date_delivered: b.date_delivered !== undefined ? (normDate(b.date_delivered) || null) : r0.date_delivered,
    date_returned: b.date_returned !== undefined ? (normDate(b.date_returned) || null) : r0.date_returned,
    cost: b.cost != null ? num(b.cost) : r0.cost,
    notes: b.notes != null ? (String(b.notes).trim() || null) : r0.notes,
  };
  db.prepare(`UPDATE expense_rentals SET equipment_type=?, serial_number=?, trade=?, date_delivered=?, date_returned=?, cost=?, notes=?, updated_by=?, updated_date=? WHERE id=?`)
    .run(v.equipment_type, v.serial_number, v.trade, v.date_delivered, v.date_returned, v.cost, v.notes, req.user?.email || null, now(), r0.id);
  res.json(db.prepare('SELECT * FROM expense_rentals WHERE id = ?').get(r0.id));
});

router.delete('/rentals/:id', appEditRequired('expenses'), (req, res) => {
  const r0 = db.prepare('SELECT * FROM expense_rentals WHERE id = ?').get(req.params.id);
  if (!r0) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM expense_rentals WHERE id = ?').run(r0.id);
  res.json({ ok: true });
});

export default router;
