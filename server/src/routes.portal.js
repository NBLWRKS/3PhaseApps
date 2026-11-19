// Customer Portal: read-only project dashboards for customers outside the
// company (e.g. a project review for Intelligrated), kept up to date by
// internal users.
//
// Who can do what:
//   - Customer logins (users.role = 'customer') see ONLY the portal in their
//     users.portal_id, read-only. authRequired keeps them out of every other API.
//   - Internal users need the 'portal' app permission: read to view any portal,
//     edit to create portals and update their content.
//   - Admins also create, reset and remove the customer logins for a portal,
//     and delete portals.
import express from 'express';
import crypto from 'crypto';
import db from './db.js';
import { authRequired, hashPassword } from './auth.js';
import { hasAppLevel } from './apps.js';

const router = express.Router();
const id = () => crypto.randomBytes(12).toString('hex');
const now = () => new Date().toISOString();

router.use(authRequired);

const isCustomer = (u) => u?.role === 'customer';
const isAdmin = (u) => u?.role === 'admin';
const internalLevel = (u, level) => !isCustomer(u) && (isAdmin(u) || hasAppLevel(u?.app_permissions, 'portal', level));
const canView = (u, p) => !!p && (isCustomer(u) ? u.portal_id === p.id : internalLevel(u, 'read'));

function rowToPortal(row) {
  if (!row) return null;
  let sections = [];
  try { sections = JSON.parse(row.sections || '[]'); } catch { sections = []; }
  return { ...row, sections };
}
const getPortal = (pid) => rowToPortal(db.prepare('SELECT * FROM portals WHERE id = ?').get(pid));

// Validate uploaded portal content: a list of tables built from a workbook.
// Shape: [{ title, subtitle, columns: [{ label, kind }], rows: [{ cells: [..], total }] }]
const KINDS = new Set(['text', 'number', 'currency', 'percent', 'date']);
function cleanSections(input) {
  if (!Array.isArray(input) || input.length > 20) return null;
  const out = [];
  for (const s of input) {
    if (!s || typeof s !== 'object' || !Array.isArray(s.columns) || !Array.isArray(s.rows)) return null;
    if (s.columns.length < 1 || s.columns.length > 40 || s.rows.length > 2000) return null;
    const columns = s.columns.map((c) => ({
      label: String(c?.label ?? '').slice(0, 200),
      kind: KINDS.has(c?.kind) ? c.kind : 'text',
    }));
    const rows = [];
    for (const r of s.rows) {
      if (!r || !Array.isArray(r.cells) || r.cells.length > columns.length) return null;
      const cells = r.cells.map((v) => (v == null ? null
        : typeof v === 'number' ? (Number.isFinite(v) ? v : null)
        : String(v).slice(0, 2000)));
      rows.push({ cells, total: !!r.total });
    }
    out.push({ title: String(s.title ?? '').slice(0, 200), subtitle: String(s.subtitle ?? '').slice(0, 300), columns, rows });
  }
  return out;
}

// ===== Portals =====

// GET /api/portal -> portals this person can see (a customer: just theirs)
router.get('/', (req, res) => {
  if (isCustomer(req.user)) {
    const p = req.user.portal_id ? getPortal(req.user.portal_id) : null;
    return res.json(p ? [{ id: p.id, name: p.name, customer: p.customer, updated_date: p.updated_date }] : []);
  }
  if (!internalLevel(req.user, 'read')) return res.status(403).json({ error: 'You do not have access to the Customer Portal' });
  const rows = db.prepare('SELECT id, name, customer, source_file, updated_by, updated_date FROM portals ORDER BY name COLLATE NOCASE').all();
  const counts = Object.fromEntries(db.prepare("SELECT portal_id, COUNT(*) AS n FROM users WHERE role = 'customer' GROUP BY portal_id").all().map((r) => [r.portal_id, r.n]));
  res.json(rows.map((r) => ({ ...r, customer_logins: counts[r.id] || 0 })));
});

// GET /api/portal/:id
router.get('/:id', (req, res) => {
  const p = getPortal(req.params.id);
  if (!canView(req.user, p)) return res.status(404).json({ error: 'Portal not found' });
  const canEdit = internalLevel(req.user, 'edit');
  // Customers don't need to know who on our side updated it.
  if (isCustomer(req.user)) { delete p.updated_by; delete p.created_by; }
  res.json({ ...p, can_edit: canEdit, can_manage_logins: isAdmin(req.user) });
});

// POST /api/portal { name, customer }  (edit access)
router.post('/', (req, res) => {
  if (!internalLevel(req.user, 'edit')) return res.status(403).json({ error: 'You have read-only access to the Customer Portal' });
  const name = String(req.body?.name || '').trim().slice(0, 200);
  if (!name) return res.status(400).json({ error: 'Name required' });
  const row = {
    id: id(), name, customer: String(req.body?.customer || '').trim().slice(0, 200) || null,
    sections: '[]', source_file: null,
    created_by: req.user.email, created_date: now(), updated_by: req.user.email, updated_date: now(),
  };
  db.prepare(`INSERT INTO portals (id,name,customer,sections,source_file,created_by,created_date,updated_by,updated_date)
    VALUES (@id,@name,@customer,@sections,@source_file,@created_by,@created_date,@updated_by,@updated_date)`).run(row);
  res.json(getPortal(row.id));
});

