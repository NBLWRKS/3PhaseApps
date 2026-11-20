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
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import db from './db.js';
import { authRequired, hashPassword } from './auth.js';
import { hasAppLevel } from './apps.js';
import { uploadDir } from './routes.uploads.js';

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
  let hidden_columns = {};
  try { sections = JSON.parse(row.sections || '[]'); } catch { sections = []; }
  try { hidden_columns = JSON.parse(row.hidden_columns || '{}') || {}; } catch { hidden_columns = {}; }
  return { ...row, sections, hidden_columns };
}

// Columns hidden from customers, per section title (labels compared ignoring
// case). The server removes them from what a customer receives, so they never
// reach the customer's browser.
const norm = (s) => String(s || '').trim().toLowerCase();
function withoutHidden(sections, hidden) {
  return sections.map((s) => {
    const h = new Set((hidden[s.title] || []).map(norm));
    if (!h.size) return s;
    const keep = s.columns.map((c, i) => (h.has(norm(c.label)) ? -1 : i)).filter((i) => i >= 0);
    return { ...s, columns: keep.map((i) => s.columns[i]), rows: s.rows.map((r) => ({ ...r, cells: keep.map((i) => r.cells[i] ?? null) })) };
  });
}
// Default for a newly uploaded Scope of Work sheet: hide our internal invoicing
// columns (invoice in process, amount, 4% Net30, final amount, after-invoice balances).
const INTERNAL_SOW = /invoice in process|^amount$|net\s*30|final amount|after invoice/i;
function defaultHidden(sections, hidden) {
  const out = { ...hidden };
  for (const s of sections) {
    if (out[s.title] !== undefined || !/sow|scope/i.test(`${s.title} ${s.subtitle || ''}`)) continue;
    out[s.title] = s.columns.map((c) => c.label).filter((l) => INTERNAL_SOW.test(l));
  }
  return out;
}
function cleanHidden(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const out = {};
  for (const [k, v] of Object.entries(input).slice(0, 40)) {
    if (!Array.isArray(v)) return null;
    out[String(k).slice(0, 200)] = v.slice(0, 60).map((x) => String(x).slice(0, 200));
  }
  return out;
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
  if (isCustomer(req.user)) {
    // Customers don't get hidden columns, the hidden list, or who on our side updated it.
    p.sections = withoutHidden(p.sections, p.hidden_columns);
    delete p.hidden_columns; delete p.updated_by; delete p.created_by;
  }
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
  let hidden = p.hidden_columns;
  if (b.hidden_columns !== undefined) {
    hidden = cleanHidden(b.hidden_columns);
    if (!hidden) return res.status(400).json({ error: 'Hidden columns are not in the expected format' });
  }
  if (b.sections !== undefined) hidden = defaultHidden(sections, hidden);
  const name = b.name != null ? String(b.name).trim().slice(0, 200) || p.name : p.name;
  const customer = b.customer !== undefined ? (String(b.customer || '').trim().slice(0, 200) || null) : p.customer;
  const source_file = b.source_file !== undefined ? (String(b.source_file || '').slice(0, 300) || null) : p.source_file;
  db.prepare('UPDATE portals SET name=?, customer=?, sections=?, hidden_columns=?, source_file=?, updated_by=?, updated_date=? WHERE id=?')
    .run(name, customer, JSON.stringify(sections), JSON.stringify(hidden), source_file, req.user.email, now(), p.id);
  res.json(getPortal(p.id));
});

// DELETE /api/portal/:id  (admins) — also removes the portal's customer logins.
router.delete('/:id', (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Only admins can delete a portal' });
  const p = getPortal(req.params.id);
  if (!p) return res.status(404).json({ error: 'Portal not found' });
  db.transaction(() => {
    for (const u of db.prepare("SELECT id, email FROM users WHERE role = 'customer' AND portal_id = ?").all(p.id)) removeLogin(u, req.user.email);
    db.prepare('DELETE FROM portal_documents WHERE portal_id = ?').run(p.id);
    db.prepare('DELETE FROM portals WHERE id = ?').run(p.id);
  })();
  try { fs.rmSync(docDir(p.id), { recursive: true, force: true }); } catch { /* ignore */ }
  res.json({ ok: true });
});

