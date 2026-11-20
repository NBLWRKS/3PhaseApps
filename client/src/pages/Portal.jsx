import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Building2, FileSpreadsheet, Loader2, LogOut, KeyRound, UserX, UserPlus, Copy, Pencil, Trash2,
  Menu, LayoutDashboard, FileDiff, ClipboardList, Receipt, CalendarRange, FolderOpen, Table2, Settings2,
  Search, Download, Eye, Upload, FileText, FileImage, File as FileIcon, ChevronRight, EyeOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { readXlsx } from '@/lib/xlsxRead';
import { sheetsToSections } from '@/lib/portalSections';
import { buildDashboard, withoutHidden, money, pct } from '@/lib/portalModel';
import DataTable from '@/components/portal/DataTable';
import PdfViewer from '@/components/portal/PdfViewer';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import AppSwitcher from '@/components/layout/AppSwitcher';
import logo from '@/assets/logo.jpg';
import usePortalLight from '@/lib/usePortalLight';

// Customer Portal dashboard for one project. A menu on the left (a slide-out
// drawer on phones) switches between Overview, Change Orders, Scope of Work,
// Invoicing, Schedule, Documents, any other workbook tables, and (for our
// editors) Manage. The current section is kept in the address (?section=), so
// it survives a refresh and the browser Back button works.

const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); } catch { return ''; } };
const fmtShort = (iso) => { try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return ''; } };
const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const extOf = (name) => (String(name || '').match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
const KIND_LABEL = { schedule: 'Schedule', workbook: 'Project workbook', document: 'Document' };
const card = 'rounded-2xl border border-border bg-card';
const btn = 'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm hover:bg-secondary disabled:opacity-50';
const btnPrimary = 'inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50';
const inputCls = 'w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-primary';

// Readable temporary password: no 0/O/1/l/I look-alikes, 12 characters.
function generatePassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const buf = new Uint32Array(12);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => chars[n % chars.length]).join('');
}
const copy = async (t) => { try { await navigator.clipboard.writeText(t); toast.success('Copied'); } catch { /* selectable on screen */ } };


