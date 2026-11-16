import express from 'express';
import { nanoid } from 'nanoid';
import db from './db.js';
import { authRequired, appReadRequired, appEditRequired } from './auth.js';
import { buildHighlightPdf } from './export-pdf.js';

const router = express.Router();
const now = () => new Date().toISOString();

router.use(authRequired);
// Read access required for all highlight routes; create/update/delete
// additionally require edit access (applied per-route). PDFs are turned into
// page images in the browser (client/src/lib/pdf-render.js), not here.
router.use(appReadRequired('highlight'));

function rowToDoc(row) {
  if (!row) return null;
  return {
    ...row,
    regions: JSON.parse(row.regions || '[]'),
    pages: JSON.parse(row.pages || '[]'),
    legend: JSON.parse(row.legend || '{}'),
  };
}

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
    `INSERT INTO highlights (id, title, project, team, image_url, image_width, image_height, regions, pages, legend, created_by, updated_by, created_date, updated_date)
     VALUES (@id, @title, @project, @team, @image_url, @image_width, @image_height, @regions, @pages, @legend, @created_by, @updated_by, @created_date, @updated_date)`
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
    legend: JSON.stringify(data.legend ?? {}),
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
  // Saves replace the whole drawing (all highlights), so a save based on an
  // older copy would silently erase whatever someone else saved meanwhile.
  // The editor sends the updated_date it loaded; if the document has changed
  // since, refuse with 409 unless the person chose to overwrite (force).
  if (data.base_updated_date && data.base_updated_date !== existing.updated_date && !data.force) {
    return res.status(409).json({
      error: 'Someone else saved this drawing after you opened it.',
      conflict: { updated_by: existing.updated_by, updated_date: existing.updated_date },
    });
  }
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
    legend: data.legend !== undefined ? JSON.stringify(data.legend) : existing.legend,
    updated_by: req.user.email,
    updated_date: now(),
    id: req.params.id,
  };
  db.prepare(
    `UPDATE highlights SET title=@title, project=@project, team=@team, image_url=@image_url, image_width=@image_width,
       image_height=@image_height, regions=@regions, pages=@pages, legend=@legend, updated_by=@updated_by, updated_date=@updated_date WHERE id=@id`
  ).run(merged);
  res.json(rowToDoc(db.prepare('SELECT * FROM highlights WHERE id = ?').get(req.params.id)));
});

// DELETE /api/highlight/:id
router.delete('/:id', appEditRequired('highlight'), (req, res) => {
  db.prepare('DELETE FROM highlights WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
