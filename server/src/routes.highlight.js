import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';
import db from './db.js';
import { authRequired, appReadRequired, appEditRequired } from './auth.js';
import { uploadDir } from './routes.uploads.js';
import { pdfFirstPageToPng } from './pdf-to-png.js';
import { buildHighlightPdf } from './export-pdf.js';

const router = express.Router();
const now = () => new Date().toISOString();

// PDFs are converted in memory; the resulting PNG is written to disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024 }, // 40MB PDFs
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname));
  },
});

router.use(authRequired);
// Read access required for all highlight routes; create/update/delete and the
// PDF-convert upload additionally require edit access (applied per-route).
router.use(appReadRequired('highlight'));

function rowToDoc(row) {
  if (!row) return null;
  return {
    ...row,
    regions: JSON.parse(row.regions || '[]'),
    pages: JSON.parse(row.pages || '[]'),
  };
}

// POST /api/highlight/convert  (multipart, field "file": a PDF)
// Converts page 1 to PNG, stores it, returns { file_url, width, height }.
router.post('/convert', appEditRequired('highlight'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No PDF uploaded' });
  const tag = `[highlight/convert ${nanoid(5)}]`;
  const sizeKb = Math.round((req.file.size || req.file.buffer.length) / 1024);
  console.log(`${tag} received ${sizeKb}KB from ${req.user?.email || 'unknown'}`);
  const t0 = Date.now();
  try {
    const { png, width, height } = await pdfFirstPageToPng(req.file.buffer, 2.0, {
      log: (m) => console.log(`${tag} ${m} (+${Date.now() - t0}ms)`),
    });
    const filename = `highlight-${nanoid()}.png`;
    fs.writeFileSync(path.join(uploadDir, filename), png);
    const base = process.env.PUBLIC_URL || '';
    console.log(`${tag} success in ${Date.now() - t0}ms`);
    res.json({ file_url: `${base}/uploads/${filename}`, width, height });
  } catch (err) {
    // Log full detail server-side so it shows up in the Render Logs tab.
    console.error(`${tag} failed after ${Date.now() - t0}ms:`, err && err.stack ? err.stack : err);
    const msg = String(err && err.message ? err.message : err);
    const hint = /canvas|\.node|cannot find module|GLIBC|invalid ELF|napi/i.test(msg)
      ? 'Image rendering library failed to load on the server. Check that @napi-rs/canvas installed correctly for this platform.'
      : /timed out/i.test(msg)
      ? 'The PDF took too long to render. It may be very large or complex.'
      : null;
    res.status(500).json({ error: `Failed to convert PDF: ${msg}`, hint });
  }
});

function sendPdf(res, buffer, filename) {
  const safe = (filename || 'highlight').replace(/[^\w.-]+/g, '_').slice(0, 80);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${safe}.pdf"`);
  res.send(buffer);
}

// POST /api/highlight/export  { title, project, team, pages, regions, image_* }
// Flattens the CURRENT (possibly unsaved) document state to a PDF and returns it
// as a download. Lets the user export edits without saving first.
router.post('/export', async (req, res) => {
  try {
    const data = req.body || {};
    const pages = Array.isArray(data.pages) ? data.pages : [];
    if (!pages.length && !data.image_url) {
      return res.status(400).json({ error: 'Nothing to export (load a PDF first)' });
    }
    const pdf = await buildHighlightPdf(data);
    sendPdf(res, pdf, data.title || 'highlight');
  } catch (err) {
    console.error('[highlight/export] failed:', err && err.stack ? err.stack : err);
    res.status(500).json({ error: `Failed to export PDF: ${err.message}` });
  }
});

// GET /api/highlight/:id/export -> flattened PDF of a SAVED document.
router.get('/:id/export', async (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM highlights WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Document not found' });
    const docData = rowToDoc(row);
    const pdf = await buildHighlightPdf(docData);
    sendPdf(res, pdf, docData.title || 'highlight');
  } catch (err) {
    console.error('[highlight/export] failed:', err && err.stack ? err.stack : err);
    res.status(500).json({ error: `Failed to export PDF: ${err.message}` });
  }
});

// GET /api/highlight  -> list documents (newest first)
router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM highlights ORDER BY created_date DESC').all();
  res.json(rows.map(rowToDoc));
});

// GET /api/highlight/:id
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM highlights WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Document not found' });
  res.json(rowToDoc(row));
});

// POST /api/highlight  { title, image_url, image_width, image_height, regions }
router.post('/', appEditRequired('highlight'), (req, res) => {
  const data = req.body || {};
  if (!data.image_url) return res.status(400).json({ error: 'image_url is required (convert a PDF first)' });
  const id = nanoid();
  const ts = now();
  db.prepare(
    `INSERT INTO highlights (id, title, project, team, image_url, image_width, image_height, regions, pages, created_by, updated_by, created_date, updated_date)
     VALUES (@id, @title, @project, @team, @image_url, @image_width, @image_height, @regions, @pages, @created_by, @updated_by, @created_date, @updated_date)`
  ).run({
    id,
    title: data.title || 'Untitled',
    project: data.project ?? null,
    team: data.team === 'mechanical' ? 'mechanical' : (data.team === 'electrical' ? 'electrical' : null),
    image_url: data.image_url,
    image_width: data.image_width ?? null,
    image_height: data.image_height ?? null,
    regions: JSON.stringify(data.regions ?? []),
    pages: JSON.stringify(data.pages ?? []),
    created_by: req.user.email,
    updated_by: req.user.email,
    created_date: ts,
    updated_date: ts,
  });
  res.json(rowToDoc(db.prepare('SELECT * FROM highlights WHERE id = ?').get(id)));
});

// PUT /api/highlight/:id
router.put('/:id', appEditRequired('highlight'), (req, res) => {
  const existing = db.prepare('SELECT * FROM highlights WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Document not found' });
  const data = req.body || {};
  const pick = (k) => (k in data ? data[k] : existing[k]);
  const merged = {
    title: pick('title'),
    project: pick('project'),
    team: 'team' in data
      ? (data.team === 'mechanical' ? 'mechanical' : (data.team === 'electrical' ? 'electrical' : null))
      : existing.team,
    image_url: pick('image_url'),
    image_width: pick('image_width'),
    image_height: pick('image_height'),
    regions: data.regions !== undefined ? JSON.stringify(data.regions) : existing.regions,
    pages: data.pages !== undefined ? JSON.stringify(data.pages) : existing.pages,
    updated_by: req.user.email,
    updated_date: now(),
    id: req.params.id,
  };
  db.prepare(
    `UPDATE highlights SET title=@title, project=@project, team=@team, image_url=@image_url, image_width=@image_width,
       image_height=@image_height, regions=@regions, pages=@pages, updated_by=@updated_by, updated_date=@updated_date WHERE id=@id`
  ).run(merged);
  res.json(rowToDoc(db.prepare('SELECT * FROM highlights WHERE id = ?').get(req.params.id)));
});

// DELETE /api/highlight/:id
router.delete('/:id', appEditRequired('highlight'), (req, res) => {
  db.prepare('DELETE FROM highlights WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