// ===== Documents (schedules, the workbook, anything shared with the customer) =====
// Stored under uploads/portal/<portal id>/, which /uploads never serves; they're
// only downloadable here, by that portal's customers and internal users.
const docDir = (pid) => path.join(uploadDir, 'portal', pid.replace(/[^a-zA-Z0-9]/g, ''));
const DOC_EXT = {
  '.pdf': 'application/pdf', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword', '.csv': 'text/csv', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
};
const DOC_KINDS = new Set(['document', 'schedule', 'workbook']);
const docUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => { const d = docDir(req.params.id); fs.mkdirSync(d, { recursive: true }); cb(null, d); },
    filename: (_req, file, cb) => cb(null, `${id()}${path.extname(file.originalname || '').toLowerCase()}`),
  }),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, !!DOC_EXT[path.extname(file.originalname || '').toLowerCase()]),
});
const docRow = (d) => ({ id: d.id, kind: d.kind, name: d.name, size: d.size, uploaded_date: d.uploaded_date });

// GET /api/portal/:id/documents -> newest first
router.get('/:id/documents', (req, res) => {
  const p = getPortal(req.params.id);
  if (!canView(req.user, p)) return res.status(404).json({ error: 'Portal not found' });
  const rows = db.prepare('SELECT * FROM portal_documents WHERE portal_id = ? ORDER BY uploaded_date DESC').all(p.id);
  res.json(rows.map((d) => (isCustomer(req.user) ? docRow(d) : { ...docRow(d), uploaded_by: d.uploaded_by })));
});

// GET /api/portal/:id/documents/:docId/file  (?download=1 to save instead of view)
router.get('/:id/documents/:docId/file', (req, res) => {
  const p = getPortal(req.params.id);
  if (!canView(req.user, p)) return res.status(404).json({ error: 'Portal not found' });
  const d = db.prepare('SELECT * FROM portal_documents WHERE id = ? AND portal_id = ?').get(req.params.docId, p.id);
  if (!d) return res.status(404).json({ error: 'Document not found' });
  const full = path.join(docDir(p.id), path.basename(d.stored_file));
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'File missing' });
  const ext = path.extname(d.stored_file).toLowerCase();
  const inline = !req.query.download && (ext === '.pdf' || ext === '.png' || ext === '.jpg' || ext === '.jpeg');
  res.setHeader('Content-Type', DOC_EXT[ext] || 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${d.name.replace(/[^\w.\- ()]/g, '_')}"`);
  fs.createReadStream(full).pipe(res);
});

// POST /api/portal/:id/documents  multipart: file, kind, name?  (edit access)
router.post('/:id/documents', (req, res, next) => {
  const p = getPortal(req.params.id);
  if (!p || isCustomer(req.user) || !internalLevel(req.user, 'read')) return res.status(404).json({ error: 'Portal not found' });
  if (!internalLevel(req.user, 'edit')) return res.status(403).json({ error: 'You have read-only access to the Customer Portal' });
  next();
}, (req, res, next) => docUpload.single('file')(req, res, (err) => (err
  ? res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'That file is over 50 MB.' : 'Upload failed' })
  : next())), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a PDF, Excel, Word, CSV or image file (50 MB max).' });
  const kind = DOC_KINDS.has(req.body?.kind) ? req.body.kind : 'document';
  const row = {
    id: id(), portal_id: req.params.id, kind,
    name: String(req.body?.name || req.file.originalname || 'Document').trim().slice(0, 200),
    stored_file: req.file.filename, size: req.file.size, uploaded_by: req.user.email, uploaded_date: now(),
  };
  db.prepare(`INSERT INTO portal_documents (id, portal_id, kind, name, stored_file, size, uploaded_by, uploaded_date)
    VALUES (@id, @portal_id, @kind, @name, @stored_file, @size, @uploaded_by, @uploaded_date)`).run(row);
  res.json({ ...docRow(row), uploaded_by: row.uploaded_by });
});

// DELETE /api/portal/:id/documents/:docId  (edit access)
router.delete('/:id/documents/:docId', (req, res) => {
  const p = getPortal(req.params.id);
  if (!p || isCustomer(req.user) || !internalLevel(req.user, 'read')) return res.status(404).json({ error: 'Portal not found' });
  if (!internalLevel(req.user, 'edit')) return res.status(403).json({ error: 'You have read-only access to the Customer Portal' });
  const d = db.prepare('SELECT * FROM portal_documents WHERE id = ? AND portal_id = ?').get(req.params.docId, p.id);
  if (!d) return res.status(404).json({ error: 'Document not found' });
  try { fs.unlinkSync(path.join(docDir(p.id), path.basename(d.stored_file))); } catch { /* already gone */ }
  db.prepare('DELETE FROM portal_documents WHERE id = ?').run(d.id);
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
