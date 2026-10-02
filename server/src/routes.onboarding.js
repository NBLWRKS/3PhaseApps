// Onboarding training courses. PUBLIC endpoints power the /onboarding page
// (employee picks their name, views a course PDF, confirms completion). GATED
// endpoints (behind the 'onboarding' permission) manage courses and edit the
// per-employee completion checkmarks shown on the Safety Credentials list.
import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import db from './db.js';
import { authRequired, appReadRequired, appEditRequired } from './auth.js';
import { uploadDir } from './routes.uploads.js';

const router = express.Router();
const id = () => crypto.randomBytes(12).toString('hex');
const now = () => new Date().toISOString();

// Course PDFs live in their own subfolder of the persistent upload dir.
const courseDir = path.join(uploadDir, 'onboarding');
fs.mkdirSync(courseDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, courseDir),
  filename: (_req, file, cb) => {
    const safe = (file.originalname || 'course.pdf').replace(/[^A-Za-z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safe}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 60 * 1024 * 1024 }, // training decks can be large
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname || '');
    cb(ok ? null : new Error('Only PDF files are allowed (convert PowerPoint to PDF first)'), ok);
  },
});

const activeCourses = () =>
  db.prepare('SELECT id, name, stored_file, original_name, sort_order FROM onboarding_courses WHERE archived = 0 ORDER BY sort_order, name').all();

// ========================= PUBLIC (no login) =========================

// Employee dropdown for the /onboarding page (active employees only).
router.get('/public/employees', (_req, res) => {
  res.json(db.prepare('SELECT id, name, slug FROM employees WHERE active = 1 ORDER BY name COLLATE NOCASE').all());
});

// Course list (names only — no file paths leaked beyond what's needed to view).
router.get('/public/courses', (_req, res) => {
  res.json(activeCourses().map((c) => ({ id: c.id, name: c.name, has_file: !!c.stored_file })));
});

// Which courses a given employee has already completed (so the page can show it).
router.get('/public/completions/:employeeId', (req, res) => {
  const rows = db.prepare('SELECT course_id, completed_date FROM onboarding_completions WHERE employee_id = ?').all(req.params.employeeId);
  res.json(rows);
});