function Empty({ children }) {
  return <div className="text-center py-14 rounded-2xl border border-dashed border-border text-sm text-muted-foreground">{children}</div>;
}
function PageTitle({ title, sub, children }) {
  return (
    <div className="flex items-end justify-between gap-3 flex-wrap mb-5">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {sub && <p className="text-sm text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      {children}
    </div>
  );
}
function Bar({ value, className = '' }) {
  const w = Math.max(0, Math.min(1, value || 0)) * 100;
  return (
    <div className={`h-2 rounded-full bg-secondary overflow-hidden ${className}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(w)}>
      <div className="h-full rounded-full bg-primary" style={{ width: `${w}%` }} />
    </div>
  );
}
function StatusBadge({ status }) {
  const cls = status === 'Approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900';
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}>{status}</span>;
}
function Kpi({ label, value, sub, onClick, children }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} className={`${card} p-4 text-left ${onClick ? 'hover:border-primary/50 transition' : ''}`}>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold tracking-tight tabular-nums mt-1">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      {children}
    </Tag>
  );
}

// Right-hand panel for one record's details (closes with Escape or ✕).
function DetailPanel({ open, onClose, title, description, children, wide }) {
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className={`w-full ${wide ? 'sm:max-w-4xl' : 'sm:max-w-lg'} overflow-y-auto p-5 sm:p-6`}>
        <SheetTitle className="pr-8 leading-snug">{title}</SheetTitle>
        {description ? <SheetDescription>{description}</SheetDescription> : <SheetDescription className="sr-only">Details</SheetDescription>}
        <div className="mt-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
function Fields({ fields }) {
  return (
    <dl className="divide-y divide-border rounded-xl border border-border">
      {fields.map((f, k) => (
        <div key={k} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-3 py-2 text-sm">
          <dt className="text-muted-foreground text-xs pt-0.5">{f.label}</dt>
          <dd className="min-w-0 break-words whitespace-pre-line tabular-nums">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ===================== Overview =====================
function Overview({ portal, dash, docs, go, openCo }) {
  const k = dash.kpis;
  const schedule = docs?.find((d) => d.kind === 'schedule');
  const topPending = dash.changeOrders.filter((c) => c.status === 'Pending').sort((a, b) => (b.amount || 0) - (a.amount || 0)).slice(0, 5);
  const recent = (docs || []).slice(0, 5);
  return (
    <>
      <PageTitle title="Project overview" sub={`Updated ${fmtDate(portal.updated_date)}`} />
      {!portal.sections.length && !docs?.length ? (
        <Empty>{portal.can_edit ? 'Nothing here yet. Use Manage to upload the project workbook and documents.' : 'Project information will appear here soon.'}</Empty>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
            {dash.sections.pending && <Kpi label="Change orders pending approval" value={money(k.pendingTotal)} sub={`${k.pendingCount} change order${k.pendingCount === 1 ? '' : 's'}`} onClick={() => go('change-orders', { status: 'Pending' })} />}
            {dash.sections.approved && <Kpi label="Approved change orders" value={money(k.approvedTotal)} sub={`${k.approvedCount} approved`} onClick={() => go('change-orders', { status: 'Approved' })} />}
            {dash.sections.sow && (
              <Kpi label="Base scope invoiced" value={pct(k.sowPct)} sub={`${money(k.sowInvoiced)} of ${money(k.sowValue)}`} onClick={() => go('sow')}>
                <Bar value={k.sowPct} className="mt-2" />
              </Kpi>
            )}
            {dash.sections.sow && <Kpi label="Base scope remaining to invoice" value={money(k.sowRemaining)} sub={`${dash.sow.length} PO line${dash.sow.length === 1 ? '' : 's'}`} onClick={() => go('sow')} />}
            {dash.sections.invoicing && <Kpi label="Invoices in process" value={money(k.invoicingTotal)} sub={`${k.invoicingCount} invoice${k.invoicingCount === 1 ? '' : 's'}`} onClick={() => go('invoicing')} />}
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            {topPending.length > 0 && (
              <section className={`${card} p-4`} aria-labelledby="ov-pending">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h2 id="ov-pending" className="text-sm font-semibold">Largest pending change orders</h2>
                  <button type="button" onClick={() => go('change-orders', { status: 'Pending' })} className="text-xs text-primary font-medium flex items-center gap-0.5">View all <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" /></button>
                </div>
                <ul className="divide-y divide-border">
                  {topPending.map((c) => (
                    <li key={c.key}>
                      <button type="button" onClick={() => openCo(c)} className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-secondary/50 rounded-md px-1">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{c.title}</div>
                          <div className="text-xs text-muted-foreground truncate">{[c.ref, c.description].filter(Boolean).join(' · ')}</div>
                        </div>
                        <div className="text-sm font-semibold tabular-nums shrink-0">{c.amount != null ? money(c.amount) : ''}</div>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <div className="space-y-5 min-w-0">
              <section className={`${card} p-4`} aria-labelledby="ov-schedule">
                <h2 id="ov-schedule" className="text-sm font-semibold mb-2 flex items-center gap-1.5"><CalendarRange className="w-4 h-4 text-primary" aria-hidden="true" /> Project schedule</h2>
                {schedule ? (
                  <button type="button" onClick={() => go('schedule')} className="w-full flex items-center gap-3 rounded-lg border border-border p-3 text-left hover:bg-secondary/50">
                    <FileText className="w-5 h-5 text-primary shrink-0" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{schedule.name}</div>
                      <div className="text-xs text-muted-foreground">Updated {fmtShort(schedule.uploaded_date)}</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                  </button>
                ) : <p className="text-sm text-muted-foreground">No schedule posted yet.</p>}
              </section>
              <section className={`${card} p-4`} aria-labelledby="ov-docs">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h2 id="ov-docs" className="text-sm font-semibold flex items-center gap-1.5"><FolderOpen className="w-4 h-4 text-primary" aria-hidden="true" /> Recent documents</h2>
                  {recent.length > 0 && <button type="button" onClick={() => go('documents')} className="text-xs text-primary font-medium flex items-center gap-0.5">All documents <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" /></button>}
                </div>
                {docs == null ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : recent.length ? (
                  <ul className="divide-y divide-border">
                    {recent.map((d) => (
                      <li key={d.id} className="py-2 flex items-center gap-2 text-sm">
                        <DocIcon name={d.name} />
                        <button type="button" onClick={() => go('documents', { doc: d.id })} className="min-w-0 flex-1 text-left truncate hover:underline">{d.name}</button>
                        <span className="text-xs text-muted-foreground shrink-0">{fmtShort(d.uploaded_date)}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-sm text-muted-foreground">No documents yet.</p>}
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ===================== Change orders =====================
function ChangeOrders({ dash, initialStatus, openCo }) {
  const [status, setStatus] = useState(initialStatus || 'All');
  const [scope, setScope] = useState('All');
  const [q, setQ] = useState('');
  useEffect(() => { if (initialStatus) setStatus(initialStatus); }, [initialStatus]);
  const scopes = useMemo(() => [...new Set(dash.changeOrders.map((c) => c.scope).filter(Boolean))].sort(), [dash.changeOrders]);
  const list = dash.changeOrders.filter((c) => (status === 'All' || c.status === status) && (scope === 'All' || c.scope === scope)
    && (!q.trim() || c.fields.some((f) => String(f.value).toLowerCase().includes(q.trim().toLowerCase()))));
  const total = list.reduce((t, c) => t + (c.amount || 0), 0);
  if (!dash.changeOrders.length) return <><PageTitle title="Change orders" /><Empty>No change orders in the project workbook.</Empty></>;
  const statusOpts = ['All', ...(dash.sections.pending ? ['Pending'] : []), ...(dash.sections.approved ? ['Approved'] : [])];
  return (
    <>
      <PageTitle title="Change orders" sub={`${list.length} shown · ${money(total, true)}`} />
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div role="group" aria-label="Status" className="flex rounded-lg border border-border bg-card p-0.5">
          {statusOpts.map((s) => (
            <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium ${status === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{s}</button>
          ))}
        </div>
        {scopes.length > 1 && (
          <select aria-label="Scope" value={scope} onChange={(e) => setScope(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-card text-sm">
            <option value="All">All scopes</option>
            {scopes.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <div className="relative flex-1 min-w-[12rem] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search change orders" aria-label="Search change orders" className={`${inputCls} pl-9 bg-card`} />
        </div>
      </div>
      {list.length === 0 ? <Empty>No change orders match.</Empty> : (
        <ul className="grid grid-cols-1 gap-2.5">
          {list.map((c) => {
            const date = c.fields.find((f) => f.label === c.dateLabel)?.value;
            return (
              <li key={c.key}>
                <button type="button" onClick={() => openCo(c)} className={`${card} w-full p-3.5 sm:p-4 text-left hover:border-primary/50 transition flex gap-3 items-start`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge status={c.status} />
                      {c.ref && <span className="text-xs font-medium text-muted-foreground">{c.ref}</span>}
                      {date && <span className="text-xs text-muted-foreground">· {c.dateLabel ? `${c.dateLabel.replace(/^date\s*/i, '') || 'Date'} ` : ''}{date}</span>}
                    </div>
                    <div className="font-semibold mt-1 break-words">{c.title}</div>
                    {c.description && <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2 break-words">{c.description}</p>}
                    {c.statusText && <p className="text-xs mt-1"><span className="text-muted-foreground">Status:</span> {c.statusText}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-semibold tabular-nums">{c.amount != null ? money(c.amount, true) : '—'}</div>
                    {c.aging != null && <div className="text-xs text-muted-foreground mt-0.5">{c.aging} days</div>}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

// ===================== Scope of work =====================
function ScopeOfWork({ dash, openSow }) {
  const k = dash.kpis;
  if (!dash.sow.length) return <><PageTitle title="Scope of work" /><Empty>No scope of work in the project workbook.</Empty></>;
  const groups = [];
  for (const l of dash.sow) {
    let g = groups.find((x) => x.scope === l.scope);
    if (!g) { g = { scope: l.scope, lines: [] }; groups.push(g); }
    g.lines.push(l);
  }
  return (
    <>
      <PageTitle title="Scope of work" sub={dash.sections.sow.subtitle || 'Base contract PO lines and invoicing progress'} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 mb-5">
        <Kpi label="Contract value" value={money(k.sowValue)} />
        <Kpi label="Invoiced to date" value={money(k.sowInvoiced)} sub={`${pct(k.sowPct)} of contract`}><Bar value={k.sowPct} className="mt-2" /></Kpi>
        <Kpi label="Remaining to invoice" value={money(k.sowRemaining)} />
      </div>
      <div className="space-y-5">
        {groups.map((g) => {
          const v = g.lines.reduce((t, l) => t + l.value, 0), inv = g.lines.reduce((t, l) => t + l.invoiced, 0);
          return (
            <section key={g.scope || '-'} className={`${card} p-4`} aria-label={g.scope || 'Scope'}>
              <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                <h2 className="text-sm font-semibold">{g.scope ? `${g.scope} scope` : 'PO lines'}</h2>
                <span className="text-xs text-muted-foreground tabular-nums">{money(inv)} of {money(v)} invoiced · {pct(v ? inv / v : 0)}</span>
              </div>
              <ul className="divide-y divide-border">
                {g.lines.map((l) => (
                  <li key={l.key}>
                    <button type="button" onClick={() => openSow(l)} className="w-full text-left py-2.5 px-1 rounded-md hover:bg-secondary/50 grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_14rem] sm:items-center sm:gap-4">
                      <div className="min-w-0">
                        <div className="text-sm font-medium break-words">{l.milestone}</div>
                        <div className="text-xs text-muted-foreground tabular-nums">{l.line ? `PO line ${l.line} · ` : ''}{money(l.value, true)}</div>
                      </div>
                      <div>
                        <Bar value={l.pct} />
                        <div className="flex justify-between text-[11px] text-muted-foreground mt-1 tabular-nums"><span>{pct(l.pct)} invoiced</span><span>{money(l.remaining)} left</span></div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}

// ===================== Tables (Invoicing, anything unrecognised) =====================
function TablesView({ title, sections, emptyText }) {
  const [tab, setTab] = useState(0);
  if (!sections.length) return <><PageTitle title={title} /><Empty>{emptyText}</Empty></>;
  const i = Math.min(tab, sections.length - 1);
  const s = sections[i];
  return (
    <>
      <PageTitle title={title} sub={sections.length === 1 ? s.subtitle : undefined} />
      {sections.length > 1 && (
        <div role="tablist" aria-label={title} className="flex flex-wrap gap-1.5 mb-4">
          {sections.map((x, k) => (
            <button key={k} role="tab" type="button" aria-selected={k === i} onClick={() => setTab(k)}
              className={`px-3.5 py-2 rounded-lg text-sm font-medium transition ${k === i ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-secondary'}`}>{x.title}</button>
          ))}
        </div>
      )}
      {sections.length > 1 && s.subtitle && <h2 className="text-base font-semibold mb-2">{s.subtitle}</h2>}
      <DataTable section={s} />
    </>
  );
}

