import React, { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Loader2, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// One page, drawn when it scrolls near the viewport (long schedules stay quick).
function Page({ pdf, n, width, zoom }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(n <= 2);
  const [size, setSize] = useState(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return undefined;
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) setVisible(true); }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);
  useEffect(() => {
    if (!visible || !width) return undefined;
    let cancelled = false; let task;
    pdf.getPage(n).then((page) => {
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const scale = (width / base.width) * zoom;
      const vp = page.getViewport({ scale: scale * (window.devicePixelRatio || 1) });
      const canvas = ref.current.querySelector('canvas');
      canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
      setSize({ w: vp.width / (window.devicePixelRatio || 1), h: vp.height / (window.devicePixelRatio || 1) });
      task = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
      return task.promise;
    }).catch(() => {});
    return () => { cancelled = true; try { task?.cancel(); } catch { /* ignore */ } };
  }, [pdf, n, width, zoom, visible]);
  return (
    <div ref={ref} className="mx-auto bg-white shadow-sm border border-border" style={{ width: size?.w || width * zoom, minHeight: size?.h || (width * zoom * 1.3) }}>
      <canvas aria-label={`Page ${n}`} style={{ width: size?.w || '100%', height: size?.h || 'auto', display: 'block' }} />
    </div>
  );
}

// PDF viewer: pages fit the panel width; zoom in/out; scrolls inside its own
// box (vertically, and sideways only when zoomed in past fit-width).
export default function PdfViewer({ data, title }) {
  const boxRef = useRef(null);
  const [pdf, setPdf] = useState(null);
  const [error, setError] = useState('');
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    let doc; let cancelled = false;
    setPdf(null); setError('');
    pdfjs.getDocument({ data: data.slice(0) }).promise
      .then((d) => { doc = d; if (!cancelled) setPdf(d); })
      .catch(() => { if (!cancelled) setError('This PDF couldn\'t be displayed. Use Download instead.'); });
    return () => { cancelled = true; doc?.destroy?.(); };
  }, [data]);
  useEffect(() => {
    const el = boxRef.current; if (!el) return undefined;
    const ro = new ResizeObserver(() => setWidth(Math.max(200, el.clientWidth - 24)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="rounded-xl border border-border bg-secondary/50">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border text-sm">
        <span className="truncate text-muted-foreground">{title}{pdf ? ` · ${pdf.numPages} page${pdf.numPages === 1 ? '' : 's'}` : ''}</span>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} aria-label="Zoom out" className="p-1.5 rounded hover:bg-secondary"><ZoomOut className="w-4 h-4" /></button>
          <span className="w-12 text-center tabular-nums text-xs">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))} aria-label="Zoom in" className="p-1.5 rounded hover:bg-secondary"><ZoomIn className="w-4 h-4" /></button>
          <button type="button" onClick={() => setZoom(1)} aria-label="Fit to width" className="p-1.5 rounded hover:bg-secondary"><Maximize2 className="w-4 h-4" /></button>
        </div>
      </div>
      <div ref={boxRef} className="max-h-[75vh] overflow-auto p-3 space-y-3">
        {error ? <p className="text-sm text-destructive py-8 text-center">{error}</p>
          : !pdf || !width ? <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /> Loading…</div>
          : Array.from({ length: pdf.numPages }, (_, i) => <Page key={i} pdf={pdf} n={i + 1} width={width} zoom={zoom} />)}
      </div>
    </div>
  );
}