// Stream a course PDF for viewing (public — the training content itself).
router.get('/public/course-file/:courseId', (req, res) => {
  const c = db.prepare('SELECT stored_file, original_name FROM onboarding_courses WHERE id = ? AND archived = 0').get(req.params.courseId);
  if (!c || !c.stored_file) return res.status(404).json({ error: 'Not found' });
  const full = path.join(courseDir, c.stored_file);
  if (!full.startsWith(courseDir) || !fs.existsSync(full)) return res.status(404).json({ error: 'File missing' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${(c.original_name || 'course.pdf').replace(/[^A-Za-z0-9._-]/g, '_')}"`);
  fs.createReadStream(full).pipe(res);
});

// Record a completion (the "I agree I completed this course" confirmation).
router.post('/public/complete', (req, res) => {
  const employee_id = req.body?.employee_id;
  const course_id = req.body?.course_id;
  if (!employee_id || !course_id) return res.status(400).json({ error: 'employee_id and course_id required' });
  if (!db.prepare('SELECT id FROM employees WHERE id = ? AND active = 1').get(employee_id)) return res.status(400).json({ error: 'Invalid employee' });
  if (!db.prepare('SELECT id FROM onboarding_courses WHERE id = ? AND archived = 0').get(course_id)) return res.status(400).json({ error: 'Invalid course' });
  upsertCompletion(employee_id, course_id, 'self', null);
  res.json({ ok: true });
});

// ========================= GATED (onboarding permission) =========================

// Full course list for management.
router.get('/courses', authRequired, appReadRequired('onboarding'), (_req, res) => {
  res.json(activeCourses());
});

// Upload a new course (PDF).
router.post('/courses', authRequired, appEditRequired('onboarding'), upload.single('file'), (req, res) => {
  const name = (req.body?.name || '').trim() || (req.file?.originalname || 'Untitled').replace(/\.pdf$/i, '');
  if (!req.file) return res.status(400).json({ error: 'A PDF file is required' });
  const maxRow = db.prepare('SELECT MAX(sort_order) AS m FROM onboarding_courses').get();
  const row = {
    id: id(), name,
    stored_file: req.file.filename,
    original_name: req.file.originalname,
    archived: 0,
    sort_order: (maxRow && maxRow.m != null ? maxRow.m : -1) + 1,
    created_by: req.user?.email || null, created_date: now(), updated_date: now(),
  };
  db.prepare(`INSERT INTO onboarding_courses (id,name,stored_file,original_name,archived,sort_order,created_by,created_date,updated_date)
    VALUES (@id,@name,@stored_file,@original_name,@archived,@sort_order,@created_by,@created_date,@updated_date)`).run(row);
  res.json(row);
});

// Rename a course.
router.put('/courses/:id', authRequired, appEditRequired('onboarding'), (req, res) => {
  const c = db.prepare('SELECT * FROM onboarding_courses WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  const name = req.body?.name != null ? String(req.body.name).trim() : c.name;
  db.prepare('UPDATE onboarding_courses SET name=?, updated_date=? WHERE id=?').run(name, now(), c.id);
  res.json(db.prepare('SELECT * FROM onboarding_courses WHERE id = ?').get(c.id));
});

// Delete a course (and its file + all completions for it).
router.delete('/courses/:id', authRequired, appEditRequired('onboarding'), (req, res) => {
  const c = db.prepare('SELECT * FROM onboarding_courses WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  if (c.stored_file) {
    const full = path.join(courseDir, c.stored_file);
    if (full.startsWith(courseDir) && fs.existsSync(full)) { try { fs.unlinkSync(full); } catch { /* ignore */ } }
  }
  db.prepare('DELETE FROM onboarding_completions WHERE course_id = ?').run(c.id);
  db.prepare('DELETE FROM onboarding_courses WHERE id = ?').run(c.id);
  res.json({ ok: true });
});

// The completion grid for the Safety list: every employee x course checkmark.
// Returns { courses: [...], completions: { "employeeId:courseId": {completed_date, source} } }
router.get('/grid', authRequired, appReadRequired('onboarding'), (_req, res) => {
  const courses = activeCourses().map((c) => ({ id: c.id, name: c.name }));
  const rows = db.prepare('SELECT employee_id, course_id, completed_date, source FROM onboarding_completions').all();
  const completions = {};
  for (const r of rows) completions[`${r.employee_id}:${r.course_id}`] = { completed_date: r.completed_date, source: r.source };
  res.json({ courses, completions });
});

// Manually set/unset a checkmark (for completions done before this system).
router.post('/check', authRequired, appEditRequired('onboarding'), (req, res) => {
  const { employee_id, course_id, completed } = req.body || {};
  if (!employee_id || !course_id) return res.status(400).json({ error: 'employee_id and course_id required' });
  if (completed) {
    upsertCompletion(employee_id, course_id, 'admin', req.user?.email || null);
  } else {
    db.prepare('DELETE FROM onboarding_completions WHERE employee_id = ? AND course_id = ?').run(employee_id, course_id);
  }
  res.json({ ok: true });
});

function upsertCompletion(employee_id, course_id, source, createdBy) {
  const existing = db.prepare('SELECT id FROM onboarding_completions WHERE employee_id = ? AND course_id = ?').get(employee_id, course_id);
  if (existing) return; // already complete — keep the original record
  db.prepare('INSERT INTO onboarding_completions (id, employee_id, course_id, completed_date, source, created_by) VALUES (?,?,?,?,?,?)')
    .run(id(), employee_id, course_id, now(), source, createdBy);
}

export default router;
