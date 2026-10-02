// Employee Application packets — applicants (not logged in) submit filled PDFs,
// which are saved to the persistent disk. Viewing/downloading is gated behind
// the 'applications' app permission (packets contain SSN / bank / I-9 data).
import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import db from './db.js';
import { authRequired, appReadRequired } from './auth.js';
import { uploadDir } from './routes.uploads.js';

const router = express.Router();
const id = () => crypto.randomBytes(12).toString('hex');
const now = () => new Date().toISOString();

// Application PDFs live in their own subfolder of the persistent upload dir.
const appDir = path.join(uploadDir, 'applications');
fs.mkdirSync(appDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, appDir),
  filename: (_req, file, cb) => {
    const safe = (file.originalname || 'form.pdf').replace(/[^A-Za-z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safe}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024, files: 12 },
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname || '');
    cb(ok ? null : new Error('Only PDF files are allowed'), ok);
  },
});

// ===== PUBLIC: submit an application packet (applicant is NOT logged in) =====
// multipart form: field "applicant" (name), one or more "files" (the PDFs).
router.post('/submit', upload.array('files', 12), (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'No files received' });
  const applicant = (req.body?.applicant || '').trim() || 'Unnamed applicant';
  const lang = (req.body?.lang || '').trim() || null;
  const record = {
    id: id(),
    applicant,
    lang,
    files: JSON.stringify(files.map((f) => ({ stored: f.filename, name: f.originalname, size: f.size }))),
    created_date: now(),
  };
  db.prepare('INSERT INTO applications (id, applicant, lang, files, created_date) VALUES (@id,@applicant,@lang,@files,@created_date)').run(record);

  // Auto-create a Safety Credentials employee for this applicant (so they appear
  // in the onboarding dropdown and the Safety list). Skips if the name is the
  // generic fallback or a matching active employee already exists.
  let employeeCreated = false;
  try {
    if (applicant && applicant.toLowerCase() !== 'unnamed applicant') {
      const display = toLastFirst(applicant);          // "First Last" -> "Last, First"
      const exists = db.prepare('SELECT id FROM employees WHERE lower(name) = lower(?)').get(display);
      if (!exists) {
        const slug = uniqueEmployeeSlug(empSlugify(display));
        const ts = now();
        db.prepare('INSERT INTO employees (id, name, slug, active, created_date, updated_date) VALUES (?,?,?,1,?,?)')
          .run(id(), display, slug, ts, ts);
        employeeCreated = true;
      }
    }
  } catch { /* employee auto-create is best-effort; never block the submission */ }

  res.json({ ok: true, id: record.id, count: files.length, employeeCreated });
});

// Convert a free-typed "First Last" (or "First M Last") into the Safety list's
// "Last, First" display convention. If it already contains a comma, leave as-is.
function toLastFirst(name) {
  const s = (name || '').trim();
  if (s.includes(',')) return s;
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return s;
  const last = parts[parts.length - 1];
  const first = parts.slice(0, parts.length - 1).join(' ');
  return `${last}, ${first}`;
}
// Mirror of the Safety slug logic (First+Last, PascalCase, ASCII only).
function empSlugify(name) {
  const parts = name.split(',').map((x) => x.trim());
  const first = (parts[1] || '').trim();
  const last = (parts[0] || '').trim();
  const ordered = `${first} ${last}`.trim();
  return ordered.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}
function uniqueEmployeeSlug(base) {
  let slug = base || 'employee'; let s = slug; let n = 2;
  while (db.prepare('SELECT id FROM employees WHERE slug = ?').get(s)) s = `${slug}${n++}`;
  return s;
}

// ===== GATED: list submissions =====
router.get('/', authRequired, appReadRequired('applications'), (_req, res) => {
  const rows = db.prepare('SELECT id, applicant, lang, files, created_date FROM applications ORDER BY created_date DESC').all();
  res.json(rows.map((r) => ({
    id: r.id,
    applicant: r.applicant,
    lang: r.lang,
    created_date: r.created_date,
    files: safeParse(r.files),
  })));
});

// ===== GATED: download one stored PDF =====
router.get('/file/:appId/:stored', authRequired, appReadRequired('applications'), (req, res) => {
  const row = db.prepare('SELECT files FROM applications WHERE id = ?').get(req.params.appId);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const files = safeParse(row.files);
  const match = files.find((f) => f.stored === req.params.stored);
  if (!match) return res.status(404).json({ error: 'File not found' });
  const full = path.join(appDir, match.stored);
  if (!full.startsWith(appDir) || !fs.existsSync(full)) return res.status(404).json({ error: 'File missing on disk' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${(match.name || 'form.pdf').replace(/[^A-Za-z0-9._-]/g, '_')}"`);
  fs.createReadStream(full).pipe(res);
});

// ===== GATED: delete a submission (and its files) =====
router.delete('/:appId', authRequired, appReadRequired('applications'), (req, res) => {
  const row = db.prepare('SELECT files FROM applications WHERE id = ?').get(req.params.appId);
  if (!row) return res.status(404).json({ error: 'Not found' });
  for (const f of safeParse(row.files)) {
    const full = path.join(appDir, f.stored);
    if (full.startsWith(appDir) && fs.existsSync(full)) { try { fs.unlinkSync(full); } catch { /* ignore */ } }
  }
  db.prepare('DELETE FROM applications WHERE id = ?').run(req.params.appId);
  res.json({ ok: true });
});

function safeParse(s) { try { return JSON.parse(s) || []; } catch { return []; } }

export default router;
