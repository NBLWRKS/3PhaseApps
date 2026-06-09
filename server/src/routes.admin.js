import express from 'express';
import db from './db.js';
import { authRequired, adminRequired } from './auth.js';
import { APPS, sanitizePermissions } from './apps.js';

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
      try { return JSON.parse(u.app_permissions || '[]'); } catch { return []; }
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
  updated.app_permissions = (() => { try { return JSON.parse(updated.app_permissions || '[]'); } catch { return []; } })();
  res.json(updated);
});

export default router;
