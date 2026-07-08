// Render a PDF entirely in the browser — no server conversion needed.
// We use pdfjs-dist (a browser-native library) to draw each page onto a canvas,
// then hand back a PNG Blob per page. This keeps the failure-prone server-side
// canvas rendering out of the picture completely.
import * as pdfjs from 'pdfjs-dist';
// Vite resolves this to a hashed URL for the worker script in the build.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// Cap the rasterized resolution per page. For big vector CAD plans (e.g. a 65MB
// PDF with a few enormous pages), the slow part is rasterizing millions of pixels
// and holding giant canvases in memory — both scale with pixel count, not file
// size. Capping lower keeps loading fast; on-screen you zoom anyway, and PNG is
// kept because it compresses crisp linework better than JPEG. Raise CAP if you
// need more detail at extreme zoom and can accept slower loads.
const MAX_PIXELS = 2_400_000;   // ~2.4 MP: noticeably faster than the old 4 MP

async function renderOnePage(page) {
  let scale = 1.5;
  let viewport = page.getViewport({ scale });
  const area = viewport.width * viewport.height;
  if (area > MAX_PIXELS) {
    scale = Math.max(0.4, scale * Math.sqrt(MAX_PIXELS / area));
    viewport = page.getViewport({ scale });
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: ctx, viewport }).promise;

  const w = canvas.width;
  const h = canvas.height;
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas export failed'))), 'image/png');
  });
  // Free the canvas backing store promptly on big multi-page files.
  canvas.width = 0;
  canvas.height = 0;
  return { blob, width: w, height: h };
}

// Render EVERY page of the given PDF File.
// onProgress(done, total) is called after each page so the UI can show status.
// Returns an array: [{ blob, width, height }, ...] in page order.
export async function renderPdfAllPages(file, onProgress = () => {}) {
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  try {
    const total = doc.numPages;
    const pages = [];
    for (let i = 1; i <= total; i++) {
      const page = await doc.getPage(i);
      // eslint-disable-next-line no-await-in-loop
      pages.push(await renderOnePage(page));
      page.cleanup();
      onProgress(i, total);
    }
    return pages;
  } finally {
    try { await doc.destroy(); } catch { /* ignore */ }
  }
}
