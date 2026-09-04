import React, { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { canRead, canEdit } from '@/lib/permissions';
import {
  Plus, Trash2, ChevronDown, Loader2, LayoutDashboard, Table2,
  Download, Upload, DollarSign, FolderPlus, CalendarPlus, Zap, Wrench,
  Package, Truck, Users, Pencil, FileText, Wallet, Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import logo from '@/assets/logo.jpg';
import AppSwitcher from '@/components/layout/AppSwitcher';
import ExpenseDashboard from '@/components/expenses/ExpenseDashboard';
import { exportExpensesCsv } from '@/lib/expensesExport';

const money = (n) => '$' + (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const num = (v) => (v === '' || v == null ? 0 : Number(v));

function budgetColor(pct) {
  if (pct >= 100) return 'hsl(0 72% 45%)';
  if (pct >= 85) return 'hsl(38 92% 50%)';
  return 'hsl(160 84% 34%)';
}

// The seven budgeted categories: key, label, icon, tint.
const BUDGET_CATS = [
  ['elec', 'Electrical Payroll', Zap, 'hsl(208 75% 42%)'],
  ['mech', 'Mechanical Payroll', Wrench, 'hsl(160 84% 34%)'],
  ['staff_elec', 'Staffing – Electrical', Users, 'hsl(230 60% 55%)'],
  ['staff_mech', 'Staffing – Mechanical', Users, 'hsl(190 65% 40%)'],
  ['materials_elec', 'Materials – Electrical', Package, 'hsl(38 92% 50%)'],
  ['materials_mech', 'Materials – Mechanical', Package, 'hsl(30 60% 45%)'],
  ['rental', 'Equipment Rental', Truck, 'hsl(280 45% 55%)'],
];

export default function Expenses() {
  const { user, loading } = useAuth();
  const [view, setView] = useState('table');
  const [summary, setSummary] = useState([]);
  const [categories, setCategories] = useState(['Materials – Electrical', 'Materials – Mechanical', 'Equipment Rental', 'Other']);
  const [loadingData, setLoadingData] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [budgetModal, setBudgetModal] = useState(null);
  const [importFor, setImportFor] = useState(null);

  const editable = canEdit(user, 'expenses');

  const load = useCallback((opts = {}) => {
    const { silent = false } = opts;
    if (!silent) setLoadingData(true);
    Promise.all([base44.expenses.summary(), base44.expenses.listCategories()])
      .then(([data, cats]) => {
        const list = Array.isArray(data) ? data : [];
        setSummary(list);
        if (Array.isArray(cats) && cats.length) setCategories(cats);
        setSelectedId((cur) => (cur && list.some((p) => p.id === cur)) ? cur : (list[0]?.id || null));
      })
      .catch(() => { if (!silent) toast.error('Failed to load expenses'); })
      .finally(() => { if (!silent) setLoadingData(false); });
  }, []);

  // Silent refresh — updates data + totals WITHOUT the loading spinner or any
  // remount, so editing a field never causes a visible page refresh/flicker.
  const refresh = useCallback(() => load({ silent: true }), [load]);

  useEffect(() => { if (canRead(user, 'expenses')) load(); }, [user, load]);

  if (loading) return null;
  if (!canRead(user, 'expenses')) return <Navigate to="/" replace />;

  const delProject = async (p) => {
    if (!confirm(`Delete project "${p.name}" and ALL its weeks and expenses?`)) return;
    try { await base44.expenses.deleteProject(p.id); refresh(); } catch { toast.error('Failed to delete'); }
  };
  const addWeek = async (projectId) => {
    const wk = prompt('Week ending date (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
    if (wk === null || !wk.trim()) return;
    try { await base44.expenses.addWeek({ project_id: projectId, week_ending: wk.trim() }); refresh(); }
    catch { toast.error('Failed to add week'); }
  };
  const saveWeek = async (w, patch) => {
    try { await base44.expenses.updateWeek(w.id, patch); refresh(); } catch { toast.error('Failed to save'); }
  };
  const delWeek = async (w) => {
    if (!confirm(`Delete the week ending ${w.week_ending} and its expenses?`)) return;
    try { await base44.expenses.deleteWeek(w.id); refresh(); } catch { toast.error('Failed to delete'); }
  };
  const addItem = async (weekId) => {
    try { await base44.expenses.addItem({ week_id: weekId, category: categories[0] || 'Other', amount: 0 }); refresh(); }
    catch { toast.error('Failed to add expense'); }
  };
  const saveItem = async (it, patch) => {
    try { await base44.expenses.updateItem(it.id, patch); refresh(); } catch { toast.error('Failed to save'); }
  };
  const delItem = async (it) => {
    try { await base44.expenses.deleteItem(it.id); refresh(); } catch { toast.error('Failed to delete'); }
  };
  const addCategory = async () => {
    const name = prompt('New expense category name:');
    if (name === null || !name.trim()) return;
    try { const r = await base44.expenses.addCategory(name.trim()); if (r?.name) setCategories((c) => [...c, r.name]); }
    catch { toast.error('Failed to add category'); }
  };
  const addCO = async (projectId) => {
    try { await base44.expenses.addChangeOrder({ project_id: projectId, co_number: '', man_hours: 0, equipment_total: 0, total: 0 }); refresh(); }
    catch { toast.error('Failed to add change order'); }
  };
  const saveCO = async (co, patch) => {
    try { await base44.expenses.updateChangeOrder(co.id, patch); refresh(); } catch { toast.error('Failed to save'); }
  };
  const delCO = async (co) => {
    if (!confirm(`Delete change order ${co.co_number || ''}?`)) return;
    try { await base44.expenses.deleteChangeOrder(co.id); refresh(); } catch { toast.error('Failed to delete'); }
  };

  const selected = summary.find((x) => x.id === selectedId) || summary[0] || null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 bg-card/80 backdrop-blur border-b border-border">
        <div className="max-w-7xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src={logo} alt="3 Phase Conveyor" className="h-7 w-auto" />
            <span className="text-sm font-semibold text-muted-foreground border-l border-border pl-2.5">Expense Tracking</span>
          </div>
          <AppSwitcher />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-5 py-6">
        <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Expense Tracking</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Weekly cost tracking — payroll, staffing, materials, rentals, and budget by project.</p>
          </div>
          <div className="flex items-center gap-2">
            {view === 'table' && summary.length > 0 && (
              <div className="relative">
                <select value={selectedId || ''} onChange={(e) => setSelectedId(e.target.value)}
                  className="appearance-none rounded-lg border border-border bg-card pl-3 pr-8 py-1.5 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer hover:bg-secondary transition">
                  {summary.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <ChevronDown className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
              </div>
            )}
            <div className="inline-flex rounded-lg border border-border overflow-hidden bg-card">
              <button onClick={() => setView('table')} className={`flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium transition ${view === 'table' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'}`}>
                <Table2 className="w-4 h-4" /> Entry
              </button>
              <button onClick={() => setView('dashboard')} className={`flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium border-l border-border transition ${view === 'dashboard' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'}`}>
                <LayoutDashboard className="w-4 h-4" /> Dashboard
              </button>
            </div>
            <button onClick={() => exportExpensesCsv(summary)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition" title="Export to Excel/CSV">
              <Download className="w-4 h-4" /> <span className="hidden sm:inline">Export</span>
            </button>
            {editable && (
              <button onClick={() => setBudgetModal('new')} className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold shadow-sm hover:brightness-110 transition">
                <FolderPlus className="w-4 h-4" /> New Project
              </button>
            )}
          </div>
        </div>

        {loadingData ? (
          <div className="flex items-center gap-2 text-muted-foreground py-16 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Loading…</div>
        ) : summary.length === 0 ? (
          <div className="text-center py-20 rounded-2xl border border-dashed border-border bg-card/50">
            <DollarSign className="w-10 h-10 mx-auto mb-3 opacity-25" />
            <p className="text-muted-foreground">No projects yet.</p>
            {editable && <button onClick={() => setBudgetModal('new')} className="mt-3 text-primary hover:underline text-sm font-medium">Create your first project</button>}
          </div>
        ) : view === 'dashboard' ? (
          <ExpenseDashboard summary={summary} />
        ) : selected ? (
          <ProjectCard project={selected} editable={editable} categories={categories}
            onAddWeek={addWeek} onSaveWeek={saveWeek} onDelWeek={delWeek}
            onAddItem={addItem} onSaveItem={saveItem} onDelItem={delItem}
            onDelProject={delProject} onEditBudget={() => setBudgetModal(selected)}
            onImport={() => setImportFor(selected)} onAddCategory={addCategory}
            onAddCO={addCO} onSaveCO={saveCO} onDelCO={delCO} />
        ) : null}
      </main>

      {budgetModal && (
        <BudgetModal project={budgetModal === 'new' ? null : budgetModal}
          onClose={() => setBudgetModal(null)} onSaved={() => { setBudgetModal(null); load(); }} />
      )}
      {importFor && (
        <ImportModal project={importFor} onClose={() => setImportFor(null)} onDone={() => { setImportFor(null); load(); }} />
      )}
    </div>
  );
}

function BudgetModal({ project, onClose, onSaved }) {
  const isNew = !project;
  const [name, setName] = useState(project?.name || '');
  const initial = {};
  for (const [key] of BUDGET_CATS) initial['budget_' + key] = project?.['budget_' + key] || '';
  const [b, setB] = useState(initial);
  const [saving, setSaving] = useState(false);
  const total = BUDGET_CATS.reduce((s, [key]) => s + num(b['budget_' + key]), 0);

  const save = async () => {
    if (isNew && !name.trim()) { toast.error('Enter a project name'); return; }
    setSaving(true);
    try {
      const payload = {};
      for (const [key] of BUDGET_CATS) payload['budget_' + key] = num(b['budget_' + key]);
      if (isNew) await base44.expenses.addProject({ name: name.trim(), ...payload });
      else await base44.expenses.updateProject(project.id, payload);
      onSaved();
    } catch { toast.error('Failed to save'); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-card border border-border shadow-xl p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-1">{isNew ? 'New Project' : `Budget — ${project.name}`}</h2>
        <p className="text-xs text-muted-foreground mb-4">Set a budget per category. The project budget is their sum.</p>
        {isNew && (
          <div className="mb-4">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Project name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus
              className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        )}
        <div className="space-y-2.5">
          {BUDGET_CATS.map(([key, label, Icon, tint]) => (
            <div key={key} className="flex items-center gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Icon className="w-4 h-4 flex-none" style={{ color: tint }} />
                <span className="text-sm truncate">{label}</span>
              </div>
              <div className="inline-flex items-center rounded-lg border border-border bg-background focus-within:ring-2 focus-within:ring-primary/30 w-36 flex-none">
                <span className="pl-2.5 text-muted-foreground text-sm">$</span>
                <input type="number" step="any" value={b['budget_' + key]} placeholder="0"
                  onChange={(e) => setB((s) => ({ ...s, ['budget_' + key]: e.target.value }))}
                  className="w-full bg-transparent outline-none px-2 py-2 text-sm tabular-nums text-right" />
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
          <span className="text-sm text-muted-foreground">Total budget</span>
          <span className="text-lg font-bold tabular-nums">{money(total)}</span>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-secondary">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold shadow-sm hover:brightness-110 disabled:opacity-50 flex items-center gap-1.5">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} {isNew ? 'Create' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Import modal: paste tab/comma separated weekly totals ----
const IMPORT_COLS = [
  ['week_ending', 'Week ending'], ['elec_pay', 'Elec pay'], ['elec_hours', 'Elec hrs'],
  ['mech_pay', 'Mech pay'], ['mech_hours', 'Mech hrs'],
  ['staff_elec_pay', 'Staff elec pay'], ['staff_elec_hours', 'Staff elec hrs'],
  ['staff_mech_pay', 'Staff mech pay'], ['staff_mech_hours', 'Staff mech hrs'],
  ['materials_elec', 'Materials elec'], ['materials_mech', 'Materials mech'], ['rental', 'Rental'],
];

function ImportModal({ project, onClose, onDone }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  // Parse pasted rows. Accepts tab (from Excel) or comma separated, one week per line.
  const parsed = (() => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const rows = [];
    for (const line of lines) {
      const cells = line.split(/\t|,/).map((c) => c.trim());
      if (!cells[0]) continue;
      // skip an obvious header row
      if (/week\s*end/i.test(cells[0])) continue;
      const row = {};
      IMPORT_COLS.forEach(([key], i) => { row[key] = cells[i] != null ? cells[i] : ''; });
      rows.push(row);
    }
    return rows;
  })();

  const doImport = async () => {
    if (!parsed.length) { toast.error('Nothing to import — paste some rows first'); return; }
    setSaving(true);
    try {
      const r = await base44.expenses.importWeeks(project.id, parsed);
      toast.success(`Imported ${r?.weeks_created ?? parsed.length} week(s)`);
      onDone();
    } catch { toast.error('Import failed'); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-card border border-border shadow-xl p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-1 flex items-center gap-2"><Upload className="w-5 h-5" /> Import weekly totals — {project.name}</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Paste one week per line, columns separated by tabs (copy straight from Excel) or commas, in this order:
        </p>
        <div className="text-[11px] bg-secondary/50 rounded-lg px-3 py-2 mb-3 overflow-x-auto whitespace-nowrap font-mono text-muted-foreground">
          {IMPORT_COLS.map(([, label]) => label).join('  ·  ')}
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} autoFocus
          placeholder={`2026-04-10\t19592\t500\t14000\t420\t0\t0\t0\t0\t3500\t1500\t2000`}
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-primary/30 resize-y" />
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-muted-foreground">{parsed.length} week{parsed.length === 1 ? '' : 's'} detected</span>
        </div>
        {parsed.length > 0 && (
          <div className="mt-3 rounded-lg border border-border overflow-x-auto max-h-40">
            <table className="w-full text-[11px]">
              <thead><tr className="bg-secondary/50 text-muted-foreground">{IMPORT_COLS.map(([, l]) => <th key={l} className="px-2 py-1 text-left font-medium whitespace-nowrap">{l}</th>)}</tr></thead>
              <tbody>
                {parsed.slice(0, 8).map((r, i) => (
                  <tr key={i} className="border-t border-border">{IMPORT_COLS.map(([key]) => <td key={key} className="px-2 py-1 tabular-nums whitespace-nowrap">{r[key] || '—'}</td>)}</tr>
                ))}
              </tbody>
            </table>
            {parsed.length > 8 && <div className="text-[11px] text-muted-foreground px-2 py-1">+{parsed.length - 8} more…</div>}
          </div>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-secondary">Cancel</button>
          <button onClick={doImport} disabled={saving || !parsed.length} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold shadow-sm hover:brightness-110 disabled:opacity-50 flex items-center gap-1.5">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Import {parsed.length || ''} week{parsed.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatTile({ icon: Icon, label, value, sub, tint, value_tint }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm relative overflow-hidden">
      <div className="absolute right-0 top-0 h-full w-1" style={{ backgroundColor: tint }} />
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
        <Icon className="w-4 h-4" style={{ color: tint }} />
      </div>
      <div className="text-2xl font-bold mt-1.5 tabular-nums" style={value_tint ? { color: value_tint } : undefined}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function CatBudget({ data, meta }) {
  const [, label, Icon, tint] = meta;
  const pct = data.budget > 0 ? Math.min(100, data.pct) : 0;
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="w-3.5 h-3.5 flex-none" style={{ color: tint }} />
        <span className="text-xs font-medium text-muted-foreground truncate">{label}</span>
      </div>
      <div className="text-base font-bold tabular-nums">{money(data.spend || 0)}</div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-1.5">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: data.budget > 0 ? budgetColor(data.pct) : 'hsl(var(--muted-foreground))' }} />
      </div>
      <div className="text-[11px] text-muted-foreground mt-1">
        {data.budget > 0 ? <>of {money(data.budget)} · <span style={{ color: budgetColor(data.pct) }} className="font-semibold">{data.pct}%</span></> : 'No budget set'}
      </div>
    </div>
  );
}

function ProjectCard({ project: p, editable, categories, onAddWeek, onSaveWeek, onDelWeek, onAddItem, onSaveItem, onDelItem, onDelProject, onEditBudget, onImport, onAddCategory, onAddCO, onSaveCO, onDelCO }) {
  const t = p.totals || {};
  const bud = p.budgets || {};
  return (
    <div className="space-y-5">
      {/* Project header + actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[140px]">
          <h2 className="font-bold text-xl leading-tight">{p.name}</h2>
          <div className="text-xs text-muted-foreground mt-0.5">{p.week_count} {p.week_count === 1 ? 'week' : 'weeks'} logged</div>
        </div>
        {editable && (
          <div className="flex items-center gap-1.5">
            <button onClick={() => onAddWeek(p.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition"><CalendarPlus className="w-4 h-4" /> Week</button>
            <button onClick={onImport} title="Import weekly totals" className="p-2 rounded-lg border border-border bg-card text-muted-foreground hover:text-primary hover:bg-secondary transition"><Upload className="w-4 h-4" /></button>
            <button onClick={onEditBudget} title="Edit budgets" className="p-2 rounded-lg border border-border bg-card text-muted-foreground hover:text-primary hover:bg-secondary transition"><Pencil className="w-4 h-4" /></button>
            <button onClick={() => onDelProject(p)} title="Delete project" className="p-2 rounded-lg border border-border bg-card text-muted-foreground hover:text-destructive hover:bg-secondary transition"><Trash2 className="w-4 h-4" /></button>
          </div>
        )}
      </div>

      {/* KPI stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile icon={DollarSign} label="Total spend" value={money(t.total)}
          sub={t.budget > 0 ? `of ${money(t.budget)} budget` : 'no budget set'} tint="hsl(208 75% 55%)" />
        <StatTile icon={Wallet} label="Budget used" value={t.budget > 0 ? `${t.budget_pct}%` : '—'}
          sub={t.budget > 0 ? `${money(t.budget_remaining)} remaining` : 'set budgets to track'}
          tint={t.budget > 0 ? budgetColor(t.budget_pct) : 'hsl(var(--muted-foreground))'}
          value_tint={t.budget > 0 ? budgetColor(t.budget_pct) : undefined} />
        <StatTile icon={Clock} label="Man hours" value={(t.hours || 0).toLocaleString()} sub="own crew + staffing" tint="hsl(38 92% 55%)" />
        <StatTile icon={Users} label="Payroll" value={money(t.payroll)} sub="own + staffing" tint="hsl(160 84% 42%)" />
      </div>

      {/* Budget vs. actual — distinct lighter panel */}
      <div className="rounded-2xl border border-border bg-secondary/40 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-1.5"><Wallet className="w-4 h-4 text-muted-foreground" /> Budget vs. Actual</h3>
          {editable && <button onClick={onEditBudget} className="text-xs text-primary hover:underline font-medium">Edit budgets</button>}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {BUDGET_CATS.map((meta) => <CatBudget key={meta[0]} data={bud[meta[0]] || {}} meta={meta} />)}
        </div>
      </div>

      {/* Weekly entry */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5"><CalendarPlus className="w-4 h-4" /> Weekly Entry</h3>
        <div className="space-y-4">
        {(p.weeks || []).length === 0 ? (
          <div className="text-sm text-muted-foreground px-1 py-2 rounded-xl border border-dashed border-border bg-card/40 text-center">
            No weeks yet.{editable && <> <button onClick={() => onAddWeek(p.id)} className="ml-1 text-primary hover:underline font-medium">Add a week</button> or <button onClick={onImport} className="text-primary hover:underline font-medium">import totals</button>.</>}
          </div>
        ) : (p.weeks || []).map((w) => (
          <WeekCard key={w.id} week={w} editable={editable} categories={categories}
            onSaveWeek={onSaveWeek} onDelWeek={onDelWeek}
            onAddItem={onAddItem} onSaveItem={onSaveItem} onDelItem={onDelItem} onAddCategory={onAddCategory} />
        ))}
        </div>
      </div>

      <ChangeOrders project={p} editable={editable} onAddCO={onAddCO} onSaveCO={onSaveCO} onDelCO={onDelCO} />
    </div>
  );
}

function ChangeOrders({ project: p, editable, onAddCO, onSaveCO, onDelCO }) {
  const co = p.change_orders || { list: [], totals: {} };
  const t = co.totals || {};
  return (
    <div className="rounded-xl border border-border bg-background overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-secondary/50 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Change Orders</span>
          <span className="text-xs text-muted-foreground">(tracked separately from project spend)</span>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="text-muted-foreground">Man hrs <span className="font-semibold text-foreground tabular-nums">{t.man_hours || 0}</span></span>
          <span className="text-muted-foreground">Equipment <span className="font-semibold text-foreground tabular-nums">{money(t.equipment_total)}</span></span>
          <span className="text-muted-foreground">Total <span className="font-bold text-foreground tabular-nums">{money(t.total)}</span></span>
          {editable && <button onClick={() => onAddCO(p.id)} className="text-primary hover:underline font-medium flex items-center gap-0.5"><Plus className="w-3 h-3" /> Add CO</button>}
        </div>
      </div>
      {co.list.length === 0 ? (
        <div className="text-xs text-muted-foreground px-4 py-2">No change orders.{editable && <button onClick={() => onAddCO(p.id)} className="ml-1 text-primary hover:underline">Add one</button>}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b border-border bg-secondary/20">
                <th className="text-left font-medium px-3 py-1.5 w-40">CO # / Name</th>
                <th className="text-left font-medium px-2 py-1.5 w-36">Date</th>
                <th className="text-left font-medium px-2 py-1.5 w-24">Man hrs</th>
                <th className="text-left font-medium px-2 py-1.5 w-32">Equipment $</th>
                <th className="text-left font-medium px-2 py-1.5 w-32">Total $</th>
                {editable && <th className="w-9"></th>}
              </tr>
            </thead>
            <tbody>
              {co.list.map((c, i) => (
                <tr key={c.id} className={`${i % 2 ? 'bg-secondary/30' : ''}`}>
                  <td className="px-3 py-1.5">
                    {editable ? <input defaultValue={c.co_number || ''} placeholder="CO #"
                      onBlur={(e) => (e.target.value || '') !== (c.co_number || '') && onSaveCO(c, { co_number: e.target.value })}
                      className="w-full bg-card border border-border rounded-lg px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/30" /> : <span className="font-medium">{c.co_number || '—'}</span>}
                  </td>
                  <td className="px-2 py-1.5">
                    {editable ? <input type="date" defaultValue={c.co_date || ''}
                      onBlur={(e) => (e.target.value || '') !== (c.co_date || '') && onSaveCO(c, { co_date: e.target.value })}
                      className="bg-card border border-border rounded-lg px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/30" /> : <span>{c.co_date || '—'}</span>}
                  </td>
                  <td className="px-2 py-1.5">
                    {editable ? <NumInput value={c.man_hours} onCommit={(v) => onSaveCO(c, { man_hours: v })} /> : <span className="tabular-nums">{c.man_hours}</span>}
                  </td>
                  <td className="px-2 py-1.5">
                    {editable ? <NumInput value={c.equipment_total} prefix="$" onCommit={(v) => onSaveCO(c, { equipment_total: v })} /> : <span className="tabular-nums">{money(c.equipment_total)}</span>}
                  </td>
                  <td className="px-2 py-1.5">
                    {editable ? <NumInput value={c.total} prefix="$" onCommit={(v) => onSaveCO(c, { total: v })} /> : <span className="tabular-nums font-medium">{money(c.total)}</span>}
                  </td>
                  {editable && <td className="pr-2 text-right"><button onClick={() => onDelCO(c)} className="text-muted-foreground hover:text-destructive transition"><Trash2 className="w-3.5 h-3.5" /></button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NumInput({ value, onCommit, prefix, className = '' }) {
  const [v, setV] = useState(value ?? 0);
  useEffect(() => { setV(value ?? 0); }, [value]);
  return (
    <div className={`inline-flex items-center rounded-lg border border-border bg-background focus-within:ring-2 focus-within:ring-primary/30 transition ${className}`}>
      {prefix && <span className="pl-2 text-muted-foreground text-xs">{prefix}</span>}
      <input type="number" step="any" value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={(e) => Number(e.target.value) !== Number(value) && onCommit(Number(e.target.value))}
        className="w-full bg-transparent outline-none px-2 py-1.5 text-sm tabular-nums" />
    </div>
  );
}

function PayrollBox({ label, icon: Icon, tint, pay, hours, editable, onPay, onHours }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="w-4 h-4 flex-none" style={{ color: tint }} />
        <span className="text-xs font-semibold uppercase tracking-wide truncate" style={{ color: tint }}>{label}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] text-muted-foreground">Amount</label>
          {editable ? <NumInput value={pay} prefix="$" className="w-full mt-0.5" onCommit={onPay} /> : <div className="text-sm tabular-nums font-medium mt-0.5">{money(pay)}</div>}
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground">Hours</label>
          {editable ? <NumInput value={hours} className="w-full mt-0.5" onCommit={onHours} /> : <div className="text-sm tabular-nums font-medium mt-0.5">{hours}</div>}
        </div>
      </div>
    </div>
  );
}

function WeekCard({ week: w, editable, categories, onSaveWeek, onDelWeek, onAddItem, onSaveItem, onDelItem, onAddCategory }) {
  const t = w.totals || {};
  return (
    <div className="rounded-xl border border-border bg-background overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-secondary/50 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <CalendarPlus className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Week ending</span>
          {editable ? (
            <input type="date" defaultValue={w.week_ending}
              onBlur={(e) => e.target.value !== w.week_ending && onSaveWeek(w, { week_ending: e.target.value })}
              className="bg-card border border-border rounded-lg px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
          ) : <span className="font-semibold text-sm">{w.week_ending}</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold tabular-nums">{money(t.total)}</span>
          {editable && <button onClick={() => onDelWeek(w)} title="Delete week" className="text-muted-foreground hover:text-destructive transition"><Trash2 className="w-3.5 h-3.5" /></button>}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Four payroll buckets */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <PayrollBox label="Electrical" icon={Zap} tint="hsl(208 75% 42%)" pay={w.elec_pay} hours={w.elec_hours} editable={editable}
            onPay={(v) => onSaveWeek(w, { elec_pay: v })} onHours={(v) => onSaveWeek(w, { elec_hours: v })} />
          <PayrollBox label="Mechanical" icon={Wrench} tint="hsl(160 84% 34%)" pay={w.mech_pay} hours={w.mech_hours} editable={editable}
            onPay={(v) => onSaveWeek(w, { mech_pay: v })} onHours={(v) => onSaveWeek(w, { mech_hours: v })} />
          <PayrollBox label="Staffing Elec" icon={Users} tint="hsl(230 60% 55%)" pay={w.staff_elec_pay} hours={w.staff_elec_hours} editable={editable}
            onPay={(v) => onSaveWeek(w, { staff_elec_pay: v })} onHours={(v) => onSaveWeek(w, { staff_elec_hours: v })} />
          <PayrollBox label="Staffing Mech" icon={Users} tint="hsl(190 65% 40%)" pay={w.staff_mech_pay} hours={w.staff_mech_hours} editable={editable}
            onPay={(v) => onSaveWeek(w, { staff_mech_pay: v })} onHours={(v) => onSaveWeek(w, { staff_mech_hours: v })} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Expenses &amp; Rentals</span>
            {editable && (
              <div className="flex items-center gap-3">
                <button onClick={onAddCategory} className="text-xs text-muted-foreground hover:text-primary transition">+ Category</button>
                <button onClick={() => onAddItem(w.id)} className="text-xs text-primary hover:underline font-medium flex items-center gap-0.5"><Plus className="w-3 h-3" /> Add line</button>
              </div>
            )}
          </div>
          {(w.items || []).length === 0 ? (
            <div className="text-xs text-muted-foreground px-1 py-1">No expense lines this week.</div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  {w.items.map((it, i) => (
                    <tr key={it.id} className={`${i % 2 ? 'bg-secondary/30' : ''}`}>
                      <td className="py-1.5 px-2 w-48">
                        {editable ? (
                          <select defaultValue={it.category} onChange={(e) => onSaveItem(it, { category: e.target.value })}
                            className="bg-card border border-border rounded-lg px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/30 w-full">
                            {[...new Set([it.category, ...categories])].map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        ) : <span className="font-medium">{it.category}</span>}
                      </td>
                      <td className="py-1.5 px-2">
                        {editable ? (
                          <input defaultValue={it.description || ''} placeholder="Description"
                            onBlur={(e) => (e.target.value || '') !== (it.description || '') && onSaveItem(it, { description: e.target.value })}
                            className="w-full bg-card border border-border rounded-lg px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
                        ) : <span className="text-muted-foreground">{it.description || '—'}</span>}
                      </td>
                      <td className="py-1.5 px-2 w-32">
                        {editable ? <NumInput value={it.amount} prefix="$" onCommit={(v) => onSaveItem(it, { amount: v })} /> : <span className="tabular-nums font-medium">{money(it.amount)}</span>}
                      </td>
                      {editable && <td className="w-9 pr-2 text-right"><button onClick={() => onDelItem(it)} className="text-muted-foreground hover:text-destructive transition"><Trash2 className="w-3.5 h-3.5" /></button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-5 text-xs pt-2 border-t border-border flex-wrap">
          <span className="text-muted-foreground">Payroll <span className="font-semibold text-foreground tabular-nums">{money(t.payroll)}</span></span>
          <span className="text-muted-foreground">Expenses <span className="font-semibold text-foreground tabular-nums">{money(t.items_total)}</span></span>
          <span className="text-muted-foreground">Hours <span className="font-semibold text-foreground tabular-nums">{t.hours}</span></span>
          <span className="text-muted-foreground">Week total <span className="font-bold text-foreground tabular-nums">{money(t.total)}</span></span>
        </div>

        {/* Weekly notes */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes</label>
          {editable ? (
            <textarea defaultValue={w.notes || ''} rows={2} placeholder="Notes for this week…"
              onBlur={(e) => (e.target.value || '') !== (w.notes || '') && onSaveWeek(w, { notes: e.target.value })}
              className="w-full mt-1 bg-card border border-border rounded-lg px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 resize-y" />
          ) : (w.notes ? <p className="text-sm mt-1 whitespace-pre-wrap">{w.notes}</p> : <p className="text-sm mt-1 text-muted-foreground">—</p>)}
        </div>
      </div>
    </div>
  );
}
