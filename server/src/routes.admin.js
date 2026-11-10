import express from 'express';
import db from './db.js';
import { authRequired, adminRequired, hashPassword } from './auth.js';
import { APPS, sanitizePermissions, normalizePermissions } from './apps.js';

const router = express.Router();
const now = () => new Date().toISOString();

router.use(authRequired);
router.use(adminRequired);

// GET /api/admin/apps -> the catalog of apps (for building the admin UI)
router.get('/apps', (_req, res) => {
  res.json(APPS);
});

// GET /api/admin/users -> all users with role + permissions
router.get('/users', (_req, res) => {
  const rows = db
    .prepare('SELECT id, email, full_name, role, app_permissions, created_date FROM users ORDER BY created_date ASC')
    .all();
  const users = rows.map((u) => ({
    ...u,
    app_permissions: (() => {
      try { return normalizePermissions(JSON.parse(u.app_permissions || '{}')); } catch { return {}; }
    })(),
  }));
  res.json(users);
});

// PUT /api/admin/users/:id  { role?, app_permissions? }
router.put('/users/:id', (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });

  const data = req.body || {};

  // Guard: an admin cannot strip their own admin role (prevents lockout).
  if (target.id === req.user.id && 'role' in data && data.role !== 'admin') {
    return res.status(400).json({ error: "You can't remove your own admin role." });
  }

  const role = 'role' in data ? (data.role === 'admin' ? 'admin' : 'user') : target.role;
  const perms = 'app_permissions' in data
    ? JSON.stringify(sanitizePermissions(data.app_permissions))
    : target.app_permissions;

  db.prepare('UPDATE users SET role = ?, app_permissions = ?, updated_date = ? WHERE id = ?')
    .run(role, perms, now(), target.id);

  const updated = db.prepare('SELECT id, email, full_name, role, app_permissions, created_date FROM users WHERE id = ?').get(target.id);
  updated.app_permissions = (() => { try { return normalizePermissions(JSON.parse(updated.app_permissions || '{}')); } catch { return {}; } })();
  res.json(updated);
});

// DELETE /api/admin/users/:id -> remove an account (e.g. someone who left the
// company). Their sign-ins stop working immediately, because every request
// looks the user up by id. Records they created (reports, expenses, training)
// are kept; those store the creator's email, not a link to this row.
// The email is also added to removed_users so the person can't simply sign up
// again (open signup would otherwise hand them back default app access).
router.delete('/users/:id', (req, res) => {
  const target = db.prepare('SELECT id, email FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.id === req.user.id) {
    return res.status(400).json({ error: "You can't remove your own account." });
  }
  db.transaction(() => {
    db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(target.id);
    db.prepare('DELETE FROM otps WHERE email = ?').run(target.email);
    db.prepare('DELETE FROM users WHERE id = ?').run(target.id);
    db.prepare('INSERT OR REPLACE INTO removed_users (email, removed_at, removed_by) VALUES (?, ?, ?)')
      .run(target.email.toLowerCase(), now(), req.user.email);
  })();
  res.json({ ok: true });
});

// POST /api/admin/users/:id/password  { password }
// Set a new password for someone (e.g. they forgot theirs). Signs them out
// everywhere: sign-ins issued before now stop working (see getUserFromToken).
router.post('/users/:id/password', (req, res) => {
  const target = db.prepare('SELECT id, email FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.id === req.user.id) {
    return res.status(400).json({ error: "You can't reset your own password here." });
  }
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (password.length > 200) return res.status(400).json({ error: 'Password is too long (200 characters max).' });
  const ts = now();
  db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ?, password_changed_at = ?, updated_date = ? WHERE id = ?')
      .run(hashPassword(password), Date.now(), ts, target.id);
    db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(target.id);
  })();
  res.json({ ok: true });
});

export default router;
