import React, { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { canRead, canEdit } from '@/lib/permissions';
import { Loader2, Upload, Trash2, Pencil, FileText, GraduationCap, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import logo from '@/assets/logo.jpg';
import AppSwitcher from '@/components/layout/AppSwitcher';

export default function OnboardingAdmin() {
  const { user, loading } = useAuth();
  const [courses, setCourses] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [name, setName] = useState('');
  const [file, setFile] = useState(null);

  const editable = canEdit(user, 'onboarding');

  const load = useCallback(() => {
    setLoadingData(true);
    base44.onboarding.listCourses()
      .then((c) => setCourses(Array.isArray(c) ? c : []))
      .catch(() => toast.error('Failed to load courses'))
      .finally(() => setLoadingData(false));
  }, []);

  useEffect(() => { if (canRead(user, 'onboarding')) load(); }, [user, load]);

  if (loading) return null;
  if (!canRead(user, 'onboarding')) return <Navigate to="/" replace />;

  const doUpload = async () => {
    if (!file) { toast.error('Choose a PDF file'); return; }
    setUploading(true);
    try {
      await base44.onboarding.uploadCourse(name.trim() || file.name.replace(/\.pdf$/i, ''), file);
      setName(''); setFile(null);
      const input = document.getElementById('course-file'); if (input) input.value = '';
      load();
    } catch (e) { toast.error(e?.message || 'Upload failed'); }
    finally { setUploading(false); }
  };
  const rename = async (c) => {
    const n = prompt('Course name:', c.name);
    if (n === null || !n.trim() || n.trim() === c.name) return;
    try { await base44.onboarding.renameCourse(c.id, n.trim()); load(); } catch { toast.error('Rename failed'); }
  };
  const del = async (c) => {
    if (!confirm(`Delete "${c.name}"? This removes the file and all completion records for it.`)) return;
    try { await base44.onboarding.deleteCourse(c.id); load(); } catch { toast.error('Delete failed'); }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 bg-card/80 backdrop-blur border-b border-border">
        <div className="max-w-4xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src={logo} alt="3 Phase Conveyor" className="h-7 w-auto" />
            <span className="text-sm font-semibold text-muted-foreground border-l border-border pl-2.5">Onboarding</span>
          </div>
          <AppSwitcher />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-5 py-6">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><GraduationCap className="w-6 h-6 text-primary" /> Onboarding Courses</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Upload training decks (PDF). Employees complete them at the public onboarding page.</p>
          </div>
          <a href="/onboarding" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-sm text-muted-foreground hover:text-foreground hover:bg-secondary">
            <ExternalLink className="w-4 h-4" /> Open public page
          </a>
        </div>

        {editable && (
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm mb-6">
            <h3 className="text-sm font-semibold mb-3">Add a course</h3>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Course name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fall Protection"
                  className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mt-3">PDF file</label>
                <input id="course-file" type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="w-full mt-1 text-sm file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-secondary file:text-foreground" />
                <p className="text-[11px] text-muted-foreground mt-1">Convert PowerPoint to PDF first (PowerPoint → Save As → PDF).</p>
              </div>
              <button onClick={doUpload} disabled={uploading || !file}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Upload
              </button>
            </div>
          </div>
        )}

        {loadingData ? (
          <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Loading…</div>
        ) : courses.length === 0 ? (
          <div className="text-center py-12 rounded-2xl border border-dashed border-border bg-card/50 text-muted-foreground">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-25" />
            <p>No courses yet.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {courses.map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
                <FileText className="w-5 h-5 text-muted-foreground flex-none" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{c.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{c.original_name || 'course.pdf'}</div>
                </div>
                <a href={base44.onboarding.courseFileUrl(c.id)} target="_blank" rel="noreferrer" className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-secondary" title="Preview"><ExternalLink className="w-4 h-4" /></a>
                {editable && <button onClick={() => rename(c)} className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-secondary" title="Rename"><Pencil className="w-4 h-4" /></button>}
                {editable && <button onClick={() => del(c)} className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-secondary" title="Delete"><Trash2 className="w-4 h-4" /></button>}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
