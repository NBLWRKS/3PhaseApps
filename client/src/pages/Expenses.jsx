import React, { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { canRead, canEdit } from '@/lib/permissions';
import {
  Plus, Trash2, ChevronDown, ChevronRight, Loader2, BarChart3, Table2,
  Download, DollarSign, FolderPlus, CalendarPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import logo from '@/assets/logo.jpg';
import AppSwitcher from '@/components/layout/AppSwitcher';
import ExpenseDashboard from '@/components/expenses/ExpenseDashboard';
import { exportExpensesCsv } from '@/lib/expensesExport';

const money = (n) => '$' + (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const money2 = (n) => '$' + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function budgetColor(pct) {
  if (pct >= 100) return '#C0392B';
  if (pct >= 85) return '#E8B33D';
  return '#2E7D5B';
}

export default function Expenses() {
  const { user, loading } = useAuth();
  const [view, setView] = useState('table');
  const [summary, setSummary] = useState([]);
  const [categories, setCategories] = useState(['Equipment Rental', 'Materials', 'Other']);
  const [loadingData, setLoadingData] = useState(true);
  const [expanded, setExpanded] = useState(() => new Set());

  const editable = canEdit(user, 'expenses');

  const load = useCallback(() => {
    setLoadingData(true);
    Promise.all([base44.expenses.summary(), base44.expenses.listCategories()])
      .then(([data, cats]) => {
        setSummary(Array.isArray(data) ? data : []);
        if (Array.isArray(cats) && cats.length) setCategories(cats);
        setExpanded((prev) => {
          if (prev.size > 0) return prev;
          const s = new Set();
          for (const p of data || []) s.add(`p:${p.id}`);
          return s;
        });
      })
      .catch(() => toast.error('Failed to load expenses'))
      .finally(() => setLoadingData(false));
  }, []);

  useEffect(() => { if (canRead(user, 'expenses')) load(); }, [user, load]);

  if (loading) return null;
  if (!canRead(user, 'expenses')) return <Navigate to="/" replace />;

  const toggle = (key) => setExpanded((prev) => {
    const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s;
  });

  const addProject = async () => {
    const name = prompt('New project name:');
    if (name === null || !name.trim()) return;
    const budgetStr = prompt('Budget for this project (optional — leave blank for none):', '');
    const budget = budgetStr ? Number(budgetStr.replace(/[^0-9.]/g, '')) : 0;
    try { await base44.expenses.addProject({ name: name.trim(), budget }); load(); }
    catch { toast.error('Failed to add project'); }
  };
  const editBudget = async (p) => {
    const budgetStr = prompt(`Budget for "${p.name}" (blank = none):`, p.budget || '');
    if (budgetStr === null) return;
    const budget = budgetStr ? Number(budgetStr.replace(/[^0-9.]/g, '')) : 0;
    try { await base44.expenses.updateProject(p.id, { budget }); load(); }
    catch { toast.error('Failed to update budget'); }
  };
  const delProject = async (p) => {
    if (!confirm(`Delete project "${p.name}" and ALL its weeks and expenses?`)) return;
    try { await base44.expenses.deleteProject(p.id); load(); } catch { toast.error('Failed to delete'); }
  };
  const addWeek = async (projectId) => {
    const wk = prompt('Week ending date (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
    if (wk === null || !wk.trim()) return;
    try { await base44.expenses.addWeek({ project_id: projectId, week_ending: wk.trim() }); load(); }
    catch { toast.error('Failed to add week'); }
  };
  const saveWeek = async (w, patch) => {
    try { await base44.expenses.updateWeek(w.id, patch); load(); } catch { toast.error('Failed to save'); }
  };
  const delWeek = async (w) => {
    if (!confirm(`Delete the week ending ${w.week_ending} and its expenses?`)) return;
    try { await base44.expenses.deleteWeek(w.id); load(); } catch { toast.error('Failed to delete'); }
  };
  const addItem = async (weekId) => {
    try { await base44.expenses.addItem({ week_id: weekId, category: categories[0] || 'Other', amount: 0 }); load(); }
    catch { toast.error('Failed to add expense'); }
  };
  const saveItem = async (it, patch) => {
    try { await base44.expenses.updateItem(it.id, patch); load(); } catch { toast.error('Failed to save'); }
  };
  const delItem = async (it) => {
    try { await base44.expenses.deleteItem(it.id); load(); } catch { toast.error('Failed to delete'); }
  };
  const addCategory = async () => {
    const name = prompt('New expense category name:');
    if (name === null || !name.trim()) return;
    try { const r = await base44.expenses.addCategory(name.trim()); if (r?.name) setCategories((c) => [...c, r.name]); }
    catch { toast.error('Failed to add category'); }
  };

  const grandTotal = summary.reduce((s, p) => s + (p.totals?.total || 0), 0);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 bg-card border-b border-border">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={logo} alt="3 Phase Conveyor" className="h-7 w-auto" />
            <span className="text-sm font-semibold text-muted-foreground border-l border-border pl-2">Expense Tracking</span>
          </div>
          <AppSwitcher />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between gap-2 mb-5 flex-wrap">
          <div className="flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold">Expense Tracking</h1>
            {summary.length > 0 && (
              <span className="text-sm text-muted-foreground ml-2">Total: <span className="font-semibold text-foreground">{money(grandTotal)}</span></span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-border overflow-hidden">
              <button onClick={() => setView('table')} className={`flex items-center gap-1.5 px-3 py-1.5 text-sm ${view === 'table' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'}`}>
                <Table2 className="w-4 h-4" /> Table
              </button>
              <button onClick={() => setView('dashboard')} className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border-l border-border ${view === 'dashboard' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'}`}>
                <BarChart3 className="w-4 h-4" /> Dashboard
              </button>
            </div>
            <button onClick={() => exportExpensesCsv(summary)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary" title="Export to Excel/CSV">
              <Download className="w-4 h-4" /> <span className="hidden sm:inline">Export</span>
            </button>
            {editable && (
              <button onClick={addProject} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
                <FolderPlus className="w-4 h-4" /> Project
              </button>
            )}
          </div>
        </div>

        {loadingData ? (
          <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Loading…</div>
        ) : summary.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <DollarSign className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No projects yet.</p>
            {editable && <button onClick={addProject} className="mt-3 text-primary hover:underline text-sm">Add your first project</button>}
          </div>
        ) : view === 'dashboard' ? (
          <ExpenseDashboard summary={summary} />
        ) : (
          <div className="space-y-4">
            {summary.map((p) => (
              <ProjectBlock key={p.id} project={p} editable={editable} categories={categories}
                expanded={expanded} toggle={toggle}
                onAddWeek={addWeek} onSaveWeek={saveWeek} onDelWeek={delWeek}
                onAddItem={addItem} onSaveItem={saveItem} onDelItem={delItem}
                onDelProject={delProject} onEditBudget={editBudget} onAddCategory={addCategory} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function BudgetBar({ totals }) {
  if (!totals.budget) return <span className="text-xs text-muted-foreground">No budget set</span>;
  const pct = Math.min(100, totals.budget_pct);
  return (
    <div className="flex items-center gap-2 min-w-[160px]">
      <div className="flex-1 h-2 rounded-full bg-neutral-200 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: budgetColor(totals.budget_pct) }} />
      </div>
      <span className="text-xs font-semibold tabular-nums whitespace-nowrap" style={{ color: budgetColor(totals.budget_pct) }}>
        {totals.budget_pct}%
      </span>
    </div>
  );
}

function ProjectBlock({ project: p, editable, categories, expanded, toggle, onAddWeek, onSaveWeek, onDelWeek, onAddItem, onSaveItem, onDelItem, onDelProject, onEditBudget, onAddCategory }) {
  const open = expanded.has(`p:${p.id}`);
  const t = p.totals || {};
  return (
    <div className="border border-border rounded-xl bg-card overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 bg-secondary/40 flex-wrap">
        <button onClick={() => toggle(`p:${p.id}`)} className="text-muted-foreground">
          {open ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
        </button>
        <span className="font-bold text-lg flex-1 truncate min-w-[120px]">{p.name}</span>
        <div className="text-sm text-right">
          <div className="font-bold">{money(t.total)}</div>
          <div className="text-xs text-muted-foreground">
            {t.budget ? `of ${money(t.budget)} · ${money(t.budget_remaining)} left` : `${t.hours || 0} hrs`}
          </div>
        </div>
        <div className="w-44"><BudgetBar totals={t} /></div>
        {editable && (
          <div className="flex items-center gap-1">
            <button onClick={() => onAddWeek(p.id)} title="Add week" className="p-1.5 text-muted-foreground hover:text-primary"><CalendarPlus className="w-4 h-4" /></button>
            <button onClick={() => onEditBudget(p)} title="Set budget" className="p-1.5 text-muted-foreground hover:text-primary text-xs font-semibold">$</button>
            <button onClick={() => onDelProject(p)} title="Delete project" className="p-1.5 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
          </div>
        )}
      </div>

      {open && (
        <div className="p-3 space-y-3">
          {(p.weeks || []).length === 0 && (
            <div className="text-sm text-muted-foreground px-1">
              No weeks yet.{editable && <button onClick={() => onAddWeek(p.id)} className="ml-2 text-primary hover:underline">Add a week</button>}
            </div>
          )}
          {(p.weeks || []).map((w) => (
            <WeekCard key={w.id} week={w} editable={editable} categories={categories}
              onSaveWeek={onSaveWeek} onDelWeek={onDelWeek}
              onAddItem={onAddItem} onSaveItem={onSaveItem} onDelItem={onDelItem} onAddCategory={onAddCategory} />
          ))}
        </div>
      )}
    </div>
  );
}

function NumInput({ value, onCommit, prefix, className = '' }) {
  const [v, setV] = useState(value ?? 0);
  useEffect(() => { setV(value ?? 0); }, [value]);
  return (
    <div className={`inline-flex items-center rounded border border-border bg-white focus-within:ring-1 focus-within:ring-primary/40 ${className}`}>
      {prefix && <span className="pl-1.5 text-neutral-400 text-xs">{prefix}</span>}
      <input type="number" step="any" value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={(e) => Number(e.target.value) !== Number(value) && onCommit(Number(e.target.value))}
        className="w-full bg-transparent outline-none px-1.5 py-1 text-sm text-neutral-900 tabular-nums" />
    </div>
  );
}

function WeekCard({ week: w, editable, categories, onSaveWeek, onDelWeek, onAddItem, onSaveItem, onDelItem, onAddCategory }) {
  const t = w.totals || {};
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-secondary/30 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Week ending</span>
          {editable ? (
            <input type="date" defaultValue={w.week_ending}
              onBlur={(e) => e.target.value !== w.week_ending && onSaveWeek(w, { week_ending: e.target.value })}
              className="bg-white border border-border rounded px-1.5 py-0.5 text-sm text-neutral-900" />
          ) : <span className="font-semibold text-sm">{w.week_ending}</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold">{money(t.total)}</span>
          {editable && <button onClick={() => onDelWeek(w)} title="Delete week" className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>}
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* Payroll grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border p-2">
            <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1.5">Electrical Payroll</div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground w-8">$</label>
              {editable ? <NumInput value={w.elec_pay} prefix="$" className="flex-1" onCommit={(v) => onSaveWeek(w, { elec_pay: v })} /> : <span className="text-sm tabular-nums">{money(w.elec_pay)}</span>}
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <label className="text-xs text-muted-foreground w-8">hrs</label>
              {editable ? <NumInput value={w.elec_hours} className="flex-1" onCommit={(v) => onSaveWeek(w, { elec_hours: v })} /> : <span className="text-sm tabular-nums">{w.elec_hours}</span>}
            </div>
          </div>
          <div className="rounded-lg border border-border p-2">
            <div className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1.5">Mechanical Payroll</div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground w-8">$</label>
              {editable ? <NumInput value={w.mech_pay} prefix="$" className="flex-1" onCommit={(v) => onSaveWeek(w, { mech_pay: v })} /> : <span className="text-sm tabular-nums">{money(w.mech_pay)}</span>}
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <label className="text-xs text-muted-foreground w-8">hrs</label>
              {editable ? <NumInput value={w.mech_hours} className="flex-1" onCommit={(v) => onSaveWeek(w, { mech_hours: v })} /> : <span className="text-sm tabular-nums">{w.mech_hours}</span>}
            </div>
          </div>
        </div>

        {/* Expense line items */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Expenses &amp; Rentals</span>
            {editable && (
              <div className="flex items-center gap-2">
                <button onClick={onAddCategory} className="text-xs text-muted-foreground hover:text-primary">+ Category</button>
                <button onClick={() => onAddItem(w.id)} className="text-xs text-primary hover:underline flex items-center gap-0.5"><Plus className="w-3 h-3" /> Add line</button>
              </div>
            )}
          </div>
          {(w.items || []).length === 0 ? (
            <div className="text-xs text-muted-foreground px-1 py-1">No expense lines this week.</div>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {w.items.map((it) => (
                  <tr key={it.id} className="border-b border-border last:border-0">
                    <td className="py-1 pr-2 w-40">
                      {editable ? (
                        <select defaultValue={it.category} onChange={(e) => onSaveItem(it, { category: e.target.value })}
                          className="bg-white border border-border rounded px-1 py-0.5 text-sm text-neutral-900 w-full">
                          {[...new Set([it.category, ...categories])].map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      ) : <span>{it.category}</span>}
                    </td>
                    <td className="py-1 pr-2">
                      {editable ? (
                        <input defaultValue={it.description || ''} placeholder="Description"
                          onBlur={(e) => (e.target.value || '') !== (it.description || '') && onSaveItem(it, { description: e.target.value })}
                          className="w-full bg-white border border-border rounded px-1.5 py-0.5 text-sm text-neutral-900" />
                      ) : <span className="text-muted-foreground">{it.description || '—'}</span>}
                    </td>
                    <td className="py-1 w-28">
                      {editable ? <NumInput value={it.amount} prefix="$" onCommit={(v) => onSaveItem(it, { amount: v })} /> : <span className="tabular-nums">{money(it.amount)}</span>}
                    </td>
                    {editable && <td className="w-8 text-right"><button onClick={() => onDelItem(it)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Week summary line */}
        <div className="flex items-center justify-end gap-4 text-xs text-muted-foreground pt-1 border-t border-border">
          <span>Payroll: <span className="font-semibold text-foreground">{money(t.payroll)}</span></span>
          <span>Expenses: <span className="font-semibold text-foreground">{money(t.items_total)}</span></span>
          <span>Hours: <span className="font-semibold text-foreground">{t.hours}</span></span>
          <span>Week total: <span className="font-bold text-foreground">{money(t.total)}</span></span>
        </div>
      </div>
    </div>
  );
}
