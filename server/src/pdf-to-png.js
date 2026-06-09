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

// Cap the rendered canvas area so a large/high-DPI PDF can't exhaust memory and
// get the process killed (which manifests as a request that hangs forever).
// ~4 megapixels keeps memory modest while staying sharp enough to zoom.
const MAX_PIXELS = 4_000_000;

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Render the first page of a PDF (given as a Buffer) to a PNG Buffer.
// `scale` is the requested resolution multiplier; it is automatically reduced
// if the page is so large that the canvas would exceed MAX_PIXELS.
export async function pdfFirstPageToPng(pdfBuffer, scale = 2.0, { log = () => {} } = {}) {
  log('parsing PDF');
  const data = new Uint8Array(pdfBuffer);
  const doc = await withTimeout(
    pdfjs.getDocument({
      data,
      disableWorker: true,
      standardFontDataUrl: STANDARD_FONT_DATA_URL,
      verbosity: 0,
    }).promise,
    20000,
    'PDF parse'
  );

  try {
    log(`loaded, ${doc.numPages} page(s); rendering page 1`);
    const page = await doc.getPage(1);

    // Start from requested scale, then clamp so width*height <= MAX_PIXELS.
    let viewport = page.getViewport({ scale });
    const area = viewport.width * viewport.height;
    if (area > MAX_PIXELS) {
      const factor = Math.sqrt(MAX_PIXELS / area);
      const clamped = Math.max(0.5, scale * factor);
      log(`page is large (${Math.round(area)}px²); reducing scale ${scale} -> ${clamped.toFixed(2)}`);
      viewport = page.getViewport({ scale: clamped });
    }

    const width = Math.ceil(viewport.width);
    const height = Math.ceil(viewport.height);
    log(`canvas ${width}x${height}`);

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    await withTimeout(
      page.render({ canvasContext: ctx, viewport }).promise,
      25000,
      'PDF render'
    );

    log('encoding PNG');
    const png = canvas.toBuffer('image/png');
    log(`done, ${png.length} bytes`);
    return { png, width, height };
  } finally {
    // Always release pdfjs resources, even on error/timeout.
    try { await doc.destroy(); } catch { /* ignore */ }
  }
}
