// Project Tracking API — Project -> Area -> Task hierarchy with weighted
// completion rollups. Status is derived from percent + the manual blocked flag.
import express from 'express';
import crypto from 'crypto';
import db from './db.js';
import { authRequired, appReadRequired, appEditRequired } from './auth.js';

const router = express.Router();
const id = () => crypto.randomBytes(12).toString('hex');
const now = () => new Date().toISOString();

// Next sort_order for appending a new row at the bottom of its scope.
function nextSort(table, scopeCol, scopeId) {
  const row = db.prepare(`SELECT MAX(sort_order) AS m FROM ${table} WHERE ${scopeCol} = ?`).get(scopeId);
  return (row && row.m != null ? row.m : -1) + 1;
}
// For projects (no scope column) — next across all non-archived projects.
function nextProjectSort() {
  const row = db.prepare('SELECT MAX(sort_order) AS m FROM tracking_projects').get();
  return (row && row.m != null ? row.m : -1) + 1;
}

router.use(authRequired);
router.use(appReadRequired('tracking'));

// ---- Derived status from percent + blocked flag ----
function statusOf(task) {
  if (task.blocked) return 'blocked';
  if (task.percent >= 100) return 'complete';
  if (task.percent <= 0) return 'not_started';
  return 'in_progress';
}

// Weighted average of a list of {percent, weight}. Returns 0 when no weight.
function weightedPercent(items) {
  let wsum = 0;
  let psum = 0;
  for (const it of items) {
    const w = Number(it.weight) || 0;
    wsum += w;
    psum += w * (Number(it.percent) || 0);
  }
  return wsum > 0 ? Math.round(psum / wsum) : 0;
}

// Build the full tracking tree with rollups for a project (or all projects).
function buildSummary(projectId) {
  const projects = projectId
    ? db.prepare('SELECT * FROM tracking_projects WHERE id = ? AND archived = 0').all(projectId)
    : db.prepare('SELECT * FROM tracking_projects WHERE archived = 0 ORDER BY sort_order, name').all();

  const out = [];
  for (const p of projects) {
    const areas = db.prepare('SELECT * FROM tracking_areas WHERE project_id = ? ORDER BY sort_order, name').all(p.id);
    const areaOut = [];
    // Roll the project up from AREA percentages, each area weighted by the sum
    // of its task weights (so a big area counts more than a small one).
    const areaRollupItems = [];
    for (const a of areas) {
      const tasks = db.prepare('SELECT * FROM tracking_tasks WHERE area_id = ? ORDER BY sort_order, name').all(a.id);
      const taskItems = tasks.map((t) => ({
        ...t,
        blocked: !!t.blocked,
        status: statusOf({ ...t, blocked: !!t.blocked }),
      }));
      const areaPercent = weightedPercent(taskItems);
      const areaWeight = taskItems.reduce((s, t) => s + (Number(t.weight) || 0), 0);
      areaOut.push({
        ...a,
        percent: areaPercent,
        weight: areaWeight,
        task_count: taskItems.length,
        blocked_count: taskItems.filter((t) => t.status === 'blocked').length,
        tasks: taskItems,
      });
      areaRollupItems.push({ percent: areaPercent, weight: areaWeight });
    }
    const projectPercent = weightedPercent(areaRollupItems);
    // Flat task list for status/readiness counts.
    const allTasks = areaOut.flatMap((a) => a.tasks);
    const statusCounts = {
      not_started: allTasks.filter((t) => t.status === 'not_started').length,
      in_progress: allTasks.filter((t) => t.status === 'in_progress').length,
      complete: allTasks.filter((t) => t.status === 'complete').length,
      blocked: allTasks.filter((t) => t.status === 'blocked').length,
    };
    out.push({
      ...p,
      percent: projectPercent,
      area_count: areaOut.length,
      task_count: allTasks.length,
      status_counts: statusCounts,
      areas: areaOut,
    });
  }
  return out;
}

// ===== Summary (the dashboard + table data source) =====
// GET /api/tracking/summary            -> all projects with rollups
// GET /api/tracking/summary?project=ID -> one project
router.get('/summary', (req, res) => {
  res.json(buildSummary(req.query.project || null));
});

// ===== Projects =====
router.get('/projects', (_req, res) => {
  res.json(db.prepare('SELECT * FROM tracking_projects WHERE archived = 0 ORDER BY sort_order, name').all());
});

router.post('/projects', appEditRequired('tracking'), (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name required' });
  const row = {
    id: id(), name, archived: 0,
    sort_order: req.body?.sort_order != null ? Number(req.body.sort_order) : nextProjectSort(),
    created_by: req.user?.email || null, created_date: now(), updated_date: now(),
  };
  db.prepare(`INSERT INTO tracking_projects (id,name,archived,sort_order,created_by,created_date,updated_date)
    VALUES (@id,@name,@archived,@sort_order,@created_by,@created_date,@updated_date)`).run(row);
  res.json(row);
});

