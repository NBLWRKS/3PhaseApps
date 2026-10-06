// Onboarding training courses. PUBLIC endpoints power the /onboarding page
// (employee picks their name, views a course, passes its quiz or confirms
// completion). Two kinds of course exist:
//   - BUILT-IN courses ship with the app (onboarding-builtin.json): slide images
//     in English and Spanish served by the frontend from /trainings/<slug>/<lang>/,
//     plus an optional quiz graded here on the server (answers never sent).
//   - UPLOADED courses: a single PDF added from the Onboarding admin page. GATED
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
import { fileURLToPath } from 'url';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- Built-in courses (seeded into onboarding_courses by slug on startup) ----
const BUILTIN = JSON.parse(fs.readFileSync(path.join(__dirname, 'onboarding-builtin.json'), 'utf8'));
const builtinBySlug = Object.fromEntries(BUILTIN.map((c) => [c.slug, c]));
const LANGS = ['en', 'es'];
const pickLang = (l) => (LANGS.includes(l) ? l : 'en');

(function seedBuiltinCourses() {
  BUILTIN.forEach((c, i) => {
    const existing = db.prepare('SELECT id FROM onboarding_courses WHERE slug = ?').get(c.slug);
    if (existing) return; // keep any rename/hide an admin made
    db.prepare(`INSERT INTO onboarding_courses (id,name,stored_file,original_name,archived,sort_order,created_by,created_date,updated_date,slug,builtin)
      VALUES (?,?,NULL,NULL,0,?,'system',?,?,?,1)`).run(crypto.randomBytes(12).toString('hex'), c.name.en, i - 1000, new Date().toISOString(), new Date().toISOString(), c.slug);
  });
})();
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
  db.prepare('SELECT id, name, stored_file, original_name, sort_order, slug, builtin FROM onboarding_courses WHERE archived = 0 ORDER BY sort_order, name').all();

const builtinFor = (course) => (course && course.builtin && course.slug ? builtinBySlug[course.slug] || null : null);

// Public-safe description of a course (no quiz answers).
function describe(c) {
  const b = builtinFor(c);
  if (!b) return { id: c.id, name: c.name, names: { en: c.name, es: c.name }, kind: 'pdf', has_file: !!c.stored_file };
  // An admin rename applies to the English title; Spanish keeps the built-in title.
  return {
    id: c.id, name: c.name, names: { en: c.name, es: b.name.es }, kind: 'slides', slug: b.slug,
    slides: b.slides, note: b.note || null,
    quiz: b.quiz ? { questions: b.quiz.questions.length, pass_pct: b.quiz.pass_pct } : null,
  };
}
const courseById = (cid) => db.prepare('SELECT * FROM onboarding_courses WHERE id = ? AND archived = 0').get(cid);

// ========================= PUBLIC (no login) =========================

// Employee dropdown for the /onboarding page (active employees only).
router.get('/public/employees', (_req, res) => {
  res.json(db.prepare('SELECT id, name, slug FROM employees WHERE active = 1 ORDER BY name COLLATE NOCASE').all());
});

// Course list (names only — no file paths leaked beyond what's needed to view).
router.get('/public/courses', (_req, res) => {
  res.json(activeCourses().map(describe));
});

