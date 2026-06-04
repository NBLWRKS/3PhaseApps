import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import logo from '@/assets/logo.jpg';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft, Upload, Loader2, Trash2, Save, Highlighter, Plus, FolderOpen, X,
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
];

export default function Highlight() {
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoadingAuth } = useAuth();

  const [title, setTitle] = useState('Untitled');
  const [docId, setDocId] = useState(null);
  const [imageUrl, setImageUrl] = useState('');
  const [imageDims, setImageDims] = useState({ width: 0, height: 0 });
  const [regions, setRegions] = useState([]);
  const [activeColor, setActiveColor] = useState(COLORS[0].value);
  const [converting, setConverting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [savedDocs, setSavedDocs] = useState([]);
  const [showLibrary, setShowLibrary] = useState(false);

  // Drawing state
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const fileInputRef = useRef(null);
  const [drawing, setDrawing] = useState(null); // {x,y,w,h} in natural px
  const [renderScale, setRenderScale] = useState(1); // displayed / natural

  const hasImage = !!imageUrl;
  const isAdmin = user?.role === 'admin';
  const canAccess = isAdmin || (user?.app_permissions || []).includes('highlight');

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

  // Keep the natural->display scale in sync with the rendered image size.
  const updateScale = useCallback(() => {
    if (imgRef.current && imageDims.width) {
      setRenderScale(imgRef.current.clientWidth / imageDims.width);
    }
  }, [imageDims.width]);

  useEffect(() => {
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [updateScale, imageUrl]);

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
    try {
      const { file_url, width, height } = await base44.highlight.convertPdf(file);
      setImageUrl(file_url);
      setImageDims({ width, height });
      setRegions([]);
      setDocId(null);
      if (title === 'Untitled' && file.name) {
        setTitle(file.name.replace(/\.pdf$/i, ''));
      }
      toast.success('PDF converted');
    } catch (err) {
      setError(err.message || 'Conversion failed');
      toast.error(err.message || 'Conversion failed');
    } finally {
      setConverting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Convert a pointer event to natural-image coordinates.
  const toNatural = (e) => {
    const rect = imgRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / renderScale;
    const y = (e.clientY - rect.top) / renderScale;
    return {
      x: Math.max(0, Math.min(imageDims.width, x)),
      y: Math.max(0, Math.min(imageDims.height, y)),
    };
  };

  const onPointerDown = (e) => {
    if (!hasImage) return;
    e.preventDefault();
    const p = toNatural(e);
    setDrawing({ x: p.x, y: p.y, w: 0, h: 0, ox: p.x, oy: p.y });
  };

  const onPointerMove = (e) => {
    if (!drawing) return;
    const p = toNatural(e);
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
          x: Math.round(drawing.x),
          y: Math.round(drawing.y),
          w: Math.round(drawing.w),
          h: Math.round(drawing.h),
          color: activeColor,
          label: `Section ${r.length + 1}`,
        },
      ]);
    }
    setDrawing(null);
  };

  const removeRegion = (id) => setRegions((r) => r.filter((x) => x.id !== id));
  const renameRegion = (id, label) =>
    setRegions((r) => r.map((x) => (x.id === id ? { ...x, label } : x)));

  const save = async () => {
    if (!hasImage) return;
    setSaving(true);
    setError('');
    const payload = {
      title,
      image_url: imageUrl,
      image_width: imageDims.width,
      image_height: imageDims.height,
      regions,
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

  const openDoc = async (id) => {
    try {
      const doc = await base44.highlight.get(id);
      setDocId(doc.id);
      setTitle(doc.title || 'Untitled');
      setImageUrl(doc.image_url);
      setImageDims({ width: doc.image_width || 0, height: doc.image_height || 0 });
      setRegions(doc.regions || []);
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
    setImageUrl('');
    setImageDims({ width: 0, height: 0 });
    setRegions([]);
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
            <Button variant="outline" size="sm" onClick={() => navigate('/')} className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Apps</span>
            </Button>
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

        {!hasImage ? (
          /* Upload prompt */
          <div className="border-2 border-dashed border-border rounded-xl p-12 text-center bg-card">
            <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold mb-1">Upload a conveyor PDF</h2>
            <p className="text-muted-foreground mb-6 text-sm">
              The first page is converted to an image you can mark up.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={handleFile}
              className="hidden"
              id="pdf-input"
            />
            <Button onClick={() => fileInputRef.current?.click()} disabled={converting} className="gap-2">
              {converting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {converting ? 'Converting…' : 'Choose PDF'}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
            {/* Canvas / image with overlay */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="max-w-xs font-medium"
                  placeholder="Document title"
                />
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={converting} className="gap-2">
                  {converting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  Replace PDF
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={handleFile}
                  className="hidden"
                />
              </div>

              <div
                ref={containerRef}
                className="relative inline-block w-full border border-border rounded-lg overflow-hidden bg-muted select-none"
                style={{ cursor: 'crosshair', touchAction: 'none' }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
              >
                <img
                  ref={imgRef}
                  src={imageUrl}
                  alt="Conveyor layout"
                  className="block w-full h-auto pointer-events-none"
                  onLoad={updateScale}
                  draggable={false}
                />
                {/* Existing regions */}
                {regions.map((r) => (
                  <div
                    key={r.id}
                    className="absolute group"
                    style={{
                      left: r.x * renderScale,
                      top: r.y * renderScale,
                      width: r.w * renderScale,
                      height: r.h * renderScale,
                      backgroundColor: r.color + '40', // ~25% alpha
                      border: `2px solid ${r.color}`,
                    }}
                  >
                    <span
                      className="absolute -top-6 left-0 text-[11px] font-semibold px-1.5 py-0.5 rounded text-white whitespace-nowrap"
                      style={{ backgroundColor: r.color }}
                    >
                      {r.label}
                    </span>
                  </div>
                ))}
                {/* Live drawing rectangle */}
                {drawing && (
                  <div
                    className="absolute pointer-events-none"
                    style={{
                      left: drawing.x * renderScale,
                      top: drawing.y * renderScale,
                      width: drawing.w * renderScale,
                      height: drawing.h * renderScale,
                      backgroundColor: activeColor + '33',
                      border: `2px dashed ${activeColor}`,
                    }}
                  />
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Click and drag on the image to highlight a section of conveyor.
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
                      <div key={r.id} className="flex items-center gap-2 bg-card border border-border rounded-lg p-2">
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
                        <input
                          value={r.label}
                          onChange={(e) => renameRegion(r.id, e.target.value)}
                          className="flex-1 min-w-0 bg-transparent text-sm outline-none"
                        />
                        <button onClick={() => removeRegion(r.id)} className="text-muted-foreground hover:text-destructive">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 pt-2 border-t border-border">
                <Button onClick={save} disabled={saving} className="gap-2 w-full">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {docId ? 'Update document' : 'Save document'}
                </Button>
                <Button variant="outline" onClick={newDoc} className="gap-2 w-full">
                  <Plus className="w-4 h-4" />
                  New document
                </Button>
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
            {savedDocs.length === 0 ? (
              <p className="text-muted-foreground text-sm">No saved documents yet.</p>
            ) : (
              <div className="space-y-2">
                {savedDocs.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => openDoc(d.id)}
                    className="w-full text-left flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-secondary transition-colors"
                  >
                    <img src={d.image_url} alt="" className="w-14 h-14 object-cover rounded border border-border flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{d.title}</p>
                      <p className="text-xs text-muted-foreground">
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
                    <button onClick={(e) => deleteDoc(d.id, e)} className="text-muted-foreground hover:text-destructive p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
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