// Duplicate a project as a fresh template: copies areas + tasks (names + weights
// + ordering) but RESETS each task's percent to 0 and clears assignee, target
// date, blocked flag, and notes. Used to reuse a project structure for a new job.
router.post('/projects/:id/duplicate', appEditRequired('tracking'), (req, res) => {
  const src = db.prepare('SELECT * FROM tracking_projects WHERE id = ?').get(req.params.id);
  if (!src) return res.status(404).json({ error: 'Not found' });
  const newName = (req.body?.name || '').trim() || `${src.name} (copy)`;
  const ts = now();

  const newProject = {
    id: id(), name: newName, archived: 0,
    sort_order: src.sort_order,
    created_by: req.user?.email || null, created_date: ts, updated_date: ts,
  };

  const insertProject = db.prepare(`INSERT INTO tracking_projects (id,name,archived,sort_order,created_by,created_date,updated_date)
    VALUES (@id,@name,@archived,@sort_order,@created_by,@created_date,@updated_date)`);
  const insertArea = db.prepare(`INSERT INTO tracking_areas (id,project_id,name,sort_order,created_date,updated_date)
    VALUES (@id,@project_id,@name,@sort_order,@created_date,@updated_date)`);
  const insertTask = db.prepare(`INSERT INTO tracking_tasks
    (id,area_id,name,percent,weight,blocked,assignee,target_date,notes,sort_order,created_by,updated_by,created_date,updated_date)
    VALUES (@id,@area_id,@name,@percent,@weight,@blocked,@assignee,@target_date,@notes,@sort_order,@created_by,@updated_by,@created_date,@updated_date)`);

  const doCopy = db.transaction(() => {
    insertProject.run(newProject);
    const areas = db.prepare('SELECT * FROM tracking_areas WHERE project_id = ? ORDER BY sort_order, name').all(src.id);
    for (const a of areas) {
      const newAreaId = id();
      insertArea.run({
        id: newAreaId, project_id: newProject.id, name: a.name,
        sort_order: a.sort_order, created_date: ts, updated_date: ts,
      });
      const tasks = db.prepare('SELECT * FROM tracking_tasks WHERE area_id = ? ORDER BY sort_order, name').all(a.id);
      for (const t of tasks) {
        insertTask.run({
          id: id(), area_id: newAreaId, name: t.name,
          percent: 0,            // reset progress
          weight: t.weight,      // keep weight
          blocked: 0,            // clear blocked
          assignee: null,        // clear assignee
          target_date: null,     // clear target date
          notes: null,           // clear notes
          sort_order: t.sort_order,
          created_by: req.user?.email || null, updated_by: req.user?.email || null,
          created_date: ts, updated_date: ts,
        });
      }
    }
  });
  doCopy();
  res.json(newProject);
});

