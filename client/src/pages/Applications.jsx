import React, { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { canRead } from '@/lib/permissions';
import { Loader2, FileText, Download, Trash2, ShieldAlert, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';
import logo from '@/assets/logo.jpg';
import AppSwitcher from '@/components/layout/AppSwitcher';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

function authHeaders() {
  let t = null;
  try { t = localStorage.getItem('pm_access_token'); } catch { /* ignore */ }
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export default function Applications() {
  const { user, loading } = useAuth();
  const [apps, setApps] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  const load = useCallback(() => {
    setLoadingData(true);
    fetch(`${API_BASE}/applications`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => setApps(Array.isArray(data) ? data : []))
      .catch(() => toast.error('Failed to load applications'))
      .finally(() => setLoadingData(false));
  }, []);

  useEffect(() => { if (canRead(user, 'applications')) load(); }, [user, load]);

  if (loading) return null;
  if (!canRead(user, 'applications')) return <Navigate to="/" replace />;

  const download = async (appId, stored, name) => {
    try {
      const r = await fetch(`${API_BASE}/applications/file/${appId}/${stored}`, { headers: authHeaders() });
      if (!r.ok) throw new Error();
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name || 'form.pdf'; document.body.appendChild(a); a.click();
      a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { toast.error('Download failed'); }
  };

  const del = async (appId, applicant) => {
    if (!confirm(`Delete the application from "${applicant}"? This removes its PDFs permanently.`)) return;
    try {
      const r = await fetch(`${API_BASE}/applications/${appId}`, { method: 'DELETE', headers: authHeaders() });
      if (!r.ok) throw new Error();
      load();
    } catch { toast.error('Delete failed'); }
  };

  const fmtDate = (iso) => { try { return new Date(iso).toLocaleString(); } catch { return iso; } };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 bg-card/80 backdrop-blur border-b border-border">
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src={logo} alt="3 Phase Conveyor" className="h-7 w-auto" />
            <span className="text-sm font-semibold text-muted-foreground border-l border-border pl-2.5">Applications</span>
          </div>
          <AppSwitcher />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 py-6">
        <div className="mb-5">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><FolderOpen className="w-6 h-6 text-primary" /> Employee Applications</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Submitted new-hire packets. These contain sensitive personal information — handle accordingly.</p>
        </div>

        <div className="flex items-start gap-2 text-xs text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-5">
          <ShieldAlert className="w-4 h-4 flex-none mt-0.5" />
          <span>These packets include SSNs, bank/direct-deposit details, and I-9 data. Only download to a secure device.</span>
        </div>

        {loadingData ? (
          <div className="flex items-center gap-2 text-muted-foreground py-16 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Loading…</div>
        ) : apps.length === 0 ? (
          <div className="text-center py-16 rounded-2xl border border-dashed border-border bg-card/50 text-muted-foreground">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-25" />
            <p>No applications submitted yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {apps.map((a) => (
              <div key={a.id} className="rounded-2xl border border-border bg-card shadow-sm p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-bold">{a.applicant || 'Unnamed applicant'}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {fmtDate(a.created_date)}{a.lang ? ` · ${a.lang.toUpperCase()}` : ''} · {(a.files || []).length} file{(a.files || []).length === 1 ? '' : 's'}
                    </div>
                  </div>
                  <button onClick={() => del(a.id, a.applicant)} className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-secondary transition" title="Delete application">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(a.files || []).map((f) => (
                    <button key={f.stored} onClick={() => download(a.id, f.stored, f.name)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition">
                      <Download className="w-3.5 h-3.5" /> {f.name || 'form.pdf'}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
