// Builds PDF buffers for the daily SharePoint export.
// - Reports: same layout as the in-app report PDF (pdfkit, always reliable).
// - Highlights: flatten page images + highlight rectangles into a PDF using
//   pdfkit vector drawing (NOT canvas rasterization, which was unreliable).
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { uploadDir } from './routes.uploads.js';

// Resolve an image URL to local bytes when it points at our own /uploads,
// otherwise fetch it. Returns a Buffer or null.
async function loadImageBuffer(url) {
  try {
    if (!url) return null;
    const marker = '/uploads/';
    if (url.includes(marker)) {
      const name = url.slice(url.indexOf(marker) + marker.length).split('?')[0];
      const p = path.join(uploadDir, path.basename(name));
      if (fs.existsSync(p)) return fs.readFileSync(p);
    }
    // data: URLs (e.g. inlined PNGs) and remote URLs
    if (url.startsWith('data:')) {
      const b64 = url.split(',')[1] || '';
      return Buffer.from(b64, 'base64');
    }
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

// Collect a PDFKit doc into a Buffer. Does NOT call doc.end(); the caller must
// finish drawing and then call doc.end() (we attach listeners first).
function collectDoc(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

// ---- Report PDF (mirrors the in-app report layout) ----
export async function buildReportPdf(report) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const bufPromise = collectDoc(doc);

  const pageW = doc.page.width;
  const margin = 50;
  const contentW = pageW - margin * 2;

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

  const blocks = report.blocks || [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (doc.y > doc.page.height - 120) doc.addPage();
    doc.fillColor('#1b75bc').fontSize(14).font('Helvetica-Bold')
      .text(`${i + 1}. ${block.title || 'Section'}`, margin, doc.y);
    doc.moveDown(0.3);
    if (block.description) {
      doc.fillColor('#2b2b2b').fontSize(11).font('Helvetica').text(block.description, { width: contentW });
      doc.moveDown(0.4);
    }
    for (const imgUrl of block.images || []) {
      const imgBuf = await loadImageBuffer(imgUrl);
      if (!imgBuf) continue;
      if (doc.y > doc.page.height - 220) doc.addPage();
      try {
        doc.image(imgBuf, { fit: [contentW, 240], align: 'center' });
        doc.moveDown(0.5);
      } catch { /* skip unsupported image */ }
    }
    doc.moveDown(0.6);
  }

  doc.end();
  return bufPromise;
}

// ---- Highlighted document PDF (flatten page images + region rectangles) ----
export async function buildHighlightPdf(docRow) {
  // Normalize to a list of pages. New docs have `pages`; older single-image
  // docs fall back to the legacy single image.
  let pages = Array.isArray(docRow.pages) ? docRow.pages : [];
  if (!pages.length && docRow.image_url) {
    pages = [{ url: docRow.image_url, width: docRow.image_width || 0, height: docRow.image_height || 0 }];
  }
  const regions = Array.isArray(docRow.regions) ? docRow.regions : [];

  // Load every page image up front (async), so the PDF is then built
  // synchronously and the stream can't be written to after it ends.
  const pageImages = [];
  for (const pg of pages) {
    // eslint-disable-next-line no-await-in-loop
    pageImages.push(await loadImageBuffer(pg.url));
  }

  const doc = new PDFDocument({ size: 'A4', margin: 24 });
  const bufPromise = collectDoc(doc);

  // Title header
  doc.fillColor('#2b2b2b').fontSize(16).font('Helvetica-Bold').text(docRow.title || 'Highlighted document', 24, 24);
  const sub = [docRow.project ? `Project: ${docRow.project}` : null, docRow.team ? `Team: ${docRow.team}` : null]
    .filter(Boolean).join('    ');
  if (sub) doc.moveDown(0.2).fontSize(10).font('Helvetica').fillColor('#555').text(sub);

  for (let i = 0; i < pages.length; i++) {
    const pg = pages[i];
    const imgBuf = pageImages[i];
    // Every page gets its own sheet; the first one starts a fresh page too so
    // the title header sits on its own area above page 1's image.
    doc.addPage();

    const availW = doc.page.width - 48;
    const availH = doc.page.height - 48;
    const natW = pg.width || 1000;
    const natH = pg.height || 1400;
    const scale = Math.min(availW / natW, availH / natH);
    const drawW = natW * scale;
    const drawH = natH * scale;
    const offX = 24 + (availW - drawW) / 2;
    const offY = 24 + (availH - drawH) / 2;

    if (imgBuf) {
      try { doc.image(imgBuf, offX, offY, { width: drawW, height: drawH }); }
      catch { doc.fillColor('#999').fontSize(10).text('[page image unavailable]', 24, offY); }
    }

    const pageRegions = regions.filter((r) => (r.page ?? 0) === i);
    for (const r of pageRegions) {
      const x = offX + r.x * scale;
      const y = offY + r.y * scale;
      const w = r.w * scale;
      const h = r.h * scale;
      const color = r.color || '#e0211b';
      const angle = Number(r.angle) || 0;
      const cx = x + w / 2;
      const cy = y + h / 2;

      doc.save();
      if (angle) doc.rotate(angle, { origin: [cx, cy] }); // rotate about the rect center
      doc.rect(x, y, w, h).fillOpacity(0.25).fill(color);
      doc.restore();

      if (r.label) {
        // Label stays upright at the (unrotated) top-left for legibility.
        doc.save();
        doc.fillOpacity(1).fillColor(color).fontSize(8).font('Helvetica-Bold')
          .text(r.label, x, Math.max(offY, y - 10), { lineBreak: false });
        doc.restore();
      }
    }
  }

  // ---- Color key legend ----
  const legend = docRow.legend && typeof docRow.legend === 'object' ? docRow.legend : {};
  // Only colors that are actually used AND have a meaning typed in.
  const usedColors = [...new Set(regions.map((r) => r.color).filter(Boolean))];
  const legendEntries = usedColors
    .map((color) => ({ color, text: legend[color] }))
    .filter((e) => e.text && String(e.text).trim());

  if (legendEntries.length) {
    doc.addPage();
    doc.fillColor('#2b2b2b').fontSize(16).font('Helvetica-Bold').text('Color Key', 24, 28);
    doc.moveDown(0.6);
    const swatch = 14;
    const rowH = 24;
    let ly = doc.y;
    for (const { color, text } of legendEntries) {
      doc.save();
      doc.rect(24, ly, swatch, swatch).fillOpacity(1).fill(color);
      doc.lineWidth(0.75).strokeColor('#888').rect(24, ly, swatch, swatch).stroke();
      doc.restore();
      doc.fillColor('#2b2b2b').fontSize(11).font('Helvetica')
        .text(String(text), 24 + swatch + 10, ly + 2, { width: doc.page.width - 24 - swatch - 10 - 24 });
      ly += rowH;
      if (ly > doc.page.height - 40) { doc.addPage(); ly = 40; }
    }
  }

  doc.end();
  return bufPromise;
}

export { loadImageBuffer };
