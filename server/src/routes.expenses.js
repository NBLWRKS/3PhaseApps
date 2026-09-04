// Expense Tracking API — Project -> Weekly entry -> payroll + expense line items.
// Weekly buckets: each week holds electrical/mechanical payroll ($ + hours) and
// any number of categorized expense/rental line items. Rolls up per week, per
// project (vs. budget), and across all projects, with category + weekly-trend
// breakdowns for the dashboard.
import express from 'express';
import crypto from 'crypto';
import db from './db.js';
import { authRequired, appReadRequired, appEditRequired } from './auth.js';

const router = express.Router();
const id = () => crypto.randomBytes(12).toString('hex');
const now = () => new Date().toISOString();
const num = (v) => { const n = Number(v); return isNaN(n) ? 0 : n; };

router.use(authRequired);
router.use(appReadRequired('expenses'));

// Base categories always available in the UI (line items). Payroll is separate.
const BASE_CATEGORIES = ['Equipment Rental', 'Materials', 'Other'];

function weekTotals(week, items) {
  const payroll = num(week.elec_pay) + num(week.mech_pay);
  const itemsTotal = items.reduce((s, it) => s + num(it.amount), 0);
  return {
    payroll,
    items_total: itemsTotal,
    total: payroll + itemsTotal,
    hours: num(week.elec_hours) + num(week.mech_hours),
  };
}

// Build the full expense tree for one project (or all), with rollups.
function buildSummary(projectId) {
  const projects = projectId
    ? db.prepare('SELECT * FROM expense_projects WHERE id = ? AND archived = 0').all(projectId)
    : db.prepare('SELECT * FROM expense_projects WHERE archived = 0 ORDER BY sort_order, name').all();

  const out = [];
  for (const p of projects) {
    const weeks = db.prepare('SELECT * FROM expense_weeks WHERE project_id = ? ORDER BY week_ending ASC').all(p.id);
    const weekOut = [];
    let projTotal = 0, projPayroll = 0, projItems = 0, projHours = 0;
    let elecPay = 0, mechPay = 0, elecHours = 0, mechHours = 0;
    const categoryTotals = {}; // category -> $

    for (const w of weeks) {
      const items = db.prepare('SELECT * FROM expense_items WHERE week_id = ? ORDER BY sort_order, created_date').all(w.id);
      const t = weekTotals(w, items);
      projTotal += t.total;
      projPayroll += t.payroll;
      projItems += t.items_total;
      projHours += t.hours;
      elecPay += num(w.elec_pay); mechPay += num(w.mech_pay);
      elecHours += num(w.elec_hours); mechHours += num(w.mech_hours);
      // category rollup: payroll as two synthetic categories + line items
      categoryTotals['Payroll – Electrical'] = (categoryTotals['Payroll – Electrical'] || 0) + num(w.elec_pay);
      categoryTotals['Payroll – Mechanical'] = (categoryTotals['Payroll – Mechanical'] || 0) + num(w.mech_pay);
      for (const it of items) {
        categoryTotals[it.category] = (categoryTotals[it.category] || 0) + num(it.amount);
      }
      weekOut.push({ ...w, items, totals: t });
    }

    // Spend per budgeted category.
    const spendElec = elecPay;
    const spendMech = mechPay;
    const spendMaterials = categoryTotals['Materials'] || 0;
    const spendRental = categoryTotals['Equipment Rental'] || 0;

    // Per-category budgets (the four fixed ones); project budget = their sum.
    const bElec = num(p.budget_elec);
    const bMech = num(p.budget_mech);
    const bMaterials = num(p.budget_materials);
    const bRental = num(p.budget_rental);
    const budgetTotal = bElec + bMech + bMaterials + bRental;

    const catLine = (label, spend, budget) => ({
      label, spend, budget,
      remaining: budget > 0 ? budget - spend : 0,
      pct: budget > 0 ? Math.round((spend / budget) * 100) : 0,
    });

    out.push({
      ...p,
      weeks: weekOut,
      week_count: weekOut.length,
      totals: {
        total: projTotal,
        payroll: projPayroll,
        items_total: projItems,
        hours: projHours,
        elec_pay: elecPay, mech_pay: mechPay,
        elec_hours: elecHours, mech_hours: mechHours,
        cost_per_hour: projHours > 0 ? projTotal / projHours : 0,
        // overall = sum of category budgets
        budget: budgetTotal,
        budget_remaining: budgetTotal > 0 ? budgetTotal - projTotal : 0,
        budget_pct: budgetTotal > 0 ? Math.round((projTotal / budgetTotal) * 100) : 0,
      },
      // Per-category budget vs. spend (for the BI budget bars).
      budgets: {
        elec: catLine('Electrical Payroll', spendElec, bElec),
        mech: catLine('Mechanical Payroll', spendMech, bMech),
        materials: catLine('Materials', spendMaterials, bMaterials),
        rental: catLine('Equipment Rental', spendRental, bRental),
      },
      category_totals: categoryTotals,
      // weekly trend: [{week_ending, total}]
      trend: weekOut.map((w) => ({ week_ending: w.week_ending, total: w.totals.total })),
    });
  }
  return out;
}

