import express from 'express';
import { nanoid } from 'nanoid';
import db from './db.js';
import { authRequired, appReadRequired, appEditRequired } from './auth.js';

const router = express.Router();
const now = () => new Date().toISOString();

router.use(authRequired);
// All safety routes need read; mutations additionally need edit (per-route).
router.use(appReadRequired('safety'));

function slugify(name) {
  const parts = name.split(',').map((s) => s.trim());
  const first = (parts[1] || '').trim();
  const last = (parts[0] || '').trim();
  const firstClean = first.split(/\s+/).filter((w) => w.length > 1).join(' ') || first;
  const ordered = `${firstClean} ${last}`.trim();
  return ordered
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .split(/\s+/).filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

function uniqueSlug(base, excludeId = null) {
  let slug = base || 'employee';
  let s = slug, n = 2;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const row = db.prepare('SELECT id FROM employees WHERE slug = ?').get(s);
    if (!row || row.id === excludeId) return s;
    s = `${slug}${n++}`;
  }
}

// ---- Training types ----
router.get('/training-types', (_req, res) => {
  const rows = db.prepare('SELECT * FROM training_types ORDER BY name COLLATE NOCASE ASC').all();
  res.json(rows);
});

router.post('/training-types', appEditRequired('safety'), (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name is required' });
  const existing = db.prepare('SELECT * FROM training_types WHERE name = ? COLLATE NOCASE').get(name);
  if (existing) return res.json(existing);
  const id = 'tt_' + nanoid(8);
  db.prepare('INSERT INTO training_types (id, name, created_date) VALUES (?, ?, ?)').run(id, name, now());
  res.json(db.prepare('SELECT * FROM training_types WHERE id = ?').get(id));
});

router.delete('/training-types/:id', appEditRequired('safety'), (req, res) => {
  db.prepare('DELETE FROM training_types WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---- Employees ----
// List all employees with a quick record count.
router.get('/employees', (_req, res) => {
  const rows = db.prepare(`
    SELECT e.*, (SELECT COUNT(*) FROM training_records t WHERE t.employee_id = e.id) AS record_count
    FROM employees e
    ORDER BY e.name COLLATE NOCASE ASC
  `).all();
  res.json(rows);
});

router.post('/employees', appEditRequired('safety'), (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name is required' });
  const id = 'emp_' + nanoid(10);
  const slug = uniqueSlug(slugify(name));
  const ts = now();
  db.prepare(
    'INSERT INTO employees (id, name, slug, active, created_date, updated_date) VALUES (?, ?, ?, 1, ?, ?)'
  ).run(id, name, slug, ts, ts);
  res.json(db.prepare('SELECT * FROM employees WHERE id = ?').get(id));
});

// Get one employee by slug, including their training records.
router.get('/employees/:slug', (req, res) => {
  const emp = db.prepare('SELECT * FROM employees WHERE slug = ?').get(req.params.slug);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  const records = db.prepare(
    'SELECT * FROM training_records WHERE employee_id = ? ORDER BY passed_date DESC'
  ).all(emp.id);
  res.json({ ...emp, records });
});

router.put('/employees/:id', appEditRequired('safety'), (req, res) => {
  const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  const name = (req.body?.name ?? emp.name).trim();
  const active = req.body?.active != null ? (req.body.active ? 1 : 0) : emp.active;
  // Keep the original slug stable (URLs shouldn't break); only regenerate if blank.
  const slug = emp.slug || uniqueSlug(slugify(name), emp.id);
  db.prepare('UPDATE employees SET name = ?, active = ?, slug = ?, updated_date = ? WHERE id = ?')
    .run(name, active, slug, now(), emp.id);
  res.json(db.prepare('SELECT * FROM employees WHERE id = ?').get(emp.id));
});

router.delete('/employees/:id', appEditRequired('safety'), (req, res) => {
  db.prepare('DELETE FROM training_records WHERE employee_id = ?').run(req.params.id);
  db.prepare('DELETE FROM employees WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---- Training records ----
router.post('/employees/:id/records', appEditRequired('safety'), (req, res) => {
  const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  const data = req.body || {};
  if (!data.training) return res.status(400).json({ error: 'training is required' });
  const id = 'tr_' + nanoid(10);
  const ts = now();
  db.prepare(`
    INSERT INTO training_records (id, employee_id, training, passed_date, expires_date, notes, created_by, updated_by, created_date, updated_date)
    VALUES (@id, @employee_id, @training, @passed_date, @expires_date, @notes, @created_by, @updated_by, @created_date, @updated_date)
  `).run({
    id, employee_id: emp.id,
    training: data.training,
    passed_date: data.passed_date || null,
    expires_date: data.expires_date || null,
    notes: data.notes || null,
    created_by: req.user.email, updated_by: req.user.email,
    created_date: ts, updated_date: ts,
  });
  res.json(db.prepare('SELECT * FROM training_records WHERE id = ?').get(id));
});

router.put('/records/:id', appEditRequired('safety'), (req, res) => {
  const rec = db.prepare('SELECT * FROM training_records WHERE id = ?').get(req.params.id);
  if (!rec) return res.status(404).json({ error: 'Record not found' });
  const data = req.body || {};
  const pick = (k) => (k in data ? data[k] : rec[k]);
  db.prepare(`
    UPDATE training_records SET training = @training, passed_date = @passed_date,
      expires_date = @expires_date, notes = @notes, updated_by = @updated_by, updated_date = @updated_date
    WHERE id = @id
  `).run({
    id: rec.id,
    training: pick('training'),
    passed_date: data.passed_date !== undefined ? (data.passed_date || null) : rec.passed_date,
    expires_date: data.expires_date !== undefined ? (data.expires_date || null) : rec.expires_date,
    notes: data.notes !== undefined ? (data.notes || null) : rec.notes,
    updated_by: req.user.email, updated_date: now(),
  });
  res.json(db.prepare('SELECT * FROM training_records WHERE id = ?').get(rec.id));
});

router.delete('/records/:id', appEditRequired('safety'), (req, res) => {
  db.prepare('DELETE FROM training_records WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
