import React, { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { canRead, canEdit } from '@/lib/permissions';
import {
  Plus, Trash2, ChevronDown, Loader2, LayoutDashboard, Table2,
  Download, DollarSign, FolderPlus, CalendarPlus, Zap, Wrench, Package, Truck,
  Clock, TrendingUp, Pencil,
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

const CAT_META = {
  elec: { label: 'Electrical Payroll', icon: Zap, tint: 'hsl(208 75% 42%)' },
  mech: { label: 'Mechanical Payroll', icon: Wrench, tint: 'hsl(160 84% 34%)' },
  materials: { label: 'Materials', icon: Package, tint: 'hsl(38 92% 50%)' },
  rental: { label: 'Equipment Rental', icon: Truck, tint: 'hsl(280 45% 55%)' },
};

export default function Expenses() {
  const { user, loading } = useAuth();
  const [view, setView] = useState('table');
  const [summary, setSummary] = useState([]);
  const [categories, setCategories] = useState(['Equipment Rental', 'Materials', 'Other']);
  const [loadingData, setLoadingData] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [budgetModal, setBudgetModal] = useState(null);

  const editable = canEdit(user, 'expenses');

  const load = useCallback(() => {
    setLoadingData(true);
    Promise.all([base44.expenses.summary(), base44.expenses.listCategories()])
      .then(([data, cats]) => {
        const list = Array.isArray(data) ? data : [];
        setSummary(list);
        if (Array.isArray(cats) && cats.length) setCategories(cats);
        // Keep the current selection if it still exists; otherwise pick the first.
        setSelectedId((cur) => (cur && list.some((p) => p.id === cur)) ? cur : (list[0]?.id || null));
      })
      .catch(() => toast.error('Failed to load expenses'))
      .finally(() => setLoadingData(false));
  }, []);

  useEffect(() => { if (canRead(user, 'expenses')) load(); }, [user, load]);

  if (loading) return null;
  if (!canRead(user, 'expenses')) return <Navigate to="/" replace />;

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
  const grandBudget = summary.reduce((s, p) => s + (p.totals?.budget || 0), 0);
  const grandHours = summary.reduce((s, p) => s + (p.totals?.hours || 0), 0);
  const grandPayroll = summary.reduce((s, p) => s + (p.totals?.payroll || 0), 0);

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
            <p className="text-sm text-muted-foreground mt-0.5">Weekly cost tracking across projects — payroll, materials, rentals, and budget.</p>
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

        {summary.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <KpiTile icon={DollarSign} label="Total spend" value={money(grandTotal)}
              sub={grandBudget > 0 ? `of ${money(grandBudget)} budget` : null}
              accent={grandBudget > 0 ? budgetColor(Math.round(grandTotal / grandBudget * 100)) : undefined} />
            <KpiTile icon={TrendingUp} label="Total payroll" value={money(grandPayroll)} />
            <KpiTile icon={Clock} label="Total hours" value={grandHours.toLocaleString()} />
            <KpiTile icon={FolderPlus} label="Projects" value={summary.length} />
          </div>
        )}

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
        ) : (() => {
          const p = summary.find((x) => x.id === selectedId) || summary[0];
          if (!p) return null;
          return (
            <ProjectCard key={p.id} project={p} editable={editable} categories={categories}
              onAddWeek={addWeek} onSaveWeek={saveWeek} onDelWeek={delWeek}
              onAddItem={addItem} onSaveItem={saveItem} onDelItem={delItem}
              onDelProject={delProject} onEditBudget={() => setBudgetModal(p)} onAddCategory={addCategory} />
          );
        })()}
      </main>

      {budgetModal && (
        <BudgetModal
          project={budgetModal === 'new' ? null : budgetModal}
          onClose={() => setBudgetModal(null)}
          onSaved={() => { setBudgetModal(null); load(); }}
        />
      )}
    </div>
  );
}

