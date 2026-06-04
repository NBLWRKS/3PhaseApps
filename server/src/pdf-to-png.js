// Side-effect import: installs DOMMatrix/Path2D globals BEFORE pdfjs loads.
import './canvas-polyfill.js';
import { createCanvas } from '@napi-rs/canvas';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
// Resolve pdfjs's bundled standard fonts so text renders cleanly server-side.
const pdfjsDir = path.dirname(require.resolve('pdfjs-dist/package.json'));
const STANDARD_FONT_DATA_URL = path.join(pdfjsDir, 'standard_fonts') + path.sep;

// Render the first page of a PDF (given as a Buffer) to a PNG Buffer.
// scale controls resolution; 2.0 gives a crisp image suitable for zooming.
export async function pdfFirstPageToPng(pdfBuffer, scale = 2.0) {
  const data = new Uint8Array(pdfBuffer);
  const doc = await pdfjs.getDocument({
    data,
    disableWorker: true,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    // Suppress noisy font path warnings on some PDFs.
    verbosity: 0,
  }).promise;

  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale });
  const width = Math.ceil(viewport.width);
  const height = Math.ceil(viewport.height);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  // White background (PDFs are transparent by default).
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  await page.render({ canvasContext: ctx, viewport }).promise;

  const png = canvas.toBuffer('image/png');
  await doc.destroy();
  return { png, width, height };
}
