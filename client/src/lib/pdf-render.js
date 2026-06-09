// Render a PDF entirely in the browser — no server conversion needed.
// We use pdfjs-dist (a browser-native library) to draw page 1 onto a canvas,
// then hand back a PNG Blob + dimensions. This keeps the failure-prone
// server-side canvas rendering out of the picture completely.
import * as pdfjs from 'pdfjs-dist';
// Vite resolves this to a hashed URL for the worker script in the build.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// Keep the rendered canvas at a sane resolution so big plans don't blow up
// browser memory either. ~4 megapixels stays crisp for zooming.
const MAX_PIXELS = 4_000_000;

// Returns { blob, width, height } for the first page of the given PDF File.
export async function renderPdfFirstPage(file) {
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  try {
    const page = await doc.getPage(1);

    let scale = 2.0;
    let viewport = page.getViewport({ scale });
    const area = viewport.width * viewport.height;
    if (area > MAX_PIXELS) {
      scale = Math.max(0.5, scale * Math.sqrt(MAX_PIXELS / area));
      viewport = page.getViewport({ scale });
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport }).promise;

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas export failed'))), 'image/png');
    });

    return { blob, width: canvas.width, height: canvas.height };
  } finally {
    try { await doc.destroy(); } catch { /* ignore */ }
  }
}
