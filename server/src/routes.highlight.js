import express from 'express';
import { nanoid } from 'nanoid';
import db from './db.js';
import { authRequired, appReadRequired, appEditRequired } from './auth.js';

const router = express.Router();
const now = () => new Date().toISOString();

const FIELDS = ['project', 'report_by', 'report_date', 'status', 'report_type', 'workers', 'devices_installed', 'pipe_ran_ft', 'beds_installed'];

function rowToReport(row) {
  if (!row) return null;
  return { ...row, blocks: JSON.parse(row.blocks || '[]') };
}

// Parse base44-style sort string: "-created_date" => DESC, "created_date" => ASC
function parseSort(sort) {
  const allowed = new Set([...FIELDS, 'created_date', 'updated_date']);
  if (!sort) return 'created_date DESC';
  const desc = sort.startsWith('-');
  const col = desc ? sort.slice(1) : sort;
  if (!allowed.has(col)) return 'created_date DESC';
  return `${col} ${desc ? 'DESC' : 'ASC'}`;
}

router.use(authRequired);
// All report routes require at least read access; mutations additionally
// require edit access (applied per-route below).
router.use(appReadRequired('reports'));

// GET /api/entities/Report?sort=-created_date&limit=100&created_by=email
router.get('/', (req, res) => {
  const { sort, limit, ...filters } = req.query;
  const orderBy = parseSort(sort);
  const where = [];
  const params = [];
  const filterable = new Set([...FIELDS, 'created_by', 'id']);
  for (const [k, v] of Object.entries(filters)) {
    if (filterable.has(k)) {
      where.push(`${k} = ?`);
      params.push(v);
    }
  }
  let sql = 'SELECT * FROM reports';
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ` ORDER BY ${orderBy}`;
  if (limit) {
    sql += ' LIMIT ?';
    params.push(Number(limit));
  }
  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(rowToReport));
});

// GET /api/entities/Report/:id
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Report not found' });
  res.json(rowToReport(row));
});

// POST /api/entities/Report
router.post('/', appEditRequired('reports'), (req, res) => {
  const data = req.body || {};
  if (!data.project) return res.status(400).json({ error: 'project is required' });
  const id = nanoid();
  const ts = now();
  db.prepare(
    `INSERT INTO reports (id, project, report_by, report_date, status, report_type, workers, devices_installed, pipe_ran_ft, beds_installed, blocks, created_by, created_date, updated_date)
     VALUES (@id, @project, @report_by, @report_date, @status, @report_type, @workers, @devices_installed, @pipe_ran_ft, @beds_installed, @blocks, @created_by, @created_date, @updated_date)`
  ).run({
    id,
    project: data.project,
    report_by: data.report_by ?? null,
    report_date: data.report_date ?? null,
    status: data.status ?? 'draft',
    report_type: data.report_type === 'mechanical' ? 'mechanical' : 'electrical',
    workers: data.workers ?? null,
    devices_installed: data.devices_installed ?? null,
    pipe_ran_ft: data.pipe_ran_ft ?? null,
    beds_installed: data.beds_installed ?? null,
    blocks: JSON.stringify(data.blocks ?? []),
    created_by: req.user.email,
    created_date: ts,
    updated_date: ts,
  });
  res.json(rowToReport(db.prepare('SELECT * FROM reports WHERE id = ?').get(id)));
});

// PUT /api/entities/Report/:id
router.put('/:id', appEditRequired('reports'), (req, res) => {
  const existing = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Report not found' });
  const data = req.body || {};
  // Use "key present in payload" semantics (not nullish), so the editor can
  // explicitly clear a field (e.g. null out pipe_ran_ft when switching to a
  // mechanical report) rather than having the old value preserved.
  const pick = (key) => (key in data ? data[key] : existing[key]);
  const merged = {
    project: pick('project'),
    report_by: pick('report_by'),
    report_date: pick('report_date'),
    status: pick('status'),
    report_type: 'report_type' in data
      ? (data.report_type === 'mechanical' ? 'mechanical' : 'electrical')
      : existing.report_type,
    workers: pick('workers'),
    devices_installed: pick('devices_installed'),
    pipe_ran_ft: pick('pipe_ran_ft'),
    beds_installed: pick('beds_installed'),
    blocks: data.blocks !== undefined ? JSON.stringify(data.blocks) : existing.blocks,
    updated_date: now(),
    id: req.params.id,
  };
  db.prepare(
    `UPDATE reports SET project=@project, report_by=@report_by, report_date=@report_date, status=@status,
       report_type=@report_type, workers=@workers, devices_installed=@devices_installed, pipe_ran_ft=@pipe_ran_ft,
       beds_installed=@beds_installed, blocks=@blocks, updated_date=@updated_date
     WHERE id=@id`
  ).run(merged);
  res.json(rowToReport(db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id)));
});

// DELETE /api/entities/Report/:id
router.delete('/:id', appEditRequired('reports'), (req, res) => {
  db.prepare('DELETE FROM reports WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