// ===== Summary (dashboard + tables data source) =====
router.get('/summary', (req, res) => {
  res.json(buildSummary(req.query.project || null));
});

// ===== Categories =====
router.get('/categories', (_req, res) => {
  const custom = db.prepare('SELECT name FROM expense_categories ORDER BY name').all().map((r) => r.name);
  // De-dup base + custom, base first.
  const all = [...BASE_CATEGORIES, ...custom.filter((c) => !BASE_CATEGORIES.includes(c))];
  res.json(all);
});

router.post('/categories', appEditRequired('expenses'), (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name required' });
  if (BASE_CATEGORIES.includes(name)) return res.json({ ok: true }); // already available
  const exists = db.prepare('SELECT id FROM expense_categories WHERE name = ?').get(name);
  if (!exists) {
    db.prepare('INSERT INTO expense_categories (id, name, created_date) VALUES (?,?,?)').run(id(), name, now());
  }
  res.json({ ok: true, name });
});

// ===== Projects =====
router.get('/projects', (_req, res) => {
  res.json(db.prepare('SELECT * FROM expense_projects WHERE archived = 0 ORDER BY sort_order, name').all());
});

router.post('/projects', appEditRequired('expenses'), (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name required' });
  const maxRow = db.prepare('SELECT MAX(sort_order) AS m FROM expense_projects').get();
  const row = {
    id: id(), name,
    budget_elec: num(req.body?.budget_elec),
    budget_mech: num(req.body?.budget_mech),
    budget_materials: num(req.body?.budget_materials),
    budget_rental: num(req.body?.budget_rental),
    archived: 0,
    sort_order: (maxRow && maxRow.m != null ? maxRow.m : -1) + 1,
    created_by: req.user?.email || null, created_date: now(), updated_date: now(),
  };
  db.prepare(`INSERT INTO expense_projects (id,name,budget_elec,budget_mech,budget_materials,budget_rental,archived,sort_order,created_by,created_date,updated_date)
    VALUES (@id,@name,@budget_elec,@budget_mech,@budget_materials,@budget_rental,@archived,@sort_order,@created_by,@created_date,@updated_date)`).run(row);
  res.json(row);
});