// PUT /api/portal/:id { name?, customer?, sections?, source_file? }  (edit access)
router.put('/:id', (req, res) => {
  const p = getPortal(req.params.id);
  if (!p || isCustomer(req.user) || !internalLevel(req.user, 'read')) return res.status(404).json({ error: 'Portal not found' });
  if (!internalLevel(req.user, 'edit')) return res.status(403).json({ error: 'You have read-only access to the Customer Portal' });
  const b = req.body || {};
  let sections = p.sections;
  if (b.sections !== undefined) {
    sections = cleanSections(b.sections);
    if (!sections) return res.status(400).json({ error: 'The portal content is not in the expected format' });
  }
  const name = b.name != null ? String(b.name).trim().slice(0, 200) || p.name : p.name;
  const customer = b.customer !== undefined ? (String(b.customer || '').trim().slice(0, 200) || null) : p.customer;
  const source_file = b.source_file !== undefined ? (String(b.source_file || '').slice(0, 300) || null) : p.source_file;
  db.prepare('UPDATE portals SET name=?, customer=?, sections=?, source_file=?, updated_by=?, updated_date=? WHERE id=?')
    .run(name, customer, JSON.stringify(sections), source_file, req.user.email, now(), p.id);
  res.json(getPortal(p.id));
});

// DELETE /api/portal/:id  (admins) — also removes the portal's customer logins.
router.delete('/:id', (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Only admins can delete a portal' });
  const p = getPortal(req.params.id);
  if (!p) return res.status(404).json({ error: 'Portal not found' });
  db.transaction(() => {
    for (const u of db.prepare("SELECT id, email FROM users WHERE role = 'customer' AND portal_id = ?").all(p.id)) removeLogin(u, req.user.email);
    db.prepare('DELETE FROM portals WHERE id = ?').run(p.id);
  })();
  res.json({ ok: true });
});

// ===== Customer logins (admins only) =====

function removeLogin(u, by) {
  db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(u.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
  // Same as removing any user: the email can't simply sign up again.
  db.prepare('INSERT OR REPLACE INTO removed_users (email, removed_at, removed_by) VALUES (?, ?, ?)').run(u.email.toLowerCase(), now(), by);
}
function adminPortal(req, res) {
  if (!isAdmin(req.user)) { res.status(403).json({ error: 'Only admins can manage customer logins' }); return null; }
  const p = getPortal(req.params.id);
  if (!p) { res.status(404).json({ error: 'Portal not found' }); return null; }
  return p;
}
const validPassword = (pw) => typeof pw === 'string' && pw.length >= 8 && pw.length <= 200;

// GET /api/portal/:id/customers
router.get('/:id/customers', (req, res) => {
  const p = adminPortal(req, res); if (!p) return;
  res.json(db.prepare("SELECT id, email, full_name, created_date FROM users WHERE role = 'customer' AND portal_id = ? ORDER BY email").all(p.id));
});

// POST /api/portal/:id/customers { email, full_name, password }
router.post('/:id/customers', (req, res) => {
  const p = adminPortal(req, res); if (!p) return;
  const email = String(req.body?.email || '').trim().toLowerCase();
  const full_name = String(req.body?.full_name || '').trim().slice(0, 200) || null;
  const password = req.body?.password;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address' });
  if (!validPassword(password)) return res.status(400).json({ error: 'Password must be 8–200 characters' });
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) return res.status(409).json({ error: 'An account with this email already exists' });
  const uid = crypto.randomBytes(10).toString('base64url');
  db.transaction(() => {
    db.prepare('DELETE FROM removed_users WHERE email = ?').run(email); // deliberately (re-)adding this person
    db.prepare(`INSERT INTO users (id, email, full_name, password_hash, role, app_permissions, portal_id, created_date, updated_date)
      VALUES (?, ?, ?, ?, 'customer', '{}', ?, ?, ?)`).run(uid, email, full_name, hashPassword(password), p.id, now(), now());
  })();
  res.json(db.prepare('SELECT id, email, full_name, created_date FROM users WHERE id = ?').get(uid));
});

// POST /api/portal/:id/customers/:uid/password { password }  -> signs them out everywhere
router.post('/:id/customers/:uid/password', (req, res) => {
  const p = adminPortal(req, res); if (!p) return;
  const u = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'customer' AND portal_id = ?").get(req.params.uid, p.id);
  if (!u) return res.status(404).json({ error: 'Login not found' });
  if (!validPassword(req.body?.password)) return res.status(400).json({ error: 'Password must be 8–200 characters' });
  db.prepare('UPDATE users SET password_hash = ?, password_changed_at = ?, updated_date = ? WHERE id = ?')
    .run(hashPassword(req.body.password), Date.now(), now(), u.id);
  db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(u.id);
  res.json({ ok: true });
});

// DELETE /api/portal/:id/customers/:uid
router.delete('/:id/customers/:uid', (req, res) => {
  const p = adminPortal(req, res); if (!p) return;
  const u = db.prepare("SELECT id, email FROM users WHERE id = ? AND role = 'customer' AND portal_id = ?").get(req.params.uid, p.id);
  if (!u) return res.status(404).json({ error: 'Login not found' });
  db.transaction(() => removeLogin(u, req.user.email))();
  res.json({ ok: true });
});

export default router;
