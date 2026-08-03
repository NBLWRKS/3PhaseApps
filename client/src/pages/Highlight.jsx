import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { renderPdfAllPages } from '@/lib/pdf-render';
import { canRead, canEdit } from '@/lib/permissions';
import logo from '@/assets/logo.jpg';
import AppSwitcher from '@/components/layout/AppSwitcher';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ArrowLeft, Upload, Loader2, Trash2, Save, Highlighter, Plus, FolderOpen, X, Zap, Wrench, Download, RotateCw, Tag, Search, Hand, MousePointer2,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

// Preset colors for highlighting conveyor sections.
const COLORS = [
  { name: 'Red', value: '#e0211b' },
  { name: 'Blue', value: '#1f7bc2' },
  { name: 'Green', value: '#3fae46' },
  { name: 'Amber', value: '#f5a623' },
  { name: 'Purple', value: '#7b4ea0' },
  { name: 'Orange', value: '#e8731c' },
  { name: 'Teal', value: '#17a2a2' },
  { name: 'Pink', value: '#e0529c' },
  { name: 'Black', value: '#2b2b2b' },
];

// Don't hijack the Space key while the user is typing in a field.
function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export default function Highlight() {
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoadingAuth } = useAuth();

  const [title, setTitle] = useState('Untitled');
  const [project, setProject] = useState('');
  const [team, setTeam] = useState('electrical'); // 'electrical' | 'mechanical'
  const [docId, setDocId] = useState(null);
  // pages: [{ url, width, height }]  — one entry per PDF page, in order.
  const [pages, setPages] = useState([]);
  // regions carry a `page` index (0-based) identifying which page they're on.
  const [regions, setRegions] = useState([]);
  const [selectedId, setSelectedId] = useState(null); // region selected for rotating
  // Editable color-key legend: { [colorValue]: meaningText }. Saved with the doc.
  const [legend, setLegend] = useState({});
  const [activeColor, setActiveColor] = useState(COLORS[0].value);
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState('');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  const [savedDocs, setSavedDocs] = useState([]);
  const [showLibrary, setShowLibrary] = useState(false);
  const [libTeamFilter, setLibTeamFilter] = useState('all'); // all|electrical|mechanical
  const [libSort, setLibSort] = useState('recent'); // recent|oldest|title
  const [librarySearch, setLibrarySearch] = useState(''); // filter library by title/project

  // Drawing state
  const fileInputRef = useRef(null);
  // One <img> ref per page, so we can compute each page's display scale.
  const pageImgRefs = useRef([]);
  const [drawing, setDrawing] = useState(null); // {page,x,y,w,h,ox,oy} natural px
  // Direct-manipulation of an existing region: dragging its body to move, or
  // dragging its rotate handle to spin it. Null when not manipulating.
  // { mode:'move'|'rotate', id, page, startX, startY, origX, origY, cx, cy, startAngle, startPointerAngle }
  const [manip, setManip] = useState(null);
  // renderScales[i] = displayed width / natural width for page i.
  const [renderScales, setRenderScales] = useState({});
  const [zoom, setZoom] = useState(1); // 1 = fit width; >1 zooms in
  // Navigation: a Pan tool lets you drag the zoomed drawing around with the left
  // mouse button. Holding Space (or dragging with the middle button) pans
  // temporarily without leaving the Highlight tool.
  const [tool, setTool] = useState('highlight'); // 'highlight' | 'pan'
  const [spaceHeld, setSpaceHeld] = useState(false);
  const panRef = useRef(null);   // { el, startX, startY, startLeft, startTop }
  const [panning, setPanning] = useState(false);

  const hasPages = pages.length > 0;
  const isAdmin = user?.role === 'admin';
  const canAccess = canRead(user, 'highlight');
  const readOnly = !canEdit(user, 'highlight');

  // Library: apply the team filter, then sort. Pure client-side over loaded docs.
  const visibleDocs = React.useMemo(() => {
    let list = savedDocs;
    if (libTeamFilter !== 'all') {
      list = list.filter((d) => (d.team || '') === libTeamFilter);
    }
    const q = librarySearch.trim().toLowerCase();
    if (q) {
      list = list.filter((d) =>
        (d.title || '').toLowerCase().includes(q) ||
        (d.project || '').toLowerCase().includes(q)
      );
    }
    const sorted = [...list];
    if (libSort === 'title') {
      sorted.sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' }));
    } else if (libSort === 'oldest') {
      sorted.sort((a, b) => new Date(a.created_date || 0) - new Date(b.created_date || 0));
    } else {
      // recent (default): newest edit first, falling back to created date
      sorted.sort((a, b) =>
        new Date(b.updated_date || b.created_date || 0) - new Date(a.updated_date || a.created_date || 0)
      );
    }
    return sorted;
  }, [savedDocs, libTeamFilter, libSort, librarySearch]);

  // Load saved documents for the library drawer.
  const loadDocs = useCallback(async () => {
    try {
      const docs = await base44.highlight.list();
      setSavedDocs(docs);
    } catch (err) {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    if (canAccess) loadDocs();
  }, [canAccess, loadDocs]);

  // Keep each page's natural->display scale in sync with its rendered width.
  const updateScales = useCallback(() => {
    const next = {};
    pageImgRefs.current.forEach((img, i) => {
      if (img && pages[i]?.width) {
        next[i] = img.clientWidth / pages[i].width;
      }
    });
    setRenderScales(next);
  }, [pages]);

  // A ResizeObserver measures each page image's ACTUAL rendered width and fires
  // after the browser has finished layout — including when zoom changes the
  // container width. Reading clientWidth inside a single requestAnimationFrame
  // raced the layout and left highlights positioned with a stale scale (they
  // appeared to drift on zoom). The observer removes that race entirely.
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') {
      // Fallback for very old browsers: measure on next frame.
      const raf = requestAnimationFrame(updateScales);
      window.addEventListener('resize', updateScales);
      return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', updateScales); };
    }
    const ro = new ResizeObserver(() => updateScales());
    pageImgRefs.current.forEach((img) => { if (img) ro.observe(img); });
    // Also measure once now in case images are already laid out.
    updateScales();
    window.addEventListener('resize', updateScales);
    return () => { ro.disconnect(); window.removeEventListener('resize', updateScales); };
  }, [updateScales, pages, zoom]);

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!canAccess) return <Navigate to="/" replace />;

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setConverting(true);
    setProgress('');
    try {
      // Render every page to a PNG entirely in the browser (no server convert).
      const rendered = await renderPdfAllPages(file, (done, total) => {
        setProgress(`Rendering page ${done} of ${total}…`);
      });
      // Upload each page image via the standard upload endpoint so the whole
      // document persists in the archive and is viewable later by other users.
      const uploaded = [];
      for (let i = 0; i < rendered.length; i++) {
        setProgress(`Uploading page ${i + 1} of ${rendered.length}…`);
        const base = file.name.replace(/\.pdf$/i, '') || 'highlight';
        const pngFile = new File([rendered[i].blob], `${base}-p${i + 1}.png`, { type: 'image/png' });
        // eslint-disable-next-line no-await-in-loop
        const { file_url } = await base44.integrations.Core.UploadFile({ file: pngFile });
        uploaded.push({ url: file_url, width: rendered[i].width, height: rendered[i].height });
      }
      pageImgRefs.current = [];
      setPages(uploaded);
      setRegions([]);
      setDocId(null);
      if (title === 'Untitled' && file.name) {
        setTitle(file.name.replace(/\.pdf$/i, ''));
      }
      toast.success(`PDF loaded (${uploaded.length} page${uploaded.length === 1 ? '' : 's'})`);
    } catch (err) {
      setError(err.message || 'Could not load PDF');
      toast.error(err.message || 'Could not load PDF');
    } finally {
      setConverting(false);
      setProgress('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Convert a pointer event to natural-image coordinates within a given page.
  const toNatural = (e, pageIndex, imgEl) => {
    const rect = imgEl.getBoundingClientRect();
    const scale = renderScales[pageIndex] || 1;
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    const dims = pages[pageIndex];
    return {
      x: Math.max(0, Math.min(dims.width, x)),
      y: Math.max(0, Math.min(dims.height, y)),
    };
  };

  // --- Panning: hold Space (or use the Pan tool / middle mouse) and drag to
  // move around a zoomed drawing with the left button. ---
  useEffect(() => {
    const down = (e) => {
      if (e.code === 'Space' && !isTypingTarget(e.target)) {
        e.preventDefault();
        setSpaceHeld(true);
      }
    };
    const up = (e) => { if (e.code === 'Space') setSpaceHeld(false); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // True when a drag should pan instead of draw.
  const panMode = tool === 'pan' || spaceHeld;

  const startPan = (e, scrollEl) => {
    if (!scrollEl) return;
    panRef.current = {
      el: scrollEl,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: scrollEl.scrollLeft,
      startTop: scrollEl.scrollTop,
    };
    setPanning(true);
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
  };

  const movePan = (e) => {
    const p = panRef.current;
    if (!p) return;
    // Drag right => content moves right => scroll left decreases.
    p.el.scrollLeft = p.startLeft - (e.clientX - p.startX);
    p.el.scrollTop = p.startTop - (e.clientY - p.startY);
  };

  const endPan = () => {
    panRef.current = null;
    setPanning(false);
  };

  const onPointerDown = (e, pageIndex, imgEl) => {
    if (!hasPages || readOnly) return;
    e.preventDefault();
    const p = toNatural(e, pageIndex, imgEl);
    setDrawing({ page: pageIndex, x: p.x, y: p.y, w: 0, h: 0, ox: p.x, oy: p.y });
  };

  const onPointerMove = (e, pageIndex, imgEl) => {
    if (!drawing || drawing.page !== pageIndex) return;
    const p = toNatural(e, pageIndex, imgEl);
    setDrawing((d) => ({
      ...d,
      x: Math.min(d.ox, p.x),
      y: Math.min(d.oy, p.y),
      w: Math.abs(p.x - d.ox),
      h: Math.abs(p.y - d.oy),
    }));
  };

  const onPointerUp = () => {
    if (!drawing) return;
    // Ignore tiny accidental clicks.
    if (drawing.w > 6 && drawing.h > 6) {
      setRegions((r) => [
        ...r,
        {
          id: Math.random().toString(36).slice(2, 9),
          page: drawing.page,
          x: Math.round(drawing.x),
          y: Math.round(drawing.y),
          w: Math.round(drawing.w),
          h: Math.round(drawing.h),
          color: activeColor,
          label: '',
        },
      ]);
    }
    setDrawing(null);
  };

  // --- Direct manipulation: move a region by dragging its body ---
  const startMove = (e, r, pageIndex, imgEl) => {
    if (readOnly) return;
    e.stopPropagation();
    e.preventDefault();
    const p = toNatural(e, pageIndex, imgEl);
    setSelectedId(r.id);
    setManip({ mode: 'move', id: r.id, page: pageIndex, startX: p.x, startY: p.y, origX: r.x, origY: r.y });
  };

  // --- Direct manipulation: rotate a region by dragging its handle ---
  const startRotate = (e, r, pageIndex, imgEl) => {
    if (readOnly) return;
    e.stopPropagation();
    e.preventDefault();
    const p = toNatural(e, pageIndex, imgEl);
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const startPointerAngle = Math.atan2(p.y - cy, p.x - cx) * (180 / Math.PI);
    setSelectedId(r.id);
    setManip({ mode: 'rotate', id: r.id, page: pageIndex, cx, cy, startAngle: r.angle || 0, startPointerAngle });
  };

  // Called on pointer-move over the page while a manipulation is active.
  const onManipMove = (e, pageIndex, imgEl) => {
    if (!manip || manip.page !== pageIndex) return;
    const p = toNatural(e, pageIndex, imgEl);
    if (manip.mode === 'move') {
      const dims = pages[pageIndex];
      setRegions((rs) => rs.map((x) => {
        if (x.id !== manip.id) return x;
        let nx = manip.origX + (p.x - manip.startX);
        let ny = manip.origY + (p.y - manip.startY);
        // Keep the rectangle within the page bounds.
        nx = Math.max(0, Math.min(dims.width - x.w, nx));
        ny = Math.max(0, Math.min(dims.height - x.h, ny));
        return { ...x, x: Math.round(nx), y: Math.round(ny) };
      }));
    } else if (manip.mode === 'rotate') {
      const cur = Math.atan2(p.y - manip.cy, p.x - manip.cx) * (180 / Math.PI);
      let next = manip.startAngle + (cur - manip.startPointerAngle);
      // Normalize to a friendly -180..180 range, rounded to whole degrees.
      next = Math.round(((next + 180) % 360 + 360) % 360 - 180);
      setRegions((rs) => rs.map((x) => (x.id === manip.id ? { ...x, angle: next } : x)));
    }
  };

  const endManip = () => setManip(null);

  const removeRegion = (id) => setRegions((r) => r.filter((x) => x.id !== id));
  const renameRegion = (id, label) =>
    setRegions((r) => r.map((x) => (x.id === id ? { ...x, label } : x)));
  const rotateRegion = (id, angle) =>
    setRegions((r) => r.map((x) => (x.id === id ? { ...x, angle: Number(angle) } : x)));

  // Colors actually used by regions, in palette order — drives the legend UI.
  const usedColors = COLORS.filter((c) => regions.some((r) => r.color === c.value));

  const save = async () => {
    if (!hasPages) return;
    setSaving(true);
    setError('');
    const payload = {
      title,
      project,
      team,
      // New multi-page field. Stored alongside the legacy single-image fields
      // (set to page 1) so older code/thumbnails keep working.
      pages,
      image_url: pages[0]?.url || '',
      image_width: pages[0]?.width || 0,
      image_height: pages[0]?.height || 0,
      regions,
      legend,
    };
    try {
      const result = docId
        ? await base44.highlight.update(docId, payload)
        : await base44.highlight.create(payload);
      setDocId(result.id);
      toast.success('Saved');
      loadDocs();
    } catch (err) {
      setError(err.message || 'Save failed');
      toast.error(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const exportPdf = async () => {
    if (!hasPages) return;
    setExporting(true);
    setError('');
    try {
      await base44.highlight.exportPdf({
        title,
        project,
        team,
        pages,
        image_url: pages[0]?.url || '',
        image_width: pages[0]?.width || 0,
        image_height: pages[0]?.height || 0,
        regions,
        legend,
      });
      toast.success('PDF exported');
    } catch (err) {
      setError(err.message || 'Export failed');
      toast.error(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const openDoc = async (id) => {
    try {
      const doc = await base44.highlight.get(id);
      setDocId(doc.id);
      setTitle(doc.title || 'Untitled');
      setProject(doc.project || '');
      setTeam(doc.team === 'mechanical' ? 'mechanical' : 'electrical');
      pageImgRefs.current = [];
      // New docs have a `pages` array; older docs only have a single image.
      if (Array.isArray(doc.pages) && doc.pages.length) {
        setPages(doc.pages);
      } else if (doc.image_url) {
        setPages([{ url: doc.image_url, width: doc.image_width || 0, height: doc.image_height || 0 }]);
      } else {
        setPages([]);
      }
      // Older regions have no `page`; default them to page 0.
      setRegions((doc.regions || []).map((r) => ({ ...r, page: r.page ?? 0 })));
      setLegend(doc.legend && typeof doc.legend === 'object' ? doc.legend : {});
      setSelectedId(null);
      setShowLibrary(false);
    } catch (err) {
      toast.error('Failed to open document');
    }
  };

  const deleteDoc = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Delete this document?')) return;
    try {
      await base44.highlight.delete(id);
      if (id === docId) newDoc();
      loadDocs();
      toast.success('Deleted');
    } catch (err) {
      toast.error('Failed to delete');
    }
  };

  const newDoc = () => {
    setDocId(null);
    setTitle('Untitled');
    setProject('');
    setTeam('electrical');
    pageImgRefs.current = [];
    setPages([]);
    setRegions([]);
    setLegend({});
    setSelectedId(null);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-card border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt="3 Phase Conveyor" className="h-8 w-auto" />
            <span className="text-sm font-semibold text-muted-foreground border-l border-border pl-3">
              Highlight
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { setShowLibrary(true); loadDocs(); }} className="gap-2">
              <FolderOpen className="w-4 h-4" />
              <span className="hidden sm:inline">Library</span>
            </Button>
            <AppSwitcher currentKey="highlight" />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-3 mb-5">
          <Highlighter className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Conveyor Highlighter</h1>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
        )}

        {!hasPages ? (
          /* Upload prompt */
          <div className="border-2 border-dashed border-border rounded-xl p-12 text-center bg-card">
            <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold mb-1">
              {readOnly ? 'Open a saved document' : 'Upload a conveyor PDF'}
            </h2>
            <p className="text-muted-foreground mb-6 text-sm">
              {readOnly
                ? 'You have read-only access. Open a document from the Library to view or export it.'
                : 'Every page is converted to an image you can scroll through and mark up.'}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={handleFile}
              className="hidden"
              id="pdf-input"
            />
            {readOnly ? (
              <Button variant="outline" onClick={() => { setShowLibrary(true); loadDocs(); }} className="gap-2">
                <FolderOpen className="w-4 h-4" />
                Open Library
              </Button>
            ) : (
              <Button onClick={() => fileInputRef.current?.click()} disabled={converting} className="gap-2">
                {converting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {converting ? (progress || 'Loading…') : 'Choose PDF'}
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
            {/* Canvas / image with overlay */}
            <div>
              <div className="mb-4 space-y-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Title</Label>
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="mt-1 w-48 font-medium"
                      placeholder="Document title"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Project</Label>
                    <Input
                      value={project}
                      onChange={(e) => setProject(e.target.value)}
                      className="mt-1 w-48"
                      placeholder="e.g. HOU3"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Team</Label>
                    <div className="mt-1 flex gap-1">
                      <Button
                        type="button"
                        variant={team === 'electrical' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setTeam('electrical')}
                        className="gap-1.5"
                      >
                        <Zap className="w-3.5 h-3.5" /> Electrical
                      </Button>
                      <Button
                        type="button"
                        variant={team === 'mechanical' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setTeam('mechanical')}
                        className="gap-1.5"
                      >
                        <Wrench className="w-3.5 h-3.5" /> Mechanical
                      </Button>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={converting || readOnly} className={`gap-2 ${readOnly ? 'hidden' : ''}`}>
                    {converting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {converting ? (progress || 'Loading…') : 'Replace PDF'}
                  </Button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={handleFile}
                  className="hidden"
                />
              </div>

              <div className="flex items-center gap-2 mb-3 flex-wrap">
                {/* Tool: Highlight (draw) vs Pan (drag to move around) */}
                <div className="inline-flex rounded-md border border-border overflow-hidden">
                  <button
                    onClick={() => setTool('highlight')}
                    className={`flex items-center gap-1 px-2.5 py-1 text-sm ${tool === 'highlight' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'}`}
                    title="Highlight tool — drag to draw a section"
                  >
                    <MousePointer2 className="w-3.5 h-3.5" /> Highlight
                  </button>
                  <button
                    onClick={() => setTool('pan')}
                    className={`flex items-center gap-1 px-2.5 py-1 text-sm border-l border-border ${tool === 'pan' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'}`}
                    title="Pan tool — drag to move around the drawing"
                  >
                    <Hand className="w-3.5 h-3.5" /> Pan
                  </button>
                </div>
                <span className="text-[11px] text-muted-foreground hidden sm:inline">
                  or hold <kbd className="px-1 py-0.5 rounded border border-border bg-muted text-[10px]">Space</kbd> to pan
                </span>

                <span className="text-xs font-medium text-muted-foreground ml-auto">Zoom</span>
                <div className="inline-flex rounded-md border border-border overflow-hidden">
                  <button
                    onClick={() => setZoom((z) => Math.max(1, Math.round((z - 0.25) * 100) / 100))}
                    disabled={zoom <= 1}
                    className="px-2.5 py-1 text-sm text-muted-foreground hover:bg-secondary disabled:opacity-40 disabled:hover:bg-transparent"
                    title="Zoom out"
                  >
                    −
                  </button>
                  <span className="px-2.5 py-1 text-xs font-medium border-x border-border min-w-[3.5rem] text-center tabular-nums">
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    onClick={() => setZoom((z) => Math.min(4, Math.round((z + 0.25) * 100) / 100))}
                    disabled={zoom >= 4}
                    className="px-2.5 py-1 text-sm text-muted-foreground hover:bg-secondary disabled:opacity-40 disabled:hover:bg-transparent"
                    title="Zoom in"
                  >
                    +
                  </button>
                </div>
                {zoom !== 1 && (
                  <button
                    onClick={() => setZoom(1)}
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    Reset
                  </button>
                )}
              </div>

              <div className="space-y-6">
                {pages.map((pg, pageIndex) => {
                  const scale = renderScales[pageIndex] || 1;
                  return (
                    <div key={pageIndex}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-medium text-muted-foreground">
                          Page {pageIndex + 1} of {pages.length}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {regions.filter((r) => r.page === pageIndex).length} section(s)
                        </span>
                      </div>
                      <div className="overflow-auto border border-border rounded-lg bg-muted" data-scroll-container>
                        <div
                          className="relative select-none"
                          data-page-surface
                          style={{
                            width: `${zoom * 100}%`,
                            cursor: panning ? 'grabbing' : panMode ? 'grab' : 'crosshair',
                            touchAction: 'none',
                          }}
                          onPointerDown={(e) => {
                            // Middle mouse (button 1) always pans; left button pans
                            // when the Pan tool is on or Space is held.
                            if (e.button === 1 || panMode) {
                              e.preventDefault();
                              startPan(e, e.currentTarget.closest('[data-scroll-container]'));
                              return;
                            }
                            if (!manip) onPointerDown(e, pageIndex, e.currentTarget.querySelector('img'));
                          }}
                          onPointerMove={(e) => {
                            if (panRef.current) { movePan(e); return; }
                            if (manip) onManipMove(e, pageIndex, e.currentTarget.querySelector('img'));
                            else onPointerMove(e, pageIndex, e.currentTarget.querySelector('img'));
                          }}
                          onPointerUp={() => {
                            if (panRef.current) { endPan(); return; }
                            if (manip) endManip(); else onPointerUp();
                          }}
                          onPointerLeave={() => {
                            if (panRef.current) { endPan(); return; }
                            if (manip) endManip(); else onPointerUp();
                          }}
                        >
                          <img
                            ref={(el) => { pageImgRefs.current[pageIndex] = el; }}
                            src={pg.url}
                            alt={`Conveyor layout page ${pageIndex + 1}`}
                            className="block w-full h-auto pointer-events-none"
                            onLoad={updateScales}
                            draggable={false}
                          />
                        {/* Regions on this page */}
                        {regions.filter((r) => r.page === pageIndex).map((r) => (
                          <div
                            key={r.id}
                            className="absolute group"
                            onPointerDown={(e) => {
                              // In pan mode, let the drag pan the drawing instead
                              // of grabbing this highlight.
                              if (e.button === 1 || panMode) {
                                e.preventDefault();
                                startPan(e, e.currentTarget.closest('[data-scroll-container]'));
                                return;
                              }
                              startMove(e, r, pageIndex, e.currentTarget.closest('[data-page-surface]').querySelector('img'));
                            }}
                            style={{
                              left: r.x * scale,
                              top: r.y * scale,
                              width: r.w * scale,
                              height: r.h * scale,
                              backgroundColor: r.color + '40',
                              transform: r.angle ? `rotate(${r.angle}deg)` : undefined,
                              transformOrigin: 'center center',
                              outline: selectedId === r.id ? '2px dashed #111' : undefined,
                              outlineOffset: 2,
                              cursor: panning ? 'grabbing' : panMode ? 'grab' : readOnly ? 'default' : 'move',
                              touchAction: 'none',
                            }}
                          >
                            {r.label ? (
                              <span
                                className="absolute -top-6 left-0 text-[11px] font-semibold px-1.5 py-0.5 rounded text-white whitespace-nowrap"
                                style={{ backgroundColor: r.color }}
                              >
                                {r.label}
                              </span>
                            ) : null}
                            {/* Rotate handle — appears above the rectangle when selected */}
                            {!readOnly && selectedId === r.id && (
                              <>
                                <div
                                  className="absolute left-1/2 -translate-x-1/2"
                                  style={{ top: -26, width: 2, height: 20, backgroundColor: '#111' }}
                                />
                                <div
                                  onPointerDown={(e) => startRotate(e, r, pageIndex, e.currentTarget.closest('[data-page-surface]').querySelector('img'))}
                                  title="Drag to rotate"
                                  className="absolute left-1/2 -translate-x-1/2 rounded-full bg-white border-2 shadow"
                                  style={{
                                    top: -38, width: 14, height: 14, marginLeft: -1,
                                    borderColor: '#111', cursor: 'grab', touchAction: 'none',
                                  }}
                                />
                              </>
                            )}
                          </div>
                        ))}
                        {/* Live drawing rectangle (only on the active page) */}
                        {drawing && drawing.page === pageIndex && (
                          <div
                            className="absolute pointer-events-none"
                            style={{
                              left: drawing.x * scale,
                              top: drawing.y * scale,
                              width: drawing.w * scale,
                              height: drawing.h * scale,
                              backgroundColor: activeColor + '33',
                              border: `2px dashed ${activeColor}`,
                            }}
                          />
                        )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Scroll through the pages and click-drag on any page to highlight a section of conveyor.
              </p>
            </div>

            {/* Sidebar: colors, regions, save */}
            <aside className="space-y-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Highlight color
                </p>
                <div className="flex flex-wrap gap-2">
                  {COLORS.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => setActiveColor(c.value)}
                      title={c.name}
                      className={`w-8 h-8 rounded-full border-2 transition-transform ${
                        activeColor === c.value ? 'border-foreground scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c.value }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Sections ({regions.length})
                </p>
                {regions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No sections highlighted yet.</p>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {regions.map((r) => (
                      <div
                        key={r.id}
                        className={`bg-card border rounded-lg p-2 ${selectedId === r.id ? 'border-foreground' : 'border-border'}`}
                        onPointerDown={() => setSelectedId(r.id)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
                          <input
                            value={r.label}
                            onChange={(e) => renameRegion(r.id, e.target.value)}
                            placeholder={readOnly ? '(no label)' : 'Optional label'}
                            readOnly={readOnly}
                            className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                          />
                          {pages.length > 1 && (
                            <span className="text-[10px] text-muted-foreground flex-shrink-0">p{(r.page ?? 0) + 1}</span>
                          )}
                          {!readOnly && (
                            <button onClick={() => removeRegion(r.id)} className="text-muted-foreground hover:text-destructive">
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        {!readOnly && (
                          <div className="flex items-center gap-2 mt-1.5 pl-5">
                            <RotateCw className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                            <span className="text-[10px] text-muted-foreground tabular-nums">{r.angle || 0}°</span>
                            <span className="text-[10px] text-muted-foreground/70 flex-1">
                              {selectedId === r.id ? 'drag the handle on the rectangle to rotate' : 'select to move / rotate on the drawing'}
                            </span>
                            {r.angle ? (
                              <button onClick={() => rotateRegion(r.id, 0)} className="text-[10px] text-muted-foreground hover:text-foreground underline flex-shrink-0">reset</button>
                            ) : null}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Color key legend — type a meaning for each color in use */}
              {usedColors.length > 0 && (
                <div className="pt-3 border-t border-border">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Color key</p>
                  </div>
                  <div className="space-y-1.5">
                    {usedColors.map((c) => (
                      <div key={c.value} className="flex items-center gap-2">
                        <span className="w-4 h-4 rounded flex-shrink-0 border border-border" style={{ backgroundColor: c.value }} />
                        <input
                          value={legend[c.value] || ''}
                          onChange={(e) => setLegend((l) => ({ ...l, [c.value]: e.target.value }))}
                          readOnly={readOnly}
                          placeholder={`What does ${c.name.toLowerCase()} mean?`}
                          className="flex-1 min-w-0 bg-card border border-border rounded px-2 py-1 text-xs outline-none focus:border-primary placeholder:text-muted-foreground/60"
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1.5">This key appears on the exported PDF.</p>
                </div>
              )}

              <div className="flex flex-col gap-2 pt-2 border-t border-border">
                {readOnly && (
                  <p className="text-xs text-muted-foreground mb-1">
                    You have read-only access. You can view and export, but not edit.
                  </p>
                )}
                {!readOnly && (
                  <Button onClick={save} disabled={saving} className="gap-2 w-full">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {docId ? 'Update document' : 'Save document'}
                  </Button>
                )}
                <Button variant="outline" onClick={exportPdf} disabled={exporting} className="gap-2 w-full">
                  {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Export PDF
                </Button>
                {!readOnly && (
                  <Button variant="outline" onClick={newDoc} className="gap-2 w-full">
                    <Plus className="w-4 h-4" />
                    New document
                  </Button>
                )}
              </div>
            </aside>
          </div>
        )}
      </main>

      {/* Library drawer */}
      {showLibrary && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setShowLibrary(false)} />
          <div className="w-full max-w-md bg-card h-full overflow-y-auto p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Saved documents</h2>
              <button onClick={() => setShowLibrary(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search by title or project */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={librarySearch}
                onChange={(e) => setLibrarySearch(e.target.value)}
                placeholder="Search by title or project…"
                className="w-full pl-9 pr-8 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-primary"
              />
              {librarySearch && (
                <button
                  onClick={() => setLibrarySearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  title="Clear"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Team filter */}
            <div className="mb-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Team</p>
              <div className="flex gap-1.5">
                {[
                  { value: 'all', label: 'All', Icon: null },
                  { value: 'electrical', label: 'Electrical', Icon: Zap },
                  { value: 'mechanical', label: 'Mechanical', Icon: Wrench },
                ].map(({ value, label, Icon }) => (
                  <button
                    key={value}
                    onClick={() => setLibTeamFilter(value)}
                    className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-md border transition-colors ${
                      libTeamFilter === value
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border text-muted-foreground hover:bg-secondary'
                    }`}
                  >
                    {Icon && <Icon className="w-3 h-3" />}
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Sort */}
            <div className="mb-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Sort by</p>
              <div className="flex gap-1.5">
                {[
                  { value: 'recent', label: 'Most recent' },
                  { value: 'oldest', label: 'Oldest' },
                  { value: 'title', label: 'Title A–Z' },
                ].map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setLibSort(value)}
                    className={`text-xs font-medium px-2.5 py-1.5 rounded-md border transition-colors ${
                      libSort === value
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border text-muted-foreground hover:bg-secondary'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {savedDocs.length === 0 ? (
              <p className="text-muted-foreground text-sm">No saved documents yet.</p>
            ) : visibleDocs.length === 0 ? (
              <p className="text-muted-foreground text-sm">No documents match this filter.</p>
            ) : (
              <div className="space-y-2">
                {visibleDocs.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => openDoc(d.id)}
                    className="w-full text-left flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-secondary transition-colors"
                  >
                    <img src={d.image_url} alt="" className="w-14 h-14 object-cover rounded border border-border flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{d.title}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        {d.project ? (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
                            {d.project}
                          </span>
                        ) : null}
                        {d.team ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary capitalize">
                            {d.team === 'mechanical' ? <Wrench className="w-2.5 h-2.5" /> : <Zap className="w-2.5 h-2.5" />}
                            {d.team}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {(d.regions?.length || 0)} section{(d.regions?.length || 0) === 1 ? '' : 's'}
                        {d.created_by ? ` · by ${d.created_by}` : ''}
                      </p>
                      {d.updated_by && (
                        <p className="text-xs text-muted-foreground/80 truncate">
                          Last edited by {d.updated_by}
                          {d.updated_date ? ` · ${format(new Date(d.updated_date), 'MMM d, yyyy h:mm a')}` : ''}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); base44.highlight.exportPdf(d).then(() => toast.success('PDF exported')).catch((err) => toast.error(err.message || 'Export failed')); }}
                      className="text-muted-foreground hover:text-primary p-1"
                      title="Export PDF"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    {!readOnly && (
                      <button onClick={(e) => deleteDoc(d.id, e)} className="text-muted-foreground hover:text-destructive p-1">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