router.put('/projects/:id', appEditRequired('tracking'), (req, res) => {
  const p = db.prepare('SELECT * FROM tracking_projects WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  const name = req.body?.name != null ? String(req.body.name).trim() : p.name;
  const archived = req.body?.archived != null ? (req.body.archived ? 1 : 0) : p.archived;
  const sort_order = req.body?.sort_order != null ? Number(req.body.sort_order) : p.sort_order;
  db.prepare('UPDATE tracking_projects SET name=?, archived=?, sort_order=?, updated_date=? WHERE id=?')
    .run(name, archived, sort_order, now(), p.id);
  res.json(db.prepare('SELECT * FROM tracking_projects WHERE id = ?').get(p.id));
});

router.delete('/projects/:id', appEditRequired('tracking'), (req, res) => {
  const p = db.prepare('SELECT * FROM tracking_projects WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  // Cascade: delete areas + their tasks.
  const areas = db.prepare('SELECT id FROM tracking_areas WHERE project_id = ?').all(p.id);
  const delTasks = db.prepare('DELETE FROM tracking_tasks WHERE area_id = ?');
  for (const a of areas) delTasks.run(a.id);
  db.prepare('DELETE FROM tracking_areas WHERE project_id = ?').run(p.id);
  db.prepare('DELETE FROM tracking_projects WHERE id = ?').run(p.id);
  res.json({ ok: true });
});

// ===== Areas =====
router.post('/areas', appEditRequired('tracking'), (req, res) => {
  const project_id = req.body?.project_id;
  const name = (req.body?.name || '').trim();
  if (!project_id || !name) return res.status(400).json({ error: 'project_id and name required' });
  const proj = db.prepare('SELECT id FROM tracking_projects WHERE id = ?').get(project_id);
  if (!proj) return res.status(400).json({ error: 'Invalid project' });
  const row = {
    id: id(), project_id, name,
    sort_order: req.body?.sort_order != null ? Number(req.body.sort_order) : nextSort('tracking_areas', 'project_id', project_id),
    created_date: now(), updated_date: now(),
  };
  db.prepare(`INSERT INTO tracking_areas (id,project_id,name,sort_order,created_date,updated_date)
    VALUES (@id,@project_id,@name,@sort_order,@created_date,@updated_date)`).run(row);
  res.json(row);
});

router.put('/areas/:id', appEditRequired('tracking'), (req, res) => {
  const a = db.prepare('SELECT * FROM tracking_areas WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Not found' });
  const name = req.body?.name != null ? String(req.body.name).trim() : a.name;
  const sort_order = req.body?.sort_order != null ? Number(req.body.sort_order) : a.sort_order;
  db.prepare('UPDATE tracking_areas SET name=?, sort_order=?, updated_date=? WHERE id=?')
    .run(name, sort_order, now(), a.id);
  res.json(db.prepare('SELECT * FROM tracking_areas WHERE id = ?').get(a.id));
});

router.delete('/areas/:id', appEditRequired('tracking'), (req, res) => {
  const a = db.prepare('SELECT * FROM tracking_areas WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM tracking_tasks WHERE area_id = ?').run(a.id);
  db.prepare('DELETE FROM tracking_areas WHERE id = ?').run(a.id);
  res.json({ ok: true });
});

// ===== Tasks =====
function clampPct(v) { const n = Math.round(Number(v)); return Math.max(0, Math.min(100, isNaN(n) ? 0 : n)); }

router.post('/tasks', appEditRequired('tracking'), (req, res) => {
  const area_id = req.body?.area_id;
  const name = (req.body?.name || '').trim();
  if (!area_id || !name) return res.status(400).json({ error: 'area_id and name required' });
  const area = db.prepare('SELECT id FROM tracking_areas WHERE id = ?').get(area_id);
  if (!area) return res.status(400).json({ error: 'Invalid area' });
  const row = {
    id: id(), area_id, name,
    percent: clampPct(req.body?.percent),
    weight: Number(req.body?.weight) > 0 ? Number(req.body.weight) : 1,
    blocked: req.body?.blocked ? 1 : 0,
    assignee: (req.body?.assignee || '').trim() || null,
    target_date: req.body?.target_date || null,
    notes: (req.body?.notes || '').trim() || null,
    sort_order: req.body?.sort_order != null ? Number(req.body.sort_order) : nextSort('tracking_tasks', 'area_id', area_id),
    created_by: req.user?.email || null, updated_by: req.user?.email || null,
    created_date: now(), updated_date: now(),
  };
  db.prepare(`INSERT INTO tracking_tasks
    (id,area_id,name,percent,weight,blocked,assignee,target_date,notes,sort_order,created_by,updated_by,created_date,updated_date)
    VALUES (@id,@area_id,@name,@percent,@weight,@blocked,@assignee,@target_date,@notes,@sort_order,@created_by,@updated_by,@created_date,@updated_date)`).run(row);
  res.json({ ...row, blocked: !!row.blocked });
});

router.put('/tasks/:id', appEditRequired('tracking'), (req, res) => {
  const t = db.prepare('SELECT * FROM tracking_tasks WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {};
  const name = b.name != null ? String(b.name).trim() : t.name;
  const percent = b.percent != null ? clampPct(b.percent) : t.percent;
  const weight = b.weight != null ? (Number(b.weight) > 0 ? Number(b.weight) : 1) : t.weight;
  const blocked = b.blocked != null ? (b.blocked ? 1 : 0) : t.blocked;
  const assignee = b.assignee != null ? (String(b.assignee).trim() || null) : t.assignee;
  const target_date = b.target_date !== undefined ? (b.target_date || null) : t.target_date;
  const notes = b.notes != null ? (String(b.notes).trim() || null) : t.notes;
  const sort_order = b.sort_order != null ? Number(b.sort_order) : t.sort_order;
  db.prepare(`UPDATE tracking_tasks SET name=?, percent=?, weight=?, blocked=?, assignee=?, target_date=?, notes=?, sort_order=?, updated_by=?, updated_date=? WHERE id=?`)
    .run(name, percent, weight, blocked, assignee, target_date, notes, sort_order, req.user?.email || null, now(), t.id);
  const updated = db.prepare('SELECT * FROM tracking_tasks WHERE id = ?').get(t.id);
  res.json({ ...updated, blocked: !!updated.blocked });
});

router.delete('/tasks/:id', appEditRequired('tracking'), (req, res) => {
  const t = db.prepare('SELECT * FROM tracking_tasks WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM tracking_tasks WHERE id = ?').run(t.id);
  res.json({ ok: true });
});

// ===== Reorder (drag-and-drop persistence) =====
// Each takes { ids: [...] } in the new display order and writes sort_order = index.
function applyOrder(table, ids) {
  const upd = db.prepare(`UPDATE ${table} SET sort_order = ?, updated_date = ? WHERE id = ?`);
  const ts = now();
  const tx = db.transaction((list) => {
    list.forEach((rowId, i) => upd.run(i, ts, rowId));
  });
  tx(ids);
}

router.post('/projects/reorder', appEditRequired('tracking'), (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  if (!ids.length) return res.status(400).json({ error: 'ids required' });
  applyOrder('tracking_projects', ids);
  res.json({ ok: true });
});

router.post('/areas/reorder', appEditRequired('tracking'), (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  if (!ids.length) return res.status(400).json({ error: 'ids required' });
  applyOrder('tracking_areas', ids);
  res.json({ ok: true });
});

router.post('/tasks/reorder', appEditRequired('tracking'), (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  if (!ids.length) return res.status(400).json({ error: 'ids required' });
  applyOrder('tracking_tasks', ids);
  res.json({ ok: true });
});

export default router;