// ===================== Documents =====================
function DocIcon({ name }) {
  const e = extOf(name);
  const I = e === 'pdf' || e === 'doc' || e === 'docx' ? FileText : e === 'xlsx' || e === 'xls' || e === 'csv' ? FileSpreadsheet : e === 'png' || e === 'jpg' || e === 'jpeg' ? FileImage : FileIcon;
  return <I className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />;
}

async function downloadDoc(portalId, d) {
  try {
    const { data, type } = await base44.portal.fetchDoc(portalId, d.id);
    const url = URL.createObjectURL(new Blob([data], { type }));
    const a = document.createElement('a');
    a.href = url; a.download = d.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (err) { toast.error(err.message || 'Couldn\'t download'); }
}

// Shows one document: PDFs page by page, images, Excel workbooks as tables;
// anything else (Word, CSV) gets a Download button.
function DocViewer({ portalId, doc }) {
  const [state, setState] = useState({ loading: true });
  const e = extOf(doc.name);
  useEffect(() => {
    let url; let cancelled = false;
    setState({ loading: true });
    const viewable = ['pdf', 'png', 'jpg', 'jpeg', 'xlsx'].includes(e);
    if (!viewable) { setState({ loading: false }); return undefined; }
    base44.portal.fetchDoc(portalId, doc.id).then(async ({ data, type }) => {
      if (cancelled) return;
      if (e === 'pdf') setState({ pdf: data });
      else if (e === 'xlsx') {
        const sections = sheetsToSections(await readXlsx(data));
        if (!cancelled) setState({ sections });
      } else { url = URL.createObjectURL(new Blob([data], { type })); setState({ img: url }); }
    }).catch((err) => { if (!cancelled) setState({ error: err.message || 'Couldn\'t open the document' }); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [portalId, doc.id, e]);
  if (state.loading) return <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /> Loading…</div>;
  if (state.error) return <p className="text-sm text-destructive py-8 text-center">{state.error}</p>;
  if (state.pdf) return <PdfViewer data={state.pdf} title={doc.name} />;
  if (state.img) return <img src={state.img} alt={doc.name} className="max-w-full h-auto mx-auto rounded-lg border border-border" />;
  if (state.sections) return state.sections.length ? <TablesInline sections={state.sections} /> : <p className="text-sm text-muted-foreground py-8 text-center">No tables found in this workbook.</p>;
  return (
    <div className="text-center py-12 space-y-3">
      <p className="text-sm text-muted-foreground">This file type can't be previewed here.</p>
      <button type="button" onClick={() => downloadDoc(portalId, doc)} className={btnPrimary}><Download className="w-4 h-4" aria-hidden="true" /> Download</button>
    </div>
  );
}
function TablesInline({ sections }) {
  const [tab, setTab] = useState(0);
  const s = sections[Math.min(tab, sections.length - 1)];
  return (
    <div className="space-y-3">
      {sections.length > 1 && (
        <div role="tablist" aria-label="Sheets" className="flex flex-wrap gap-1.5">
          {sections.map((x, k) => (
            <button key={k} role="tab" type="button" aria-selected={x === s} onClick={() => setTab(k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${x === s ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:bg-secondary'}`}>{x.title}</button>
          ))}
        </div>
      )}
      <DataTable section={s} />
    </div>
  );
}

function DocUpload({ portal, kind: fixedKind, onDone, label = 'Upload' }) {
  const ref = useRef(null);
  const [kind, setKind] = useState(fixedKind || 'document');
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) { toast.error('That file is over 50 MB.'); return; }
    setBusy(true);
    try { await base44.portal.uploadDoc(portal.id, file, fixedKind || kind); toast.success(`${file.name} uploaded`); onDone(); }
    catch (err) { toast.error(err.message || 'Upload failed'); }
    setBusy(false);
  };
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {!fixedKind && (
        <select aria-label="Document type" value={kind} onChange={(e) => setKind(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-card text-sm">
          <option value="document">Document</option>
          <option value="schedule">Schedule</option>
          <option value="workbook">Project workbook</option>
        </select>
      )}
      <input ref={ref} type="file" className="hidden" onChange={pick}
        accept={fixedKind === 'schedule' ? '.pdf,application/pdf' : '.pdf,.xlsx,.xls,.docx,.doc,.csv,.png,.jpg,.jpeg'} />
      <button type="button" onClick={() => ref.current?.click()} disabled={busy} className={btnPrimary}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Upload className="w-4 h-4" aria-hidden="true" />} {label}
      </button>
    </div>
  );
}

function Documents({ portal, docs, reloadDocs, openDocId, setOpenDocId }) {
  const [kind, setKind] = useState('all');
  const [q, setQ] = useState('');
  const open = docs?.find((d) => d.id === openDocId) || null;
  const del = async (d) => {
    if (!confirm(`Delete "${d.name}"? Customers will no longer see it.`)) return;
    try { await base44.portal.deleteDoc(portal.id, d.id); toast.success('Deleted'); if (openDocId === d.id) setOpenDocId(null); reloadDocs(); }
    catch (err) { toast.error(err.message || 'Couldn\'t delete'); }
  };
  const list = (docs || []).filter((d) => (kind === 'all' || d.kind === kind) && (!q.trim() || d.name.toLowerCase().includes(q.trim().toLowerCase())));
  const kinds = [['all', 'All'], ['schedule', 'Schedules'], ['workbook', 'Workbooks'], ['document', 'Other']].filter(([k]) => k === 'all' || (docs || []).some((d) => d.kind === k));
  return (
    <>
      <PageTitle title="Documents" sub="Files shared for this project">
        {portal.can_edit && <DocUpload portal={portal} onDone={reloadDocs} label="Upload document" />}
      </PageTitle>
      {docs == null ? <div className="flex items-center gap-2 text-muted-foreground py-10 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Loading…</div>
        : !docs.length ? <Empty>No documents yet.</Empty> : (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {kinds.length > 2 && (
                <div role="group" aria-label="Type" className="flex rounded-lg border border-border bg-card p-0.5">
                  {kinds.map(([k, l]) => (
                    <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium ${kind === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{l}</button>
                  ))}
                </div>
              )}
              <div className="relative flex-1 min-w-[12rem] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search documents" aria-label="Search documents" className={`${inputCls} pl-9 bg-card`} />
              </div>
            </div>
            {list.length === 0 ? <Empty>No documents match.</Empty> : (
              <ul className={`${card} divide-y divide-border`}>
                {list.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-3 sm:px-4 py-3 flex-wrap sm:flex-nowrap">
                    <DocIcon name={d.name} />
                    <button type="button" onClick={() => setOpenDocId(d.id)} className="min-w-0 flex-1 text-left">
                      <div className="text-sm font-medium break-words hover:underline">{d.name}</div>
                      <div className="text-xs text-muted-foreground">{KIND_LABEL[d.kind] || 'Document'} · {fmtShort(d.uploaded_date)} · {fmtSize(d.size)}{d.uploaded_by ? ` · ${d.uploaded_by}` : ''}</div>
                    </button>
                    <div className="flex items-center gap-1.5 shrink-0 ml-7 sm:ml-0">
                      <button type="button" onClick={() => setOpenDocId(d.id)} className={btn}><Eye className="w-4 h-4" aria-hidden="true" /> View<span className="sr-only"> {d.name}</span></button>
                      <button type="button" onClick={() => downloadDoc(portal.id, d)} className={btn} aria-label={`Download ${d.name}`}><Download className="w-4 h-4" aria-hidden="true" /></button>
                      {portal.can_edit && <button type="button" onClick={() => del(d)} className={`${btn} text-destructive`} aria-label={`Delete ${d.name}`}><Trash2 className="w-4 h-4" aria-hidden="true" /></button>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      <DetailPanel open={!!open} onClose={() => setOpenDocId(null)} wide title={open?.name || ''}
        description={open ? `${KIND_LABEL[open.kind] || 'Document'} · uploaded ${fmtDate(open.uploaded_date)}` : ''}>
        {open && (
          <div className="space-y-3">
            <button type="button" onClick={() => downloadDoc(portal.id, open)} className={btn}><Download className="w-4 h-4" aria-hidden="true" /> Download</button>
            <DocViewer portalId={portal.id} doc={open} />
          </div>
        )}
      </DetailPanel>
    </>
  );
}

// ===================== Schedule =====================
function Schedule({ portal, docs, reloadDocs }) {
  const schedules = (docs || []).filter((d) => d.kind === 'schedule');
  const [sel, setSel] = useState(null);
  const cur = schedules.find((d) => d.id === sel) || schedules[0];
  return (
    <>
      <PageTitle title="Project schedule" sub={cur ? `${cur.name} · updated ${fmtDate(cur.uploaded_date)}` : undefined}>
        <div className="flex items-center gap-2 flex-wrap">
          {schedules.length > 1 && (
            <select aria-label="Schedule version" value={cur.id} onChange={(e) => setSel(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-card text-sm max-w-[16rem]">
              {schedules.map((d, i) => <option key={d.id} value={d.id}>{i === 0 ? 'Latest: ' : ''}{d.name} ({fmtShort(d.uploaded_date)})</option>)}
            </select>
          )}
          {cur && <button type="button" onClick={() => downloadDoc(portal.id, cur)} className={btn}><Download className="w-4 h-4" aria-hidden="true" /> Download</button>}
          {portal.can_edit && <DocUpload portal={portal} kind="schedule" onDone={() => { setSel(null); reloadDocs(); }} label="Upload new schedule" />}
        </div>
      </PageTitle>
      {docs == null ? <div className="flex items-center gap-2 text-muted-foreground py-10 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Loading…</div>
        : !cur ? <Empty>{portal.can_edit ? 'No schedule yet. Upload the schedule as a PDF (in MS Project or P6: Print › Save as PDF).' : 'The project schedule will appear here once it\'s posted.'}</Empty>
          : <DocViewer portalId={portal.id} doc={cur} />}
    </>
  );
}

// ===================== Manage (editors) =====================
// Replace the portal's tables with a newer copy of the workbook; the file is
// also kept under Documents.
function WorkbookUpload({ portal, onSaved }) {
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(null); // { file, name, sections }
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
      else setPreview({ file, name: file.name, sections });
    } catch (err) { toast.error(err.message || 'Couldn\'t read that workbook'); }
    setBusy(false);
  };
  const publish = async () => {
    setBusy(true);
    try {
      await base44.portal.update(portal.id, { sections: preview.sections, source_file: preview.name });
      try { await base44.portal.uploadDoc(portal.id, preview.file, 'workbook'); } catch { toast.error('Published, but the file couldn\'t be added to Documents'); }
      toast.success('Portal updated');
      setPreview(null);
      onSaved();
    } catch (err) { toast.error(err.message || 'Couldn\'t update the portal'); }
    setBusy(false);
  };
  return (
    <section className={`${card} p-4 space-y-3`} aria-labelledby="m-workbook">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 id="m-workbook" className="text-sm font-semibold flex items-center gap-1.5"><FileSpreadsheet className="w-4 h-4" aria-hidden="true" /> Project workbook</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {portal.source_file ? <>Showing <span className="text-foreground">{portal.source_file}</span>, updated {fmtDate(portal.updated_date)}{portal.updated_by ? ` by ${portal.updated_by}` : ''}.</> : 'No workbook uploaded yet.'}
            {' '}Upload a newer copy to refresh Change Orders, Scope of Work, Invoicing and the other tables.
          </p>
        </div>
        <input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={pick} className="hidden" />
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className={btn}>
          {busy && !preview ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <FileSpreadsheet className="w-4 h-4" aria-hidden="true" />} Upload .xlsx
        </button>
      </div>
      {preview && (
        <div className="rounded-xl border border-primary/50 bg-primary/5 p-3 space-y-3">
          <p className="text-sm"><span className="font-semibold">{preview.name}</span>: {preview.sections.length} table{preview.sections.length === 1 ? '' : 's'} — {preview.sections.map((s) => `${s.title} (${s.rows.length} rows)`).join(', ')}. Check the preview, then publish.</p>
          <TablesInline sections={preview.sections} />
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setPreview(null)} className={btn}>Cancel</button>
            <button type="button" onClick={publish} disabled={busy} className={btnPrimary}>{busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />} Publish to customers</button>
          </div>
        </div>
      )}
    </section>
  );
}

// Which columns customers don't see, per table. The server removes them from
// what customers receive.
function HiddenColumns({ portal, onSaved }) {
  const [hidden, setHidden] = useState(portal.hidden_columns || {});
  const [busy, setBusy] = useState(false);
  useEffect(() => { setHidden(portal.hidden_columns || {}); }, [portal.hidden_columns]);
  const isHidden = (t, l) => (hidden[t] || []).some((x) => x.trim().toLowerCase() === String(l).trim().toLowerCase());
  const toggle = (t, l) => setHidden((h) => ({ ...h, [t]: isHidden(t, l) ? (h[t] || []).filter((x) => x.trim().toLowerCase() !== String(l).trim().toLowerCase()) : [...(h[t] || []), l] }));
  const dirty = JSON.stringify(hidden) !== JSON.stringify(portal.hidden_columns || {});
  const save = async () => {
    setBusy(true);
    try { await base44.portal.update(portal.id, { hidden_columns: hidden }); toast.success('Saved'); onSaved(); }
    catch (err) { toast.error(err.message || 'Couldn\'t save'); }
    setBusy(false);
  };
  if (!portal.sections.length) return null;
  return (
    <section className={`${card} p-4 space-y-3`} aria-labelledby="m-hidden">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 id="m-hidden" className="text-sm font-semibold flex items-center gap-1.5"><EyeOff className="w-4 h-4" aria-hidden="true" /> Columns hidden from customers</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Tick a column to keep it internal. Hidden columns are never sent to customer logins. New Scope of Work sheets start with our invoicing columns hidden.</p>
        </div>
        <button type="button" onClick={save} disabled={!dirty || busy} className={btnPrimary}>{busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />} Save</button>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {portal.sections.map((s) => (
          <fieldset key={s.title} className="rounded-xl border border-border p-3">
            <legend className="px-1 text-sm font-medium">{s.title}</legend>
            <div className="grid gap-1 sm:grid-cols-2">
              {s.columns.filter((c) => c.label).map((c, i) => (
                <label key={i} className="flex items-start gap-2 text-sm py-0.5 cursor-pointer">
                  <input type="checkbox" checked={isHidden(s.title, c.label)} onChange={() => toggle(s.title, c.label)} className="mt-0.5 accent-[hsl(var(--primary))]" />
                  <span className={isHidden(s.title, c.label) ? 'text-muted-foreground line-through' : ''}>{c.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
    </section>
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

function Manage({ portal, reload, reloadDocs }) {
  return (
    <>
      <PageTitle title="Manage portal" sub="Only 3 Phase staff with edit access see this page." />
      <div className="space-y-5">
        <section className={`${card} p-4`} aria-label="Project details">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold">{portal.name}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{portal.customer ? `Customer: ${portal.customer}` : 'No customer set'}</p>
            </div>
            <PortalSettings portal={portal} isAdmin={portal.can_manage_logins} onSaved={reload} />
          </div>
        </section>
        <WorkbookUpload portal={portal} onSaved={() => { reload(); reloadDocs(); }} />
        <section className={`${card} p-4 flex items-center justify-between gap-3 flex-wrap`} aria-labelledby="m-docs">
          <div>
            <h2 id="m-docs" className="text-sm font-semibold flex items-center gap-1.5"><FolderOpen className="w-4 h-4" aria-hidden="true" /> Documents and schedule</h2>
            <p className="text-xs text-muted-foreground mt-0.5">PDF, Excel, Word, CSV or image, up to 50 MB. Customers can view and download everything here. Choose “Schedule” for the project schedule PDF.</p>
          </div>
          <DocUpload portal={portal} onDone={reloadDocs} />
        </section>
        <HiddenColumns portal={portal} onSaved={reload} />
        {portal.can_manage_logins && <CustomerLogins portal={portal} />}
      </div>
    </>
  );
}

// ===================== Shell =====================
function NavList({ items, current, onPick }) {
  return (
    <nav aria-label="Portal sections">
      <ul className="space-y-0.5">
        {items.map(({ key, label, icon: I, count }) => (
          <li key={key}>
            <button type="button" onClick={() => onPick(key)} aria-current={current === key ? 'page' : undefined}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition ${current === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'}`}>
              <I className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className="flex-1 text-left truncate">{label}</span>
              {count != null && count > 0 && <span className={`text-[11px] tabular-nums px-1.5 rounded-full ${current === key ? 'bg-primary-foreground/20' : 'bg-secondary'}`}>{count}</span>}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default function Portal() {
  usePortalLight();
  const { id } = useParams();
  const { user, isLoadingAuth } = useAuth();
  const [params, setParams] = useSearchParams();
  const [portal, setPortal] = useState(undefined);
  const [docs, setDocs] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [customerView, setCustomerView] = useState(true);
  const [co, setCo] = useState(null);
  const [sowLine, setSowLine] = useState(null);
  const isCustomer = user?.role === 'customer';
  const load = useCallback(() => base44.portal.get(id).then(setPortal).catch(() => setPortal(null)), [id]);
  const loadDocs = useCallback(() => base44.portal.listDocs(id).then(setDocs).catch(() => setDocs([])), [id]);
  useEffect(() => { if (user) { load(); loadDocs(); } }, [user, load, loadDocs]);

  // Editors see the tables as the customer does unless they switch it off.
  const sections = useMemo(() => {
    if (!portal) return [];
    return portal.can_edit && customerView ? withoutHidden(portal.sections, portal.hidden_columns) : portal.sections;
  }, [portal, customerView]);
  const dash = useMemo(() => buildDashboard(sections), [sections]);

  const section = params.get('section') || 'overview';
  const go = useCallback((key, extra = {}) => {
    const next = new URLSearchParams();
    if (key !== 'overview') next.set('section', key);
    for (const [k, v] of Object.entries(extra)) if (v != null) next.set(k, v);
    setParams(next);
    setMenuOpen(false);
    window.scrollTo({ top: 0 });
  }, [setParams]);
  const setOpenDocId = (docId) => {
    const next = new URLSearchParams(params);
    if (docId) next.set('doc', docId); else next.delete('doc');
    setParams(next, { replace: true });
  };

  if (isLoadingAuth) return null;
  if (!user) return <Navigate to="/portal/login" replace />;

  const items = portal ? [
    { key: 'overview', label: 'Overview', icon: LayoutDashboard },
    { key: 'change-orders', label: 'Change orders', icon: FileDiff, count: dash.changeOrders.length },
    { key: 'sow', label: 'Scope of work', icon: ClipboardList, count: dash.sow.length },
    { key: 'invoicing', label: 'Invoicing', icon: Receipt, count: dash.invoices.length },
    { key: 'schedule', label: 'Schedule', icon: CalendarRange },
    { key: 'documents', label: 'Documents', icon: FolderOpen, count: docs?.length },
    ...(dash.sections.other.length ? [{ key: 'tables', label: 'More tables', icon: Table2, count: dash.sections.other.length }] : []),
    ...(portal.can_edit ? [{ key: 'manage', label: 'Manage', icon: Settings2 }] : []),
  ] : [];
  const current = items.some((x) => x.key === section) ? section : 'overview';

  const projectCard = portal && (
    <div className="px-3 pb-4 mb-3 border-b border-border">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" aria-hidden="true" /> {portal.customer ? `For ${portal.customer}` : 'Project portal'}</p>
      <p className="font-semibold leading-snug mt-1 break-words">{portal.name}</p>
      <p className="text-xs text-muted-foreground mt-0.5">Updated {fmtShort(portal.updated_date)}</p>
    </div>
  );
  const viewToggle = portal?.can_edit && (
    <div className="mt-4 mx-3 pt-3 border-t border-border">
      <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
        <input type="checkbox" checked={customerView} onChange={(e) => setCustomerView(e.target.checked)} className="mt-0.5 accent-[hsl(var(--primary))]" />
        <span>Show tables as the customer sees them (hidden columns removed)</span>
      </label>
    </div>
  );

  const header = (
    <header className="sticky top-0 z-40 bg-card/90 backdrop-blur border-b border-border" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div className="px-3 sm:px-5 h-14 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {portal && (
            <button type="button" onClick={() => setMenuOpen(true)} className="lg:hidden p-2 -ml-1 rounded-lg hover:bg-secondary" aria-label="Open menu">
              <Menu className="w-5 h-5" aria-hidden="true" />
            </button>
          )}
          {isCustomer ? (
            <>
              <img src={logo} alt="3 Phase Conveyor" className="h-7 sm:h-8 w-auto shrink-0" />
              <span className="hidden sm:inline text-sm font-semibold text-muted-foreground border-l border-border pl-2.5 truncate">Customer Portal</span>
            </>
          ) : (
            <Link to="/portal" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" aria-hidden="true" /> <span className="hidden sm:inline">All portals</span><span className="sm:hidden">Portals</span></Link>
          )}
        </div>
        {isCustomer
          ? <button type="button" onClick={() => base44.auth.logout('/portal/login')} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><LogOut className="w-4 h-4" aria-hidden="true" /> Sign out</button>
          : <AppSwitcher currentKey="portal" />}
      </div>
    </header>
  );

  let page = null;
  if (portal) {
    if (current === 'overview') page = <Overview portal={{ ...portal, sections }} dash={dash} docs={docs} go={go} openCo={setCo} />;
    else if (current === 'change-orders') page = <ChangeOrders dash={dash} initialStatus={params.get('status')} openCo={setCo} />;
    else if (current === 'sow') page = <ScopeOfWork dash={dash} openSow={setSowLine} />;
    else if (current === 'invoicing') page = <TablesView title="Invoicing" sections={dash.sections.invoicing ? [dash.sections.invoicing] : []} emptyText="No invoicing table in the project workbook." />;
    else if (current === 'schedule') page = <Schedule portal={portal} docs={docs} reloadDocs={loadDocs} />;
    else if (current === 'documents') page = <Documents portal={portal} docs={docs} reloadDocs={loadDocs} openDocId={params.get('doc')} setOpenDocId={setOpenDocId} />;
    else if (current === 'tables') page = <TablesView title="More tables" sections={dash.sections.other} emptyText="No other tables." />;
    else if (current === 'manage') page = <Manage portal={portal} reload={load} reloadDocs={loadDocs} />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {header}
      {portal === undefined ? (
        <div className="flex items-center gap-2 text-muted-foreground py-16 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Loading…</div>
      ) : portal === null ? (
        <div className="text-center py-16 text-sm text-muted-foreground">This portal doesn't exist or you don't have access to it.</div>
      ) : (
        <div className="flex">
          <aside className="hidden lg:block w-64 shrink-0 border-r border-border bg-card/50 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto py-5 px-3">
            {projectCard}
            <NavList items={items} current={current} onPick={go} />
            {viewToggle}
          </aside>
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetContent side="left" className="w-72 max-w-[85vw] p-0 pt-5 overflow-y-auto">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <SheetDescription className="sr-only">Portal sections</SheetDescription>
              <div className="px-3 pb-6">
                <div className="pr-8">{projectCard}</div>
                <NavList items={items} current={current} onPick={go} />
                {viewToggle}
              </div>
            </SheetContent>
          </Sheet>
          <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6 max-w-[1600px]">
            {page}
          </main>
        </div>
      )}

      <DetailPanel open={!!co} onClose={() => setCo(null)} title={co?.title || ''}
        description={co ? [co.ref, co.status === 'Pending' ? 'Pending approval' : 'Approved'].filter(Boolean).join(' · ') : ''}>
        {co && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <StatusBadge status={co.status} />
              {co.amount != null && <span className="text-xl font-bold tabular-nums">{money(co.amount, true)}</span>}
            </div>
            {co.description && <p className="text-sm whitespace-pre-line break-words">{co.description}</p>}
            <Fields fields={co.fields} />
          </div>
        )}
      </DetailPanel>
      <DetailPanel open={!!sowLine} onClose={() => setSowLine(null)} title={sowLine?.milestone || ''}
        description={sowLine ? [sowLine.scope && `${sowLine.scope} scope`, sowLine.line && `PO line ${sowLine.line}`].filter(Boolean).join(' · ') : ''}>
        {sowLine && (
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1.5 tabular-nums"><span>{money(sowLine.invoiced, true)} invoiced</span><span className="font-semibold">{pct(sowLine.pct)}</span></div>
              <Bar value={sowLine.pct} />
              <div className="text-xs text-muted-foreground mt-1.5 tabular-nums">{money(sowLine.remaining, true)} remaining of {money(sowLine.value, true)}</div>
            </div>
            <Fields fields={sowLine.fields} />
          </div>
        )}
      </DetailPanel>
    </div>
  );
}