function KpiTile({ icon: Icon, label, value, sub, accent }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
        <Icon className="w-4 h-4 text-muted-foreground/60" />
      </div>
      <div className="text-2xl font-bold mt-1.5 tabular-nums" style={accent ? { color: accent } : undefined}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function BudgetModal({ project, onClose, onSaved }) {
  const isNew = !project;
  const [name, setName] = useState(project?.name || '');
  const [b, setB] = useState({
    budget_elec: project?.budget_elec || '',
    budget_mech: project?.budget_mech || '',
    budget_materials: project?.budget_materials || '',
    budget_rental: project?.budget_rental || '',
  });
  const [saving, setSaving] = useState(false);
  const total = num(b.budget_elec) + num(b.budget_mech) + num(b.budget_materials) + num(b.budget_rental);

  const save = async () => {
    if (isNew && !name.trim()) { toast.error('Enter a project name'); return; }
    setSaving(true);
    try {
      const payload = {
        budget_elec: num(b.budget_elec), budget_mech: num(b.budget_mech),
        budget_materials: num(b.budget_materials), budget_rental: num(b.budget_rental),
      };
      if (isNew) await base44.expenses.addProject({ name: name.trim(), ...payload });
      else await base44.expenses.updateProject(project.id, payload);
      onSaved();
    } catch { toast.error('Failed to save'); setSaving(false); }
  };

  const fields = [
    ['budget_elec', 'Electrical Payroll', Zap],
    ['budget_mech', 'Mechanical Payroll', Wrench],
    ['budget_materials', 'Materials', Package],
    ['budget_rental', 'Equipment Rental', Truck],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-card border border-border shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
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
          {fields.map(([key, label, Icon]) => (
            <div key={key} className="flex items-center gap-3">
              <div className="flex items-center gap-2 flex-1">
                <Icon className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">{label}</span>
              </div>
              <div className="inline-flex items-center rounded-lg border border-border bg-background focus-within:ring-2 focus-within:ring-primary/30 w-40">
                <span className="pl-2.5 text-muted-foreground text-sm">$</span>
                <input type="number" step="any" value={b[key]} placeholder="0"
                  onChange={(e) => setB((s) => ({ ...s, [key]: e.target.value }))}
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

function CatBudget({ data, meta }) {
  const Icon = meta.icon;
  const pct = data.budget > 0 ? Math.min(100, data.pct) : 0;
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="w-3.5 h-3.5" style={{ color: meta.tint }} />
        <span className="text-xs font-medium text-muted-foreground">{meta.label}</span>
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

function ProjectCard({ project: p, editable, categories, onAddWeek, onSaveWeek, onDelWeek, onAddItem, onSaveItem, onDelItem, onDelProject, onEditBudget, onAddCategory }) {
  const t = p.totals || {};
  const bud = p.budgets || {};
  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 flex-wrap">
        <div className="flex-1 min-w-[140px]">
          <div className="font-bold text-lg leading-tight">{p.name}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{p.week_count} {p.week_count === 1 ? 'week' : 'weeks'} · {t.hours || 0} hrs</div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold tabular-nums">{money(t.total)}</div>
          <div className="text-xs text-muted-foreground">
            {t.budget > 0 ? <>of {money(t.budget)} · <span style={{ color: budgetColor(t.budget_pct) }} className="font-semibold">{t.budget_pct}%</span></> : 'no budget'}
          </div>
        </div>
        {editable && (
          <div className="flex items-center gap-1 ml-2">
            <button onClick={() => onAddWeek(p.id)} title="Add week" className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-secondary transition"><CalendarPlus className="w-4 h-4" /></button>
            <button onClick={onEditBudget} title="Edit budgets" className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-secondary transition"><Pencil className="w-4 h-4" /></button>
            <button onClick={() => onDelProject(p)} title="Delete project" className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-secondary transition"><Trash2 className="w-4 h-4" /></button>
          </div>
        )}
      </div>

      <div className="px-5 pb-5 space-y-4 border-t border-border pt-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <CatBudget data={bud.elec || {}} meta={CAT_META.elec} />
            <CatBudget data={bud.mech || {}} meta={CAT_META.mech} />
            <CatBudget data={bud.materials || {}} meta={CAT_META.materials} />
            <CatBudget data={bud.rental || {}} meta={CAT_META.rental} />
          </div>

          {(p.weeks || []).length === 0 ? (
            <div className="text-sm text-muted-foreground px-1 py-2">
              No weeks yet.{editable && <button onClick={() => onAddWeek(p.id)} className="ml-2 text-primary hover:underline font-medium">Add a week</button>}
            </div>
          ) : (p.weeks || []).map((w) => (
            <WeekCard key={w.id} week={w} editable={editable} categories={categories}
              onSaveWeek={onSaveWeek} onDelWeek={onDelWeek}
              onAddItem={onAddItem} onSaveItem={onSaveItem} onDelItem={onDelItem} onAddCategory={onAddCategory} />
          ))}
        </div>
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
        <div className="grid grid-cols-2 gap-3">
          <PayrollBox label="Electrical Payroll" icon={Zap} tint="hsl(208 75% 42%)"
            pay={w.elec_pay} hours={w.elec_hours} editable={editable}
            onPay={(v) => onSaveWeek(w, { elec_pay: v })} onHours={(v) => onSaveWeek(w, { elec_hours: v })} />
          <PayrollBox label="Mechanical Payroll" icon={Wrench} tint="hsl(160 84% 34%)"
            pay={w.mech_pay} hours={w.mech_hours} editable={editable}
            onPay={(v) => onSaveWeek(w, { mech_pay: v })} onHours={(v) => onSaveWeek(w, { mech_hours: v })} />
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
                      <td className="py-1.5 px-2 w-44">
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
      </div>
    </div>
  );
}

function PayrollBox({ label, icon: Icon, tint, pay, hours, editable, onPay, onHours }) {
  const m = (n) => '$' + (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="w-4 h-4" style={{ color: tint }} />
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: tint }}>{label}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] text-muted-foreground">Amount</label>
          {editable ? <NumInput value={pay} prefix="$" className="w-full mt-0.5" onCommit={onPay} /> : <div className="text-sm tabular-nums font-medium mt-0.5">{m(pay)}</div>}
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground">Hours</label>
          {editable ? <NumInput value={hours} className="w-full mt-0.5" onCommit={onHours} /> : <div className="text-sm tabular-nums font-medium mt-0.5">{hours}</div>}
        </div>
      </div>
    </div>
  );
}