router.put('/projects/:id', appEditRequired('expenses'), (req, res) => {
  const p = db.prepare('SELECT * FROM expense_projects WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {};
  const name = b.name != null ? String(b.name).trim() : p.name;
  const budget_elec = b.budget_elec != null ? num(b.budget_elec) : p.budget_elec;
  const budget_mech = b.budget_mech != null ? num(b.budget_mech) : p.budget_mech;
  const budget_materials = b.budget_materials != null ? num(b.budget_materials) : p.budget_materials;
  const budget_rental = b.budget_rental != null ? num(b.budget_rental) : p.budget_rental;
  const archived = b.archived != null ? (b.archived ? 1 : 0) : p.archived;
  db.prepare('UPDATE expense_projects SET name=?, budget_elec=?, budget_mech=?, budget_materials=?, budget_rental=?, archived=?, updated_date=? WHERE id=?')
    .run(name, budget_elec, budget_mech, budget_materials, budget_rental, archived, now(), p.id);
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
router.post('/weeks', appEditRequired('expenses'), (req, res) => {
  const project_id = req.body?.project_id;
  const week_ending = (req.body?.week_ending || '').trim();
  if (!project_id || !week_ending) return res.status(400).json({ error: 'project_id and week_ending required' });
  const proj = db.prepare('SELECT id FROM expense_projects WHERE id = ?').get(project_id);
  if (!proj) return res.status(400).json({ error: 'Invalid project' });
  const row = {
    id: id(), project_id, week_ending,
    elec_pay: num(req.body?.elec_pay), elec_hours: num(req.body?.elec_hours),
    mech_pay: num(req.body?.mech_pay), mech_hours: num(req.body?.mech_hours),
    notes: (req.body?.notes || '').trim() || null,
    created_by: req.user?.email || null, updated_by: req.user?.email || null,
    created_date: now(), updated_date: now(),
  };
  db.prepare(`INSERT INTO expense_weeks (id,project_id,week_ending,elec_pay,elec_hours,mech_pay,mech_hours,notes,created_by,updated_by,created_date,updated_date)
    VALUES (@id,@project_id,@week_ending,@elec_pay,@elec_hours,@mech_pay,@mech_hours,@notes,@created_by,@updated_by,@created_date,@updated_date)`).run(row);
  res.json(row);
});

router.put('/weeks/:id', appEditRequired('expenses'), (req, res) => {
  const w = db.prepare('SELECT * FROM expense_weeks WHERE id = ?').get(req.params.id);
  if (!w) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {};
  const week_ending = b.week_ending != null ? String(b.week_ending).trim() : w.week_ending;
  const elec_pay = b.elec_pay != null ? num(b.elec_pay) : w.elec_pay;
  const elec_hours = b.elec_hours != null ? num(b.elec_hours) : w.elec_hours;
  const mech_pay = b.mech_pay != null ? num(b.mech_pay) : w.mech_pay;
  const mech_hours = b.mech_hours != null ? num(b.mech_hours) : w.mech_hours;
  const notes = b.notes != null ? (String(b.notes).trim() || null) : w.notes;
  db.prepare(`UPDATE expense_weeks SET week_ending=?, elec_pay=?, elec_hours=?, mech_pay=?, mech_hours=?, notes=?, updated_by=?, updated_date=? WHERE id=?`)
    .run(week_ending, elec_pay, elec_hours, mech_pay, mech_hours, notes, req.user?.email || null, now(), w.id);
  res.json(db.prepare('SELECT * FROM expense_weeks WHERE id = ?').get(w.id));
});

router.delete('/weeks/:id', appEditRequired('expenses'), (req, res) => {
  const w = db.prepare('SELECT * FROM expense_weeks WHERE id = ?').get(req.params.id);
  if (!w) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM expense_items WHERE week_id = ?').run(w.id);
  db.prepare('DELETE FROM expense_weeks WHERE id = ?').run(w.id);
  res.json({ ok: true });
});

// ===== Expense line items =====
router.post('/items', appEditRequired('expenses'), (req, res) => {
  const week_id = req.body?.week_id;
  const category = (req.body?.category || '').trim();
  if (!week_id || !category) return res.status(400).json({ error: 'week_id and category required' });
  const wk = db.prepare('SELECT id FROM expense_weeks WHERE id = ?').get(week_id);
  if (!wk) return res.status(400).json({ error: 'Invalid week' });
  const maxRow = db.prepare('SELECT MAX(sort_order) AS m FROM expense_items WHERE week_id = ?').get(week_id);
  const row = {
    id: id(), week_id, category,
    description: (req.body?.description || '').trim() || null,
    amount: num(req.body?.amount),
    sort_order: (maxRow && maxRow.m != null ? maxRow.m : -1) + 1,
    created_date: now(), updated_date: now(),
  };
  db.prepare(`INSERT INTO expense_items (id,week_id,category,description,amount,sort_order,created_date,updated_date)
    VALUES (@id,@week_id,@category,@description,@amount,@sort_order,@created_date,@updated_date)`).run(row);
  res.json(row);
});

router.put('/items/:id', appEditRequired('expenses'), (req, res) => {
  const it = db.prepare('SELECT * FROM expense_items WHERE id = ?').get(req.params.id);
  if (!it) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {};
  const category = b.category != null ? String(b.category).trim() : it.category;
  const description = b.description != null ? (String(b.description).trim() || null) : it.description;
  const amount = b.amount != null ? num(b.amount) : it.amount;
  db.prepare('UPDATE expense_items SET category=?, description=?, amount=?, updated_date=? WHERE id=?')
    .run(category, description, amount, now(), it.id);
  res.json(db.prepare('SELECT * FROM expense_items WHERE id = ?').get(it.id));
});

router.delete('/items/:id', appEditRequired('expenses'), (req, res) => {
  const it = db.prepare('SELECT * FROM expense_items WHERE id = ?').get(req.params.id);
  if (!it) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM expense_items WHERE id = ?').run(it.id);
  res.json({ ok: true });
});

export default router;
