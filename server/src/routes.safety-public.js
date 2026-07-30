import express from 'express';
import db from './db.js';

// PUBLIC, UNAUTHENTICATED routes for the shareable credential cards.
// Mounted at /api/public/safety. These expose ONLY read-only card data for a
// single employee by slug — name and their training records. No auth, no
// mutations, no listing of all employees (so the full roster isn't crawlable
// from here). The private, editable app stays behind auth in routes.safety.js.
const router = express.Router();

// GET /api/public/safety/card/:slug -> { name, photo_url, position, records: [...] }
router.get('/card/:slug', (req, res) => {
  const emp = db.prepare('SELECT id, name, slug, photo_url, position FROM employees WHERE slug = ?').get(req.params.slug);
  if (!emp) return res.status(404).json({ error: 'Not found' });
  const records = db.prepare(
    `SELECT id, training, passed_date, evaluation_date, expires_date, notes
     FROM training_records WHERE employee_id = ? ORDER BY passed_date DESC`
  ).all(emp.id);
  res.json({ name: emp.name, slug: emp.slug, photo_url: emp.photo_url, position: emp.position, records });
});

export default router;