// Which courses a given employee has already completed (so the page can show it).
router.get('/public/completions/:employeeId', (req, res) => {
  const rows = db.prepare('SELECT course_id, completed_date, score FROM onboarding_completions WHERE employee_id = ?').all(req.params.employeeId);
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

// Quiz questions for a built-in course, in the requested language (no answers).
router.get('/public/quiz/:courseId', (req, res) => {
  const b = builtinFor(courseById(req.params.courseId));
  if (!b || !b.quiz) return res.status(404).json({ error: 'No quiz for this course' });
  const lang = pickLang(req.query.lang);
  res.json({
    title: b.quiz.title[lang],
    pass_pct: b.quiz.pass_pct,
    questions: b.quiz.questions.map((q) => ({ q: q[lang].q, options: q[lang].options })),
  });
});

// Grade a quiz attempt. Passing (>= pass_pct) records the course completion.
// Returns which questions were wrong, but not the correct answers.
router.post('/public/quiz/:courseId', (req, res) => {
  const { employee_id, answers } = req.body || {};
  const lang = pickLang(req.body?.lang);
  const course = courseById(req.params.courseId);
  const b = builtinFor(course);
  if (!b || !b.quiz) return res.status(404).json({ error: 'No quiz for this course' });
  if (!employee_id || !db.prepare('SELECT id FROM employees WHERE id = ? AND active = 1').get(employee_id)) return res.status(400).json({ error: 'Invalid employee' });
  const qs = b.quiz.questions;
  if (!Array.isArray(answers) || answers.length !== qs.length) return res.status(400).json({ error: 'Answer every question' });
  const results = qs.map((q, i) => Number(answers[i]) === q.answer);
  const correct = results.filter(Boolean).length;
  const score = Math.round((correct / qs.length) * 100);
  const passed = score >= b.quiz.pass_pct;
  db.prepare('INSERT INTO onboarding_quiz_attempts (id, employee_id, course_id, lang, score, correct, total, passed, created_date) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id(), employee_id, course.id, lang, score, correct, qs.length, passed ? 1 : 0, now());
  if (passed) upsertCompletion(employee_id, course.id, 'self', null, { score, lang });
  res.json({ score, correct, total: qs.length, passed, pass_pct: b.quiz.pass_pct, results });
});

// Record a completion (the "I agree I completed this course" confirmation).
// Courses with a quiz can only be completed by passing the quiz.
router.post('/public/complete', (req, res) => {
  const employee_id = req.body?.employee_id;
  const course_id = req.body?.course_id;
  if (!employee_id || !course_id) return res.status(400).json({ error: 'employee_id and course_id required' });
  if (!db.prepare('SELECT id FROM employees WHERE id = ? AND active = 1').get(employee_id)) return res.status(400).json({ error: 'Invalid employee' });
  const course = courseById(course_id);
  if (!course) return res.status(400).json({ error: 'Invalid course' });
  if (builtinFor(course)?.quiz) return res.status(400).json({ error: 'This course requires passing the quiz' });
  upsertCompletion(employee_id, course_id, 'self', null, { lang: LANGS.includes(req.body?.lang) ? req.body.lang : null });
  res.json({ ok: true });
});

// ========================= GATED (onboarding permission) =========================

// Full course list for management.
router.get('/courses', authRequired, appReadRequired('onboarding'), (_req, res) => {
  res.json(activeCourses().map((c) => ({ ...c, ...describe(c) })));
});

// Hidden built-in courses (so an admin can bring one back).
router.get('/courses/hidden', authRequired, appReadRequired('onboarding'), (_req, res) => {
  res.json(db.prepare('SELECT id, name, slug FROM onboarding_courses WHERE archived = 1 AND builtin = 1 ORDER BY sort_order').all());
});
router.post('/courses/:id/restore', authRequired, appEditRequired('onboarding'), (req, res) => {
  db.prepare('UPDATE onboarding_courses SET archived = 0, updated_date = ? WHERE id = ? AND builtin = 1').run(now(), req.params.id);
  res.json({ ok: true });
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
  if (c.builtin) {
    // Built-in courses ship with the app, so "delete" hides them instead
    // (completion records are kept and come back if the course is restored).
    db.prepare('UPDATE onboarding_courses SET archived = 1, updated_date = ? WHERE id = ?').run(now(), c.id);
    return res.json({ ok: true, hidden: true });
  }
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
  const rows = db.prepare('SELECT employee_id, course_id, completed_date, source, score, lang FROM onboarding_completions').all();
  const completions = {};
  for (const r of rows) completions[`${r.employee_id}:${r.course_id}`] = { completed_date: r.completed_date, source: r.source, score: r.score, lang: r.lang };
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

function upsertCompletion(employee_id, course_id, source, createdBy, extra = {}) {
  const existing = db.prepare('SELECT id, score FROM onboarding_completions WHERE employee_id = ? AND course_id = ?').get(employee_id, course_id);
  if (existing) {
    // Already complete — keep the original record, but remember a better quiz score.
    if (extra.score != null && (existing.score == null || extra.score > existing.score)) {
      db.prepare('UPDATE onboarding_completions SET score = ?, lang = COALESCE(?, lang) WHERE id = ?').run(extra.score, extra.lang || null, existing.id);
    }
    return;
  }
  db.prepare('INSERT INTO onboarding_completions (id, employee_id, course_id, completed_date, source, created_by, score, lang) VALUES (?,?,?,?,?,?,?,?)')
    .run(id(), employee_id, course_id, now(), source, createdBy, extra.score ?? null, extra.lang || null);
}

export default router;
