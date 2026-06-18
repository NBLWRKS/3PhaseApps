import express from 'express';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';
import db from './db.js';
import { authRequired, adminRequired } from './auth.js';
import { uploadDir, publicBase } from './routes.uploads.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();
const now = () => new Date().toISOString();

function getReport(id) {
  const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
  if (!row) return null;
  return { ...row, blocks: JSON.parse(row.blocks || '[]') };
}

// Resolve an image URL to local bytes when it points at our own /uploads.
async function loadImageBuffer(url) {
  try {
    const marker = '/uploads/';
    if (url.includes(marker)) {
      const name = url.slice(url.indexOf(marker) + marker.length).split('?')[0];
      const p = path.join(uploadDir, path.basename(name));
      if (fs.existsSync(p)) return fs.readFileSync(p);
    }
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

// POST /api/functions/generatePdf  { reportId }  -> { data: { file_url } }
router.post('/generatePdf', authRequired, async (req, res) => {
  const { reportId } = req.body || {};
  const report = getReport(reportId);
  if (!report) return res.status(404).json({ error: 'Report not found' });

  const filename = `report-${reportId}-${nanoid(6)}.pdf`;
  const outPath = path.join(uploadDir, filename);

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);

  const pageW = doc.page.width;
  const margin = 50;
  const contentW = pageW - margin * 2;

  // Header accent bar (primary blue)
  doc.rect(0, 0, pageW, 6).fill('#1b75bc');
  doc.fillColor('#2b2b2b');

  doc.moveDown(1);
  doc.fontSize(22).font('Helvetica-Bold').text(report.project || 'Untitled Report', margin, 40);
  doc.moveDown(0.5);

  doc.fontSize(10).font('Helvetica').fillColor('#555');
  const meta = [];
  if (report.report_type) meta.push(`Type: ${report.report_type.charAt(0).toUpperCase() + report.report_type.slice(1)}`);
  if (report.report_by) meta.push(`Report by: ${report.report_by}`);
  if (report.report_date) meta.push(`Date: ${report.report_date}`);
  if (report.status) meta.push(`Status: ${report.status}`);
  if (meta.length) doc.text(meta.join('    '));

  const stats = [];
  if (report.workers != null) stats.push(`Workers: ${report.workers}`);
  if (report.report_type === 'mechanical') {
    if (report.beds_installed != null) stats.push(`Beds installed: ${report.beds_installed}`);
  } else {
    if (report.devices_installed != null) stats.push(`Devices installed: ${report.devices_installed}`);
    if (report.pipe_ran_ft != null) stats.push(`Pipe ran (ft): ${report.pipe_ran_ft}`);
  }
  if (stats.length) {
    doc.moveDown(0.3);
    doc.text(stats.join('    '));
  }

  doc.moveDown(0.8);
  doc.moveTo(margin, doc.y).lineTo(pageW - margin, doc.y).strokeColor('#e2e8f0').stroke();
  doc.moveDown(0.8);

  for (let i = 0; i < (report.blocks || []).length; i++) {
    const block = report.blocks[i];
    if (doc.y > doc.page.height - 120) doc.addPage();

    doc.fillColor('#1b75bc').fontSize(14).font('Helvetica-Bold')
      .text(`${i + 1}. ${block.title || 'Section'}`, margin, doc.y);
    doc.moveDown(0.3);
    if (block.description) {
      doc.fillColor('#2b2b2b').fontSize(11).font('Helvetica').text(block.description, { width: contentW });
      doc.moveDown(0.4);
    }

    for (const imgUrl of block.images || []) {
      const buf = await loadImageBuffer(imgUrl);
      if (!buf) continue;
      const maxH = 280;
      // Page-break if there isn't room for a reasonable image height.
      if (doc.y > doc.page.height - margin - 80) doc.addPage();
      try {
        // Measure the scaled size so we can advance the cursor by the actual
        // drawn height. pdfkit's doc.image() does NOT move doc.y on its own,
        // which previously caused images to stack on top of each other.
        const img = doc.openImage(buf);
        const avail = doc.page.height - margin - doc.y;
        const boxH = Math.min(maxH, avail);
        const scale = Math.min(contentW / img.width, boxH / img.height);
        const drawW = img.width * scale;
        const drawH = img.height * scale;
        const x = margin + (contentW - drawW) / 2; // center horizontally
        const y = doc.y;
        doc.image(img, x, y, { width: drawW, height: drawH });
        doc.y = y + drawH + 10; // advance past the image + a small gap
      } catch {
        /* skip unsupported image formats (pdfkit supports JPEG/PNG) */
      }
    }
    doc.moveDown(0.6);
  }

  doc.end();

  stream.on('finish', () => {
    res.json({ data: { file_url: `${publicBase()}/uploads/${filename}` } });
  });
  stream.on('error', (err) => res.status(500).json({ error: err.message }));
});

// POST /api/functions/translateReport  { reportId }  (admin only)
router.post('/translateReport', authRequired, adminRequired, async (req, res) => {
  const { reportId } = req.body || {};
  if (!reportId) return res.status(400).json({ error: 'reportId is required' });
  const report = getReport(reportId);
  if (!report) return res.status(404).json({ error: 'Report not found' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'Translation is not configured (ANTHROPIC_API_KEY missing).' });
  }

  const payload = {
    project: report.project || '',
    report_by: report.report_by || '',
    blocks: (report.blocks || []).map((b) => ({ title: b.title || '', description: b.description || '' })),
  };

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [
          {
            role: 'user',
            content:
              `Translate the following JSON report fields from Spanish to English. ` +
              `Return ONLY valid JSON with the exact same structure. Do not translate proper nouns or names.\nInput:\n` +
              JSON.stringify(payload, null, 2),
          },
        ],
      }),
    });
    const data = await r.json();
    const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
    const clean = text.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);

    const translatedBlocks = (report.blocks || []).map((block, i) => ({
      ...block,
      title: result.blocks?.[i]?.title ?? block.title,
      description: result.blocks?.[i]?.description ?? block.description,
    }));

    db.prepare('UPDATE reports SET project=?, report_by=?, blocks=?, updated_date=? WHERE id=?').run(
      result.project || report.project,
      result.report_by || report.report_by,
      JSON.stringify(translatedBlocks),
      now(),
      reportId
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
