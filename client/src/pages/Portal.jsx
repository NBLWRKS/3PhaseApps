import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, FileSpreadsheet, Loader2, LogOut, KeyRound, UserX, UserPlus, Copy, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { readXlsx } from '@/lib/xlsxRead';
import { sheetsToSections, formatCell, alignRight } from '@/lib/portalSections';
import AppSwitcher from '@/components/layout/AppSwitcher';
import logo from '@/assets/logo-dark.png';

const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); } catch { return ''; } };

// Readable temporary password: no 0/O/1/l/I look-alikes, 12 characters.
function generatePassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const buf = new Uint32Array(12);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => chars[n % chars.length]).join('');
}
const copy = async (t) => { try { await navigator.clipboard.writeText(t); toast.success('Copied'); } catch { /* selectable on screen */ } };

// One table from the workbook.
function SectionTable({ section }) {
  const { columns, rows } = section;
  // Long text (descriptions, notes) gets room to wrap; short text stays on one line.
  const longest = columns.map((_, ci) => Math.max(0, ...rows.map((r) => String(r.cells[ci] ?? '').length)));
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm tabular-nums border-collapse">
        <thead>
          <tr className="text-xs text-muted-foreground">
            {columns.map((c, i) => (
              <th key={i} scope="col" className={`px-3 py-2.5 font-medium border-b border-border align-bottom ${alignRight(c.kind) ? 'text-right' : 'text-left'} ${c.kind === 'text' && longest[i] > 40 ? 'min-w-[14rem]' : 'whitespace-nowrap'}`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className={r.total ? 'font-semibold bg-secondary/40' : 'hover:bg-secondary/30'}>
              {columns.map((c, ci) => (
                <td key={ci} className={`px-3 py-2 border-b border-border/60 align-top ${alignRight(c.kind) ? 'text-right whitespace-nowrap' : longest[ci] > 40 ? 'text-left whitespace-pre-line' : 'text-left whitespace-nowrap'}`}>
                  {formatCell(r.cells[ci], c.kind)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Sections({ sections }) {
  const [tab, setTab] = useState(0);
  const i = Math.min(tab, sections.length - 1);
  const s = sections[i];
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Project sections" className="flex gap-1.5 overflow-x-auto pb-1">
        {sections.map((x, k) => (
          <button key={k} role="tab" aria-selected={k === i} aria-controls={`portal-panel-${k}`} id={`portal-tab-${k}`} onClick={() => setTab(k)}
            className={`px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${k === i ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-secondary'}`}>
            {x.title}
          </button>
        ))}
      </div>
      <section role="tabpanel" id={`portal-panel-${i}`} aria-labelledby={`portal-tab-${i}`} className="space-y-2">
        {s.subtitle && <h2 className="text-base font-semibold">{s.subtitle}</h2>}
        <SectionTable section={s} />
      </section>
    </div>
  );
}

// Editors: replace the portal's content with a newer copy of the workbook.
function WorkbookUpload({ portal, onSaved }) {
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(null); // { file, sections }
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) { toast.error('Choose an .xlsx file (in Excel: File › Save As › Excel Workbook).'); return; }
    setBusy(true);
    try {
      const sections = sheetsToSections(await readXlsx(await file.arrayBuffer()));
      if (!sections.length) toast.error('No tables found in that workbook.');
      else setPreview({ file: file.name, sections });
    } catch (err) { toast.error(err.message || 'Couldn\'t read that workbook'); }
    setBusy(false);
  };
  const publish = async () => {
    setBusy(true);
    try {
      await base44.portal.update(portal.id, { sections: preview.sections, source_file: preview.file });
      toast.success('Portal updated');
      setPreview(null);
      onSaved();
    } catch (err) { toast.error(err.message || 'Couldn\'t update the portal'); }
    setBusy(false);
  };
  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-1.5"><FileSpreadsheet className="w-4 h-4" aria-hidden="true" /> Project workbook</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {portal.source_file ? <>Showing <span className="text-foreground">{portal.source_file}</span>, updated {fmtDate(portal.updated_date)}{portal.updated_by ? ` by ${portal.updated_by}` : ''}.</> : 'No workbook uploaded yet.'}
            {' '}Upload a newer copy to replace what customers see; each sheet becomes a tab.
          </p>
        </div>
        <input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={pick} className="hidden" id="portal-workbook" />
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-border text-sm hover:bg-secondary disabled:opacity-50">
          {busy && !preview ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <FileSpreadsheet className="w-4 h-4" aria-hidden="true" />} Upload .xlsx
        </button>
      </div>
      {preview && (
        <div className="rounded-xl border border-primary/50 bg-primary/5 p-3 space-y-3">
          <p className="text-sm"><span className="font-semibold">{preview.file}</span>: {preview.sections.length} tab{preview.sections.length === 1 ? '' : 's'} — {preview.sections.map((s) => `${s.title} (${s.rows.length} rows)`).join(', ')}. Check the preview below, then publish.</p>
          <Sections sections={preview.sections} />
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setPreview(null)} className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-secondary">Cancel</button>
            <button type="button" onClick={publish} disabled={busy} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
              {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />} Publish to customers
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Admins: the customer logins that can see this portal.
function CustomerLogins({ portal }) {
  const [logins, setLogins] = useState(null);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [shown, setShown] = useState(null); // { email, password } — shown once
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => base44.portal.listLogins(portal.id).then(setLogins).catch(() => setLogins([])), [portal.id]);
  useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    const password = generatePassword();
    setBusy(true);
    try {
      await base44.portal.addLogin(portal.id, { email: email.trim(), full_name: fullName.trim(), password });
      setShown({ email: email.trim().toLowerCase(), password, created: true });
      setEmail(''); setFullName(''); load();
    } catch (err) { toast.error(err.message || 'Couldn\'t add the login'); }
    setBusy(false);
  };
  const reset = async (u) => {
    if (!confirm(`Set a new password for ${u.email}? They'll be signed out everywhere.`)) return;
    const password = generatePassword();
    try { await base44.portal.resetLogin(portal.id, u.id, password); setShown({ email: u.email, password }); }
    catch (err) { toast.error(err.message || 'Couldn\'t reset the password'); }
  };
  const remove = async (u) => {
    if (!confirm(`Remove ${u.email}? They'll lose access to this portal immediately.`)) return;
    try { await base44.portal.removeLogin(portal.id, u.id); toast.success('Login removed'); load(); }
    catch (err) { toast.error(err.message || 'Couldn\'t remove the login'); }
  };
  const portalUrl = `${window.location.origin}/portal/login`;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-1.5"><KeyRound className="w-4 h-4" aria-hidden="true" /> Customer logins</h2>
        <p className="text-xs text-muted-foreground mt-0.5">People outside the company who can view this portal (read-only, nothing else in 3PhaseApps). They sign in at <span className="text-foreground select-all">{portalUrl}</span>.</p>
      </div>
      {shown && (
        <div role="status" className="rounded-xl border border-primary/50 bg-primary/5 p-3 space-y-2 text-sm">
          <p className="font-medium">{shown.created ? 'Login created' : 'Password reset'} for {shown.email}. Send them this password privately; it won't be shown again.</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="px-3 py-1.5 rounded-md bg-background border border-border font-mono select-all">{shown.password}</code>
            <button type="button" onClick={() => copy(shown.password)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs hover:bg-secondary"><Copy className="w-3.5 h-3.5" aria-hidden="true" /> Copy</button>
            <button type="button" onClick={() => copy(`Sign in at ${portalUrl}\nEmail: ${shown.email}\nPassword: ${shown.password}`)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs hover:bg-secondary"><Copy className="w-3.5 h-3.5" aria-hidden="true" /> Copy sign-in details</button>
            <button type="button" onClick={() => setShown(null)} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold">Done</button>
          </div>
        </div>
      )}
      {logins == null ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : logins.length === 0 ? (
        <p className="text-sm text-muted-foreground">No customer logins yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {logins.map((u) => (
            <li key={u.id} className="py-2 flex items-center gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{u.full_name || u.email}</div>
                {u.full_name && <div className="text-xs text-muted-foreground truncate">{u.email}</div>}
              </div>
              <button type="button" onClick={() => reset(u)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs hover:bg-secondary"><KeyRound className="w-3.5 h-3.5" aria-hidden="true" /> Reset password</button>
              <button type="button" onClick={() => remove(u)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-destructive hover:bg-secondary"><UserX className="w-3.5 h-3.5" aria-hidden="true" /> Remove</button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] items-end pt-1">
        <div>
          <label htmlFor="login-email" className="text-xs font-medium">Email</label>
          <input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="name@customer.com"
            className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-primary" />
        </div>
        <div>
          <label htmlFor="login-name" className="text-xs font-medium">Name (optional)</label>
          <input id="login-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="First Last"
            className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-primary" />
        </div>
        <button type="submit" disabled={busy || !email.trim()} className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <UserPlus className="w-4 h-4" aria-hidden="true" />} Add login
        </button>
      </form>
    </div>
  );
}

// Editors: rename; admins: delete.
function PortalSettings({ portal, isAdmin, onSaved }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(portal.name);
  const [customer, setCustomer] = useState(portal.customer || '');
  const save = async (e) => {
    e.preventDefault();
    try { await base44.portal.update(portal.id, { name, customer }); toast.success('Saved'); setOpen(false); onSaved(); }
    catch (err) { toast.error(err.message || 'Couldn\'t save'); }
  };
  const del = async () => {
    if (!confirm(`Delete the portal "${portal.name}" and remove all its customer logins? This can't be undone.`)) return;
    try { await base44.portal.delete(portal.id); toast.success('Portal deleted'); window.location.href = '/portal'; }
    catch (err) { toast.error(err.message || 'Couldn\'t delete'); }
  };
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" aria-hidden="true" /> Edit name</button>;
  return (
    <form onSubmit={save} className="rounded-2xl border border-border bg-card p-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto] items-end">
      <div><label htmlFor="ps-name" className="text-xs font-medium">Project name</label>
        <input id="ps-name" value={name} onChange={(e) => setName(e.target.value)} required className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-primary" /></div>
      <div><label htmlFor="ps-customer" className="text-xs font-medium">Customer</label>
        <input id="ps-customer" value={customer} onChange={(e) => setCustomer(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-primary" /></div>
      <button type="submit" className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold">Save</button>
      <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg border border-border text-sm">Cancel</button>
      {isAdmin && <button type="button" onClick={del} className="sm:col-span-4 justify-self-start flex items-center gap-1.5 text-xs text-destructive"><Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> Delete this portal</button>}
    </form>
  );
}

export default function Portal() {
  const { id } = useParams();
  const { user, isLoadingAuth } = useAuth();
  const [portal, setPortal] = useState(undefined);
  const isCustomer = user?.role === 'customer';
  const load = useCallback(() => base44.portal.get(id).then(setPortal).catch(() => setPortal(null)), [id]);
  useEffect(() => { if (user) load(); }, [user, load]);

  if (isLoadingAuth) return null;
  if (!user) return <Navigate to="/portal/login" replace />;

  const header = isCustomer ? (
    <header className="sticky top-0 z-40 bg-card/90 backdrop-blur border-b border-border" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div className="max-w-7xl mx-auto px-5 h-14 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <img src={logo} alt="3 Phase Conveyor" className="h-5 sm:h-6 w-auto shrink-0" />
          <span className="text-sm font-semibold text-muted-foreground border-l border-border pl-2.5 truncate">Customer Portal</span>
        </div>
        <button type="button" onClick={() => base44.auth.logout('/portal/login')} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><LogOut className="w-4 h-4" aria-hidden="true" /> Sign out</button>
      </div>
    </header>
  ) : (
    <header className="sticky top-0 z-40 bg-card/80 backdrop-blur border-b border-border">
      <div className="max-w-7xl mx-auto px-5 h-14 flex items-center justify-between">
        <Link to="/portal" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" aria-hidden="true" /> All portals</Link>
        <AppSwitcher currentKey="portal" />
      </div>
    </header>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {header}
      <main className="max-w-7xl mx-auto px-5 py-6 space-y-6">
        {portal === undefined ? (
          <div className="flex items-center gap-2 text-muted-foreground py-16 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Loading…</div>
        ) : portal === null ? (
          <div className="text-center py-16 text-sm text-muted-foreground">This portal doesn't exist or you don't have access to it.</div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-primary flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" aria-hidden="true" /> {portal.customer ? `Prepared for ${portal.customer}` : 'Project portal'}</p>
                <h1 className="text-2xl font-bold tracking-tight mt-1">{portal.name}</h1>
                <p className="text-sm text-muted-foreground mt-0.5">Updated {fmtDate(portal.updated_date)}</p>
              </div>
              {portal.can_edit && <PortalSettings portal={portal} isAdmin={portal.can_manage_logins} onSaved={load} />}
            </div>
            {portal.can_edit && <WorkbookUpload portal={portal} onSaved={load} />}
            {portal.sections.length ? <Sections sections={portal.sections} /> : (
              <div className="text-center py-14 rounded-2xl border border-dashed border-border text-sm text-muted-foreground">
                {portal.can_edit ? 'Upload the project workbook above to fill this portal.' : 'Project information will appear here soon.'}
              </div>
            )}
            {portal.can_manage_logins && <CustomerLogins portal={portal} />}
          </>
        )}
      </main>
    </div>
  );
}
